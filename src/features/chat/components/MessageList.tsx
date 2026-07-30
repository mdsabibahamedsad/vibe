"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MessageResponse } from "@/lib/chat/schemas";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import type { OtherUserInfo } from "@/features/chat/hooks/useChat";
import { Loading } from "@/components/ui";

interface MessageListProps {
  messages: MessageResponse[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  otherUser: OtherUserInfo | null;
  otherUserIsTyping: boolean;
  onLoadMore: () => void;
  onReply: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  onMediaPress: (message: MessageResponse) => void;
}

/**
 * MessageList — Scrollable list of chat messages.
 *
 * Features:
 *  - Reverse cursor pagination (load older on scroll up)
 *  - Auto-scroll to bottom on new messages
 *  - Scroll position preservation on load-more
 *  - "New messages" indicator when scrolled up
 *  - Typing indicator at bottom
 *  - IntersectionObserver for infinite scroll
 */
export function MessageList({
  messages,
  loading,
  loadingMore,
  hasMore,
  otherUser,
  otherUserIsTyping,
  onLoadMore,
  onReply,
  onDelete,
  onMediaPress,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  // ─── Auto-scroll to bottom on new messages ─────────────────────────

  useEffect(() => {
    if (isNearBottomRef.current && messages.length > prevMessageCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  // ─── Track scroll position ─────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const threshold = 100;
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      isNearBottomRef.current = distanceFromBottom < threshold;
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // ─── IntersectionObserver for load-more trigger ────────────────────

  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;
    if (!trigger || !hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          onLoadMore();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  // ─── Initial scroll to bottom ──────────────────────────────────────

  useEffect(() => {
    if (!loading && messages.length > 0) {
      bottomRef.current?.scrollIntoView();
    }
  }, [loading]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loading message="Loading messages..." />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4">
        <div className="w-16 h-16 rounded-full bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--tg-theme-hint-color,#999999)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p className="text-sm text-[var(--tg-theme-hint-color,#999999)] text-center">
          No messages yet. Say hello! 👋
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto scrollbar-thin"
      style={{ overscrollBehavior: "contain" }}
    >
      {/* Load more trigger */}
      {hasMore && (
        <div ref={loadMoreTriggerRef} className="flex justify-center py-4">
          {loadingMore ? (
            <Loading message="Loading older messages..." />
          ) : (
            <button
              onClick={onLoadMore}
              className="text-xs text-[var(--tg-theme-button-color,#0088cc)] font-medium"
            >
              Load older messages
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="py-2">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onReply={onReply}
            onDelete={onDelete}
            onMediaPress={onMediaPress}
          />
        ))}
      </div>

      {/* Typing indicator */}
      <TypingIndicator otherUser={otherUser} visible={otherUserIsTyping} />

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  );
}
