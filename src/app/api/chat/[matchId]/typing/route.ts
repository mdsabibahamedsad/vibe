import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { requireChatAccess } from "@/features/chat/services/chat-access.service";
import { sendTypingIndicator } from "@/features/chat/services/chat-realtime.service";
import { typingSchema } from "@/lib/chat/schemas";
import { RateLimiter } from "@/lib/rate-limiter";

// Typing events are throttled client-side, but add a server-side limit too
const typingRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  name: "chat_typing",
});

/**
 * POST /api/chat/[matchId]/typing — Send a typing indicator.
 *
 * Typing events are NOT persisted to the database.
 * They use Supabase Realtime broadcast for ephemeral delivery.
 *
 * Body: { isTyping: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  try {
    const user = await getCurrentUser(request);
    const { matchId } = await params;

    const body = await request.json();
    const parsed = typingSchema.safeParse({ ...body, matchId });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid typing data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Rate limit typing events
    try {
      await typingRateLimiter.enforce(user.id);
    } catch {
      return NextResponse.json({ success: true }); // Silently ignore rate-limited typing
    }

    // Verify chat access (lightweight check)
    const access = await requireChatAccess(user.id, matchId);

    // Send typing indicator via broadcast
    sendTypingIndicator(access.conversationId!, user.id, parsed.data.isTyping);

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to send typing indicator" }, { status: 500 });
  }
}
