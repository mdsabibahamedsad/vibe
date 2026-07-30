import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { requireChatAccess } from "@/features/chat/services/chat-access.service";
import { sendMessage, getMessages, markMessagesDelivered } from "@/features/chat/services/message.service";
import { sendMessageSchema, messageListSchema } from "@/lib/chat/schemas";

/**
 * GET /api/chat/[matchId]/messages — Get messages for a match chat.
 *
 * Supports cursor-based pagination for scroll-up loading.
 * Messages are returned in chronological order.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  try {
    const user = await getCurrentUser(request);
    const { matchId } = await params;

    const url = new URL(request.url);
    const parsed = messageListSchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid parameters", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Verify chat access
    const access = await requireChatAccess(user.id, matchId);

    // Get messages
    const result = await getMessages(
      access.conversationId!,
      user.id,
      parsed.data.cursor,
      parsed.data.limit,
    );

    // Fire-and-forget: mark received messages as delivered
    markMessagesDelivered(access.conversationId!, user.id).catch(() => {});

    return NextResponse.json(result);
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}

/**
 * POST /api/chat/[matchId]/messages — Send a message in a match chat.
 *
 * Body: { messageType, textContent?, mediaId?, replyToMessageId?, clientMessageId? }
 *
 * The server:
 *  1. Authenticates user
 *  2. Validates chat access
 *  3. Validates message input
 *  4. Sends message with idempotency support
 *  5. Returns the authoritative message
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  try {
    const user = await getCurrentUser(request);
    const { matchId } = await params;

    const body = await request.json();
    const parsed = sendMessageSchema.safeParse({ ...body, matchId });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid message data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Verify chat access
    const access = await requireChatAccess(user.id, matchId);

    // Send message
    const message = await sendMessage({
      conversationId: access.conversationId!,
      senderId: user.id,
      messageType: parsed.data.messageType,
      textContent: parsed.data.textContent,
      mediaId: parsed.data.mediaId,
      replyToMessageId: parsed.data.replyToMessageId,
      clientMessageId: parsed.data.clientMessageId,
    });

    return NextResponse.json({ success: true, message }, { status: 201 });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
