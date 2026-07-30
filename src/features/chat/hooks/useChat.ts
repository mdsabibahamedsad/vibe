"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";
import type { MessageResponse, MessageListResponse } from "@/lib/chat/schemas";
import { subscribeToConversation } from "@/features/chat/services/chat-realtime.service";
import type { RealtimeStatus } from "@/features/chat/services/chat-realtime.service";

export interface OtherUserInfo {
  id: string;
  displayName: string;
  age: number | null;
  avatarUrl: string | null;
  city: string | null;
}

interface UseChatReturn {
  messages: MessageResponse[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  realtimeStatus: RealtimeStatus;
  otherUser: OtherUserInfo | null;
  conversationId: string | null;
  sendMessage: (params: {
    messageType: "text" | "image" | "video";
    textContent?: string;
    mediaId?: string;
    replyToMessageId?: string;
  }) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  markAsRead: () => Promise<void>;
  setReplyTo: (messageId: string | null) => void;
  replyToMessage: MessageResponse | null;
}

/**
 * Hook for managing a match chat conversation.
 *
 * Handles:
 *  - Initial message loading
 *  - Cursor pagination (load older messages)
 *  - Sending messages with optimistic updates
 *  - Realtime message subscription
 *  - Connection status tracking
 *  - Marking messages as read/delivered
 *  - Message deletion
 *  - Reply-to-message state
 */
export function useChat(matchId: string): UseChatReturn {
  const [messages, setMessages] = useState<MessageResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");
  const [otherUser, setOtherUser] = useState<OtherUserInfo | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [replyToMessage, setReplyToState] = useState<MessageResponse | null>(null);

  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const hasTrackedOpenRef = useRef(false);
  const messagesRef = useRef<MessageResponse[]>([]);

  // Keep messagesRef in sync for non-stale callbacks
  messagesRef.current = messages;

  // ─── Fetch messages ───────────────────────────────────────────────────

  const fetchMessages = useCallback(
    async (cursor?: string) => {
      const params = new URLSearchParams();
      params.set("limit", "30");
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/chat/${matchId}/messages?${params.toString()}`);

      if (!res.ok) {
        const result = await res.json().catch(() => ({ error: "Failed to load messages" }));
        throw new Error(result.error || "Failed to load messages");
      }

      return (await res.json()) as MessageListResponse;
    },
    [matchId],
  );

  // ─── Check access and get conversation info ───────────────────────────

  const checkAccess = useCallback(async () => {
    const res = await fetch(`/api/chat/access/${matchId}`);

    if (!res.ok) {
      const result = await res.json().catch(() => ({ error: "Access denied" }));
      throw new Error(result.error || "Access denied");
    }

    const data = await res.json();
    return data;
  }, [matchId]);

  // ─── Load initial messages ────────────────────────────────────────────

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // First check access
      const access = await checkAccess();

      if (!access.allowed) {
        throw new Error(access.reason || "Access denied");
      }

      setOtherUser(access.otherUser);
      setConversationId(access.conversationId);

      // Track chat opened (once per session)
      if (!hasTrackedOpenRef.current && access.conversationId) {
        hasTrackedOpenRef.current = true;
        trackEvent(access.otherUser?.id ?? "", "chat_opened", "match", matchId).catch(() => {});
      }

      // Load messages
      const data = await fetchMessages();
      setMessages(data.messages);
      cursorRef.current = data.nextCursor;
      setHasMore(data.hasMore);
    } catch (err) {
      logger.error("Chat load error", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      setError(err instanceof Error ? err.message : "Failed to load chat");
    } finally {
      setLoading(false);
    }
  }, [checkAccess, fetchMessages, matchId]);

  // ─── Load more (older messages) ───────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !cursorRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);

    try {
      const data = await fetchMessages(cursorRef.current!);
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newMessages = data.messages.filter((m) => !existingIds.has(m.id));
        return [...newMessages, ...prev];
      });
      cursorRef.current = data.nextCursor;
      setHasMore(data.hasMore);
    } catch (err) {
      logger.error("Chat load more error", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [fetchMessages]);

  // ─── Send message ────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (params: {
      messageType: "text" | "image" | "video";
      textContent?: string;
      mediaId?: string;
      replyToMessageId?: string;
    }) => {
      // Generate client message ID for idempotency
      const clientMessageId = crypto.randomUUID();

      // Optimistic message
      const tempMessage: MessageResponse = {
        id: clientMessageId,
        matchId,
        senderId: "temp",
        messageType: params.messageType,
        textContent: params.textContent ?? null,
        mediaId: params.mediaId ?? null,
        replyToMessageId: params.replyToMessageId ?? null,
        replyPreview: null,
        status: "sent",
        deliveredAt: null,
        readAt: null,
        createdAt: new Date().toISOString(),
        isOwn: true,
        sender: {
          id: "",
          displayName: "You",
          avatarUrl: null,
        },
      };

      // Add optimistic message
      setMessages((prev) => [...prev, tempMessage]);

      try {
        const res = await fetch(`/api/chat/${matchId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchId,
            messageType: params.messageType,
            textContent: params.textContent,
            mediaId: params.mediaId,
            replyToMessageId: params.replyToMessageId,
            clientMessageId,
          }),
        });

