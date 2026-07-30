import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  getNotifications,
  markAllNotificationsRead,
} from "@/features/notifications/services/notification.service";
import { notificationListSchema } from "@/lib/notifications/schemas";
import { notificationListRateLimiter, notificationMarkReadRateLimiter } from "@/lib/notifications/services/throttle.service";

/**
 * GET /api/notifications — Get notifications for the current user.
 *
 * Supports cursor pagination and optional category filtering.
 * Returns enriched notifications with actor info.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    await notificationListRateLimiter.enforce(user.id);

    const url = new URL(request.url);
    const parsed = notificationListSchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid parameters", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await getNotifications(
      user.id,
      parsed.data.cursor,
      parsed.data.limit,
      parsed.data.category,
    );

    return NextResponse.json(result);
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  }
}

/**
 * POST /api/notifications — Mark all notifications as read.
 *
 * Body: {} (empty) or { action: "mark_all_read" }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    await notificationMarkReadRateLimiter.enforce(user.id);

    const count = await markAllNotificationsRead(user.id);

    return NextResponse.json({ success: true, count });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to mark notifications as read" }, { status: 500 });
  }
}
