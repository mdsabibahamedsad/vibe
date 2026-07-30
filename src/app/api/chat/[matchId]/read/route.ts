import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { requireChatAccess } from "@/features/chat/services/chat-access.service";
import { markMessagesRead } from "@/features/chat/services/message.service";

/**
 * POST /api/chat/[matchId]/read — Mark all messages in a chat as read.
 *
 * Uses a conversation-level read marker approach:
 *  - Updates message-level status to "read" for messages from the other user
 *  - Updates the user's last_read_at in conversation_members
 *
 * Body: { lastReadMessageId?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  try {
    const user = await getCurrentUser(request);
    const { matchId } = await params;

    const body = await request.json().catch(() => ({}));
    const lastReadMessageId = body.lastReadMessageId as string | undefined;

    // Verify chat access
    const access = await requireChatAccess(user.id, matchId);

    // Mark messages as read
    await markMessagesRead(access.conversationId!, user.id, lastReadMessageId);

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to mark as read" }, { status: 500 });
  }
}