        if (!res.ok) {
          const result = await res.json().catch(() => ({ error: "Failed to send" }));
          throw new Error(result.error || "Failed to send message");
        }

        const result = await res.json();

        // Replace optimistic message with authoritative one
        setMessages((prev) =>
          prev.map((m) =>
            m.id === clientMessageId ? result.message : m,
          ),
        );

        // Clear reply-to state
        setReplyToState(null);
      } catch (err) {
        // Optimistic message stays but with failed-to-send visual
        throw err;
      }
    },
    [matchId],
  );

  // ─── Delete message ──────────────────────────────────────────────────

  const deleteMessage = useCallback(
    async (messageId: string) => {
      try {
        const res = await fetch(`/api/chat/${matchId}/messages/${messageId}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          const result = await res.json().catch(() => ({ error: "Failed to delete" }));
          throw new Error(result.error || "Failed to delete message");
        }

        // Update local state
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, textContent: null, status: "sent" as const }
              : m,
          ),
        );
      } catch (err) {
        logger.error("Failed to delete message", {
          error: err instanceof Error ? err.message : "Unknown",
        });
        throw err;
      }
    },
    [matchId],
  );

  // ─── Mark as read ────────────────────────────────────────────────────

  const markAsRead = useCallback(async () => {
    if (!conversationId) return;

    try {
      await fetch(`/api/chat/${matchId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      // Fire-and-forget
    }
  }, [matchId, conversationId]);

  // ─── Set reply to (uses ref for non-stale messages access) ────────────

  const setReplyTo = useCallback((messageId: string | null) => {
    if (messageId) {
      const msg = messagesRef.current.find((m) => m.id === messageId);
      setReplyToState(msg ?? null);
    } else {
      setReplyToState(null);
    }
  }, []);

  // ─── Realtime subscription (runs when conversationId becomes available) ─

  useEffect(() => {
    if (!conversationId) return;

    const sub = subscribeToConversation(
      conversationId,
      (event) => {
        if (event.eventType === "INSERT") {
          const newMsg = event.new;

          setMessages((prev) => {
            const exists = prev.some((m) => m.id === newMsg.id);
            if (exists) return prev;

            // Create basic entry — sender will be enriched on next refresh
            return [
              ...prev,
              {
                id: newMsg.id,
                matchId,
                senderId: newMsg.sender_id,
                messageType: newMsg.message_type ?? "text",
                textContent: newMsg.content,
                mediaId: null,
                replyToMessageId: newMsg.reply_to_id,
                replyPreview: null,
                status: newMsg.status ?? "sent",
                deliveredAt: newMsg.delivered_at,
                readAt: newMsg.read_at,
                createdAt: newMsg.created_at,
                isOwn: false,
                sender: {
                  id: newMsg.sender_id,
                  displayName: newMsg.sender_id === otherUser?.id
                    ? (otherUser?.displayName ?? "")
                    : "",
                  avatarUrl: null,
                },
              } as MessageResponse,
            ];
          });
        } else if (event.eventType === "UPDATE") {
          const updatedMsg = event.new;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updatedMsg.id
                ? {
                    ...m,
                    status: updatedMsg.status ?? m.status,
                    deliveredAt: updatedMsg.delivered_at ?? m.deliveredAt,
                    readAt: updatedMsg.read_at ?? m.readAt,
                  }
                : m,
            ),
          );
        }
      },
      (status) => {
        setRealtimeStatus(status);
      },
    );

    return () => {
      sub.unsubscribe();
    };
  }, [conversationId, matchId, otherUser?.id, otherUser?.displayName]);

  // ─── Initial load ────────────────────────────────────────────────────

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // ─── Mark as read when messages change ────────────────────────────────

  useEffect(() => {
    if (messages.length > 0 && !loading) {
      markAsRead();
    }
  }, [messages.length, loading, markAsRead]);

  return {
    messages,
    loading,
    loadingMore,
    error,
    hasMore,
    realtimeStatus,
    otherUser,
    conversationId,
    sendMessage,
    deleteMessage,
    loadMore,
    refresh: loadInitial,
    markAsRead,
    setReplyTo,
    replyToMessage,
  };
}
