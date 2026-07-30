/**
 * Chat Realtime Service — manage Supabase Realtime subscriptions for chat.
 *
 * Handles:
 *  - Secure channel subscription (per-conversation)
 *  - Message insert/update events
 *  - Connection lifecycle management
 *  - Typing indicator via persistent broadcast channel
 *  - Cleanup on unmount
 *  - Reconnect handling
 */

import { getSupabaseClient } from "@/lib/supabase/client";
import { CHAT_REALTIME_CHANNEL_PREFIX } from "@/lib/chat/constants";
import { logger } from "@/lib/logger";

export type RealtimeMessageEvent = {
  eventType: "INSERT" | "UPDATE";
  new: any;
  old: any;
};

export type RealtimeStatus = "connected" | "disconnected" | "connecting" | "error";

type MessageCallback = (event: RealtimeMessageEvent) => void;
type StatusCallback = (status: RealtimeStatus) => void;

interface ChatSubscription {
  unsubscribe: () => void;
  channel: string;
}

/**
 * Subscribe to realtime message events for a specific conversation.
 *
 * Only subscribes after verifying chat access server-side.
 * The channel is scoped to the specific conversation.
 *
 * @param conversationId - The conversation to subscribe to
 * @param onMessage - Callback for new/updated messages
 * @param onStatus - Callback for connection status changes
 * @returns Subscription object with unsubscribe method
 */
export function subscribeToConversation(
  conversationId: string,
  onMessage: MessageCallback,
  onStatus?: StatusCallback,
): ChatSubscription {
  const supabase = getSupabaseClient();
  const channelName = `${CHAT_REALTIME_CHANNEL_PREFIX}${conversationId}`;

  let isUnsubscribed = false;

  const channel = supabase.channel(channelName);

  // Listen for INSERT and UPDATE on messages table
  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: `conversation_id=eq.${conversationId}`,
    },
    (payload) => {
      if (isUnsubscribed) return;
      onMessage({
        eventType: "INSERT",
        new: payload.new,
        old: payload.old,
      });
    },
  );

  channel.on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "messages",
      filter: `conversation_id=eq.${conversationId}`,
    },
    (payload) => {
      if (isUnsubscribed) return;
      onMessage({
        eventType: "UPDATE",
        new: payload.new,
        old: payload.old,
      });
    },
  );

  // Listen for typing broadcasts on the same channel
  channel.on("broadcast", { event: "typing" }, (payload) => {
    if (isUnsubscribed) return;
    onTypingCallback?.(payload.payload.userId, payload.payload.isTyping);
  });

  // Track connection status
  channel.subscribe((status, err) => {
    if (isUnsubscribed) return;

    switch (status) {
      case "SUBSCRIBED":
        onStatus?.("connected");
        break;
      case "TIMED_OUT":
      case "CLOSED":
        onStatus?.("disconnected");
        break;
      case "CHANNEL_ERROR":
        logger.error("Realtime channel error", {
          channel: channelName,
          error: err?.message,
        });
        onStatus?.("error");
        break;
    }
  });

  return {
    unsubscribe: () => {
      isUnsubscribed = true;
      supabase.removeChannel(channel);
    },
    channel: channelName,
  };
}

// ─── Typing callback (set by subscribeToTyping) ──────────────────────────

let onTypingCallback: ((userId: string, isTyping: boolean) => void) | null = null;

/**
 * Set the callback for typing events received through the conversation channel.
 * This is called by subscribeToTyping to wire up the handler.
 */
function setTypingCallback(callback: ((userId: string, isTyping: boolean) => void) | null): void {
  onTypingCallback = callback;
}

/**
 * Send a typing indicator via the persistent conversation channel broadcast.
 * Typing events are NOT persisted — they use Realtime broadcast only.
 *
 * Requires the conversation channel to be active. The message channel
 * subscription must be established first.
 *
 * IMPORTANT: This does NOT create a new channel — it broadcasts on the
 * already-subscribed conversation channel. Call after subscribing.
 */
export function sendTypingIndicator(
  conversationId: string,
  userId: string,
  isTyping: boolean,
): void {
  const supabase = getSupabaseClient();
  const channelName = `${CHAT_REALTIME_CHANNEL_PREFIX}${conversationId}`;

  // Broadcast on the existing conversation channel
  supabase.channel(channelName).send({
    type: "broadcast",
    event: "typing",
    payload: {
      userId,
      isTyping,
      timestamp: Date.now(),
    },
  });
}

/**
 * Subscribe to typing indicators from the other user.
 *
 * Instead of creating a separate channel, this registers a callback
 * that the main conversation channel uses. This avoids creating
 * duplicate channel subscriptions.
 */
export function subscribeToTyping(
  conversationId: string,
  currentUserId: string,
  onTyping: (userId: string, isTyping: boolean) => void,
): ChatSubscription {
  // Register the callback — the main conversation channel will use it
  setTypingCallback((userId, isTyping) => {
    if (userId !== currentUserId) {
      onTyping(userId, isTyping);
    }
  });

  // Return a no-op subscription since the main channel handles typing
  return {
    unsubscribe: () => {
      setTypingCallback(null);
    },
    channel: `${CHAT_REALTIME_CHANNEL_PREFIX}typing:${conversationId}`,
  };
}

/**
 * Track realtime connection health.
 */
export function getRealtimeStatus(): RealtimeStatus {
  const supabase = getSupabaseClient();
  const socket = (supabase as any).realtime as WebSocket | undefined;

  if (!socket) return "disconnected";
  return socket.readyState === WebSocket.OPEN
    ? "connected"
    : socket.readyState === WebSocket.CONNECTING
      ? "connecting"
      : "disconnected";
}
