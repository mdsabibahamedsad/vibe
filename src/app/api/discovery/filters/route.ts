import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getPreferences, upsertPreferences } from "@/lib/services/profile-service";
import { preferencesSchema } from "@/lib/validation/profile";
import { AppError } from "@/lib/errors";

/**
 * GET /api/discovery/filters — Get current discovery filter preferences.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const preferences = await getPreferences(user.id);

    return NextResponse.json({ preferences });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: err.toSafeResponse().error },
        { status: err.statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to get filters" }, { status: 500 });
  }
}

/**
 * PUT /api/discovery/filters — Update discovery filter preferences.
 *
 * Changing filters resets the discovery cursor on the frontend.
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const parsed = preferencesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const preferences = await upsertPreferences(user.id, parsed.data);

    // Track filter change
    const { trackEvent } = await import("@/lib/analytics");
    await trackEvent(user.id, "filter_changed", "discovery", undefined, {
      minAge: parsed.data.minAge,
      maxAge: parsed.data.maxAge,
      maxDistanceKm: parsed.data.maxDistanceKm,
      datingIntent: parsed.data.datingIntent,
    }).catch(() => {});

    return NextResponse.json({ preferences });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: err.toSafeResponse().error },
        { status: err.statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to update filters" }, { status: 500 });
  }
}
