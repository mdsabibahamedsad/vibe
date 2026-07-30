/**
 * Message Service — send, list, and delete match chat messages.
 *
 * All operations use the admin client (service-role) with explicit
 * server-side authorization checks. RLS is bypassed intentionally
 * via the security-definer DB functions for performance.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, notFoundError, authorizationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";
import { MESSAGE_PAGE_SIZE } from "@/lib/chat/constants";
import { RateLimiter } from "@/lib/rate-limiter";
import type { MessageResponse, MessageListResponse } from "@/lib/chat/schemas";

// ─── Types ───────────────────────────────────────────────────────────────

export interface SendMessageParams {
  conversationId: string;
  senderId: string;
  messageType: "text" | "image" | "video";
  textContent?: string;
  mediaId?: string;
  replyToMessageId?: string;
  clientMessageId?: string;
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────

const messageRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
  name: "chat_message",
});

// ─── Send Message ────────────────────────────────────────────────────────

/**
 * Send a message in a match chat.
 *
 * All authorization checks MUST be done by the caller before calling this.
 * This function assumes access has already been verified.
 */
export async function sendMessage(params: SendMessageParams): Promise<MessageResponse> {
  const adminClient = createAdminClient();

  // Rate limit
  await messageRateLimiter.enforce(params.senderId);

  // Validate text content
  if (params.messageType === "text" && (!params.textContent || !params.textContent.trim())) {
    throw new AppError("VALIDATION_ERROR", "Message text is required", {
      statusCode: 400,
    });
  }

  // Validate media ownership if media message
  if (params.mediaId) {
    const { data: media } = await adminClient
      .from("media")
      .select("id, owner_id, processing_status")
      .eq("id", params.mediaId)
      .single();

    if (!media) {
      throw new AppError("VALIDATION_ERROR", "Media not found", {
        statusCode: 400,
      });
    }

    if (media.owner_id !== params.senderId) {
      throw authorizationError("You can only attach your own media");
    }

    if (media.processing_status !== "ready") {
      throw new AppError("VALIDATION_ERROR", "Media is not ready yet", {
        statusCode: 400,
      });
    }
  }

  // Validate reply target belongs to the same conversation
  if (params.replyToMessageId) {
    const { data: replyTarget } = await adminClient
      .from("messages")
      .select("id, conversation_id")
      .eq("id", params.replyToMessageId)
      .single();

    if (!replyTarget) {
      throw new AppError("VALIDATION_ERROR", "Reply target not found", {
        statusCode: 400,
      });
    }

    if (replyTarget.conversation_id !== params.conversationId) {
      throw new AppError("VALIDATION_ERROR", "Reply target is in a different conversation", {
        statusCode: 400,
      });
    }
  }

  // Insert the message
  const { data: message, error: insertError } = await adminClient
    .from("messages")
    .insert({
      conversation_id: params.conversationId,
      sender_id: params.senderId,
      message_type: params.messageType,
      content: params.textContent?.trim() ?? null,
      reply_to_id: params.replyToMessageId ?? null,
      client_message_id: params.clientMessageId ?? null,
    })
    .select()
    .single();

  if (insertError || !message) {
    // Check for idempotency conflict
    if (insertError?.code === "23505" && params.clientMessageId) {
      // Duplicate client_message_id — this is a retry, get the existing message
      const { data: existingMessage } = await adminClient
        .from("messages")
        .select("*")
        .eq("conversation_id", params.conversationId)
        .eq("sender_id", params.senderId)
        .eq("client_message_id", params.clientMessageId)
        .single();

      if (existingMessage) {
        return enrichMessage(existingMessage, params.senderId);
      }
    }

    logger.error("Failed to insert message", { error: insertError?.message });
    throw new AppError("INTERNAL_ERROR", "Failed to send message", {
      statusCode: 500,
    });
  }

  // If media, create attachment
  if (params.mediaId) {
    await adminClient.from("message_attachments").insert({
      message_id: message.id,
      media_id: params.mediaId,
    });
  }

  // Update conversation's last_activity_at
  await adminClient
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", params.conversationId);

  // Update match's last_activity_at
  const { data: conv } = await adminClient
    .from("conversations")
    .select("match_id")
    .eq("id", params.conversationId)
    .single();

  if (conv?.match_id) {
    await adminClient
      .from("matches")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", conv.match_id);
  }

  // Track analytics
  const eventName =
    params.messageType === "image"
      ? "image_message_sent"
      : params.messageType === "video"
        ? "video_message_sent"
        : "message_sent";

  await trackEvent(params.senderId, eventName, "message", message.id).catch(() => {});

  return enrichMessage(message, params.senderId);
}

// ─── Get Messages (Cursor Pagination) ────────────────────────────────────

/**
 * Get messages for a conversation with cursor-based pagination.
 *
 * Messages are returned in chronological order (oldest first for display).
 * The cursor points to the oldest message in the current page to fetch older ones.
 *
 * Strategy: Fetch messages older than the cursor, reverse them for display.
 */
