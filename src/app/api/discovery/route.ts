import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { discoverProfiles, getDiscoveryCandidates } from "@/lib/discovery/discovery.service";
import { discoveryRequestSchema, discoveryCursorSchema } from "@/lib/discovery/schemas";

/**
 * GET /api/discovery — Unified Search + Discovery endpoint.
 *
 * Supports two modes:
 *   social — Text search + interest-based discovery (find people)
 *   dating — Dating compatibility discovery (existing pipeline)
 *
 * Query parameters:
 *   mode       — "social" | "dating" (default: "social")
 *   query      — Search text (for social mode)
 *   cursor     — Pagination cursor
 *   limit      — Page size (default: 20, max: 50)
 *   sort       — "recommended" | "nearby" | "recent" (social mode)
 *   interests  — Comma-separated interest IDs (social mode)
 *   maxDistance — Max distance in km
 *
 * For dating mode, age/gender filters are derived from stored preferences.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") ?? "social";
    const query = url.searchParams.get("query") ?? undefined;
    const sort = url.searchParams.get("sort") ?? "recommended";
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limit = url.searchParams.get("limit") ?? undefined;
    const maxDistance = url.searchParams.get("maxDistance") ?? undefined;
    const interestsParam = url.searchParams.get("interests") ?? undefined;

    if (mode === "dating") {
      // Dating mode — use the existing pipeline
      const parsed = discoveryCursorSchema.safeParse({ cursor, limit });

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid pagination parameters", details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const result = await getDiscoveryCandidates(user.id, parsed.data);
      return NextResponse.json(result);
    }

    // Social mode — unified discovery
    const parsed = discoveryRequestSchema.safeParse({
      mode: "social",
      query: query && query.length >= 2 ? query : undefined,
      sort,
      cursor,
      limit,
      filters: {
        maxDistanceKm: maxDistance ? parseInt(maxDistance, 10) : undefined,
        interestIds: interestsParam ? interestsParam.split(",").filter(Boolean) : undefined,
      },
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid search parameters", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Validate query length
    if (parsed.data.query && parsed.data.query.length < 2) {
      return NextResponse.json(
        { error: "Search query must be at least 2 characters" },
        { status: 400 },
      );
    }

    const result = await discoverProfiles(user.id, parsed.data);

    return NextResponse.json(result);
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to load results" }, { status: 500 });
  }
}
