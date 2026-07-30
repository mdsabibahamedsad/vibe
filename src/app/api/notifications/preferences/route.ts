import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getNotificationPreferences, updateNotificationPreferences } from "@/features/notifications/services/notification-preference.service";
import { notificationPreferencesSchema } from "@/lib/notifications/schemas";
import { AppError } from "@/lib/errors";
import { notificationPreferencesRateLimiter } from "@/lib/notifications/services/throttle.service";

/**
 * GET /api/notifications/preferences — Get notification preferences.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    // GET (read) doesn't need rate limiting for preferences

    const preferences = await getNotificationPreferences(user.id);

    return NextResponse.json({ preferences });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to load preferences" }, { status: 500 });
  }
}

/**
 * PUT /api/notifications/preferences — Update notification preferences.
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    await notificationPreferencesRateLimiter.enforce(user.id);
    const body = await request.json();

    const parsed = notificationPreferencesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid preferences data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const preferences = await updateNotificationPreferences(user.id, parsed.data);

    return NextResponse.json({ preferences });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
  }
}
