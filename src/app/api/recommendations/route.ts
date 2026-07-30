/**
 * GET /api/recommendations — Get intelligent recommendations.
 *
 * Wraps Prompt 12's discovery system with:
 *   - Normalized feature scoring
 *   - Mutual compatibility calculation
 *   - Diversity reranking (MMR)
 *   - Exploration injection
 *   - Impression tracking
 *
 * Query params:
 *   mode       — "social" | "dating" (default: "dating")
 *   query      — Search text (social mode)
 *   cursor     — Pagination cursor
 *   limit      — Page size (default: 20)
 *   requestId  — Optional request grouping ID
 *
 * Response:
 *   { items, nextCursor, hasMore, requestId, rankingVersion }
 *
 * Each item includes:
 *   - profile data (from Prompt 12 discovery)
 *   - compatibility badge
 *   - recommendation reasons
 *   - score (internal, not shown to users; used for UI feedback)
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getRecommendations } from "@/lib/recommendation/recommendation.service";
import { AppError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    const url = new URL(request.url);
    const mode = (url.searchParams.get("mode") ?? "dating") as "social" | "dating";
    const query = url.searchParams.get("query") ?? undefined;
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limit = url.searchParams.get("limit")
      ? parseInt(url.searchParams.get("limit")!, 10)
      : undefined;
    const requestId = url.searchParams.get("requestId") ?? undefined;

    // Validate mode
    if (mode !== "social" && mode !== "dating") {
      return NextResponse.json(
        { error: "Mode must be 'social' or 'dating'" },
        { status: 400 },
      );
    }

    const result = await getRecommendations({
      mode,
      viewerId: user.id,
      query,
      cursor,
      limit,
      requestId,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode || 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to get recommendations" },
      { status: 500 },
    );
  }
}
