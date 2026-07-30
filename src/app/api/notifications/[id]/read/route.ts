import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { markNotificationRead } from "@/features/notifications/services/notification.service";
import { notificationMarkReadRateLimiter } from "@/lib/notifications/services/throttle.service";

/**
 * POST /api/notifications/[id]/read — Mark a notification as read.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser(request);
    await notificationMarkReadRateLimiter.enforce(user.id);
    const { id } = await params;

    await markNotificationRead(id, user.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to mark notification as read" }, { status: 500 });
  }
}
