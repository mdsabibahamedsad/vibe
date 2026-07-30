import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { deleteMessage } from "@/features/chat/services/message.service";

/**
 * DELETE /api/chat/[matchId]/messages/[messageId] — Soft-delete a message.
 *
 * Only the message sender can delete their own message.
 * Uses soft deletion (sets deleted_at) instead of removing the row.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string; messageId: string }> },
) {
  try {
    const user = await getCurrentUser(request);
    const { messageId } = await params;

    await deleteMessage(messageId, user.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 });
  }
}
