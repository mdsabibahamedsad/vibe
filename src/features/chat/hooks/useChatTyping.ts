"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeToTyping, sendTypingIndicator } from "@/features/chat/services/chat-realtime.service";
import { TYPING_THROTTLE_MS, TYPING_TIMEOUT_MS } from "@/lib/chat/constants";

interface UseChatTypingReturn {
  isTyping: boolean;
  otherUserIsTyping: boolean;
  startTyping: () => void;
  stopTyping: () => void;
}

/**
 * Hook for managing typing indicators in a match chat.
 *
 * Features:
 *  - Throttles outgoing typing events (configurable interval)
 *  - Auto-stops typing after timeout
 *  - Listens for other user's typing events via realtime
 *  - Tracks typing state with auto-expiry
 */
export function useChatTyping(
  matchId: string,
  conversationId: string | null,
  currentUserId: string,
): UseChatTypingReturn {
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserIsTyping, setOtherUserIsTyping] = useState(false);

  const lastSentRef = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Send typing indicator ──────────────────────────────────────────

  const sendTyping = useCallback(
    (typing: boolean) => {
      if (!conversationId) return;

      const now = Date.now();
      if (typing && now - lastSentRef.current < TYPING_THROTTLE_MS) {
        return; // Throttled
      }

      lastSentRef.current = now;
      sendTypingIndicator(conversationId, currentUserId, typing);
    },
    [conversationId, currentUserId],
  );

  // ─── Start typing ──────────────────────────────────────────────────

  const startTyping = useCallback(() => {
    if (!isTyping) {
      setIsTyping(true);
      sendTyping(true);
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Auto-stop after timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      sendTyping(false);
    }, TYPING_TIMEOUT_MS);
  }, [isTyping, sendTyping]);

  // ─── Stop typing ───────────────────────────────────────────────────

  const stopTyping = useCallback(() => {
    if (isTyping) {
      setIsTyping(false);
      sendTyping(false);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, [isTyping, sendTyping]);

  // ─── Subscribe to other user's typing ──────────────────────────────

  useEffect(() => {
    if (!conversationId) return;

    const sub = subscribeToTyping(conversationId, currentUserId, (userId, typing) => {
      if (typing) {
        setOtherUserIsTyping(true);

        // Auto-clear after timeout
        if (otherTypingTimeoutRef.current) {
          clearTimeout(otherTypingTimeoutRef.current);
        }
        otherTypingTimeoutRef.current = setTimeout(() => {
          setOtherUserIsTyping(false);
        }, TYPING_TIMEOUT_MS);
      } else {
        setOtherUserIsTyping(false);
      }
    });

    return () => {
      sub.unsubscribe();
    };
  }, [conversationId, currentUserId]);

  // ─── Cleanup on unmount ────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
    };
  }, []);

  return {
    isTyping,
    otherUserIsTyping,
    startTyping,
    stopTyping,
  };
}
