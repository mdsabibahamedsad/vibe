import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getUnreadCount } from "@/features/notifications/services/notification.service";

/**
 * GET /api/notifications/unread-count — Get unread notification counts.
 *
 * Returns:
 *   { total: number, messages: number, dating: number, social: number }
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    const counts = await getUnreadCount(user.id);

    return NextResponse.json(counts);
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to get unread count" }, { status: 500 });
  }
}
