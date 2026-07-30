import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { canAccessChat } from "@/features/chat/services/chat-access.service";

/**
 * GET /api/chat/access/[matchId] — Check chat access and get conversation info.
 *
 * Returns:
 *  - allowed: boolean
 *  - conversationId: string | null
 *  - otherUser: { id, displayName, age, avatarUrl, city }
 *  - reason: string (if not allowed)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  try {
    const user = await getCurrentUser(request);
    const { matchId } = await params;

    const access = await canAccessChat(user.id, matchId);

    return NextResponse.json(access);
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to check chat access" }, { status: 500 });
  }
}