export async function getMessages(
  conversationId: string,
  currentUserId: string,
  cursor?: string,
  limit: number = MESSAGE_PAGE_SIZE,
): Promise<MessageListResponse> {
  const adminClient = createAdminClient();

  let query = adminClient
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  // Cursor: "createdAt_messageId" — fetch messages older than this
  if (cursor) {
    const parts = cursor.split("_");
    const cursorCreatedAt = parts[0];
    const cursorId = parts.slice(1).join("_");

    query = query.lt("created_at", cursorCreatedAt).or(
      `and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`,
    );
  }

  const { data: messages, error } = await query;

  if (error) {
    logger.error("Failed to fetch messages", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to load messages", {
      statusCode: 500,
    });
  }

  const hasMore = (messages?.length ?? 0) > limit;
  const pageMessages = (messages ?? []).slice(0, limit);

  // Reverse to chronological order for display
  pageMessages.reverse();

  // Build next cursor (oldest message in this page)
  const oldestMessage = pageMessages[0];
  const nextCursor = hasMore && oldestMessage
    ? `${oldestMessage.created_at}_${oldestMessage.id}`
    : null;

  // Enrich messages
  const enriched = await Promise.all(
    pageMessages.map((msg) => enrichMessage(msg, currentUserId)),
  );

  return {
    messages: enriched,
    nextCursor,
    hasMore,
  };
}

// ─── Delete Message ──────────────────────────────────────────────────────

/**
 * Soft-delete a message. Only the sender can delete their own message.
 */
export async function deleteMessage(
  messageId: string,
  userId: string,
): Promise<void> {
  const adminClient = createAdminClient();

  const { data: message } = await adminClient
    .from("messages")
    .select("id, sender_id")
    .eq("id", messageId)
    .single();

  if (!message) throw notFoundError("Message not found");
  if (message.sender_id !== userId) {
    throw authorizationError("You can only delete your own messages");
  }

  const { error } = await adminClient
    .from("messages")
    .update({
      deleted_at: new Date().toISOString(),
      content: null,
    })
    .eq("id", messageId);

  if (error) {
    logger.error("Failed to delete message", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to delete message", {
      statusCode: 500,
    });
  }

  await trackEvent(userId, "message_deleted", "message", messageId).catch(() => {});
}

// ─── Enrichment ──────────────────────────────────────────────────────────

/**
 * Enrich a raw message row into a MessageResponse.
 */
async function enrichMessage(
  msg: any,
  currentUserId: string,
): Promise<MessageResponse> {
  const adminClient = createAdminClient();

  // Get sender info
  const { data: sender } = await adminClient
    .from("users")
    .select("id, display_name, avatar_media_id")
    .eq("id", msg.sender_id)
    .single();

  // Get reply preview if replying
  let replyPreview: { senderName: string; text: string } | null = null;

  if (msg.reply_to_id) {
    const { data: replyMsg } = await adminClient
      .from("messages")
      .select("sender_id, content, message_type")
      .eq("id", msg.reply_to_id)
      .single();

    if (replyMsg) {
      const { data: replySender } = await adminClient
        .from("users")
        .select("display_name")
        .eq("id", replyMsg.sender_id)
        .single();

      replyPreview = {
        senderName: replySender?.display_name ?? "Unknown",
        text: replyMsg.message_type === "text"
          ? (replyMsg.content?.slice(0, 100) ?? "")
          : replyMsg.message_type === "image"
            ? "📷 Photo"
            : "🎬 Video",
      };
    }
  }

  const isOwn = msg.sender_id === currentUserId;

  return {
    id: msg.id,
    matchId: "", // Will be filled by caller
    senderId: msg.sender_id,
    messageType: msg.message_type,
    textContent: msg.deleted_at ? null : msg.content,
    mediaId: null, // TODO: fetch from message_attachments
    replyToMessageId: msg.reply_to_id,
    replyPreview,
    status: msg.deleted_at ? ("deleted" as any) : (msg.status ?? "sent"),
    deliveredAt: msg.delivered_at,
    readAt: msg.read_at,
    createdAt: msg.created_at,
    isOwn,
    sender: {
      id: msg.sender_id,
      displayName: sender?.display_name ?? "Unknown",
      avatarUrl: sender?.avatar_media_id ?? null,
    },
  };
}

// ─── Mark Messages as Delivered ─────────────────────────────────────────

/**
 * Mark messages as delivered for the current user.
 * Called when the user opens the chat and receives messages.
 */
export async function markMessagesDelivered(
  conversationId: string,
  currentUserId: string,
): Promise<void> {
  const adminClient = createAdminClient();

  const now = new Date().toISOString();

  const { error } = await adminClient
    .from("messages")
    .update({ status: "delivered", delivered_at: now })
    .eq("conversation_id", conversationId)
    .neq("sender_id", currentUserId)
    .eq("status", "sent");

  if (error) {
    logger.error("Failed to mark messages as delivered", {
      error: error.message,
    });
  }
}

// ─── Mark Messages as Read ──────────────────────────────────────────────

/**
 * Mark messages as read for the current user.
 * Uses a two-step process with a conversation-level read marker.
 * Also updates message-level read status for the other user's analytics.
 */
export async function markMessagesRead(
  conversationId: string,
  currentUserId: string,
  lastReadMessageId?: string,
): Promise<void> {
  const adminClient = createAdminClient();

  const now = new Date().toISOString();

  // Step 1: Update message-level read state for messages from other user
  const { error } = await adminClient
    .from("messages")
    .update({ status: "read", read_at: now })
    .eq("conversation_id", conversationId)
    .neq("sender_id", currentUserId)
    .in("status", ["sent", "delivered"]);

  if (error) {
    logger.error("Failed to mark messages as read", {
      error: error.message,
    });
  }

  // Step 2: Update conversation member's last_read_at
  await adminClient
    .from("conversation_members")
    .update({ last_read_at: now })
    .eq("conversation_id", conversationId)
    .eq("user_id", currentUserId);

  // Track analytics
  await trackEvent(currentUserId, "message_read", "conversation", conversationId).catch(() => {});
}
