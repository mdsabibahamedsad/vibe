"use client";

import { useState, useCallback } from "react";
import { useChat } from "@/features/chat/hooks/useChat";
import { useChatTyping } from "@/features/chat/hooks/useChatTyping";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import { ImageViewer } from "./ImageViewer";
import { Loading, ErrorState } from "@/components/ui";
import type { MessageResponse } from "@/lib/chat/schemas";

interface ChatScreenProps {
  matchId: string;
  onBack: () => void;
  onViewProfile?: (userId: string) => void;
  onReport?: (userId: string) => void;
  onBlock?: (userId: string) => void;
  onUnmatch?: (matchId: string) => void;
}

/**
 * ChatScreen — Main full-screen chat component.
 *
 * Composes:
 *  - ChatHeader (back, avatar, name, menu)
 *  - MessageList (messages with pagination)
 *  - MessageComposer (input, send, attach)
 *  - ImageViewer (full-screen media)
 *  - TypingIndicator (via useChatTyping hook)
 *
 * Handles all chat state, realtime, and error states.
 */
export function ChatScreen({
  matchId,
  onBack,
  onViewProfile,
  onReport,
  onBlock,
  onUnmatch,
}: ChatScreenProps) {
  const {
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
    markAsRead,
    setReplyTo,
    replyToMessage,
  } = useChat(matchId);

  const {
    otherUserIsTyping,
    startTyping,
    stopTyping,
  } = useChatTyping(
    matchId,
    conversationId,
    otherUser?.id ?? "",
  );

  const [viewMedia, setViewMedia] = useState<MessageResponse | null>(null);
  const [chatAccessDenied, setChatAccessDenied] = useState(false);

  // Handle send with error
  const handleSend = useCallback(
    async (params: {
      messageType: "text" | "image" | "video";
      textContent?: string;
      replyToMessageId?: string;
    }) => {
      try {
        await sendMessage(params);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to send";
        // Could show a toast here
        console.error("Send failed:", message);
        throw err; // Re-throw for the composer to handle
      }
    },
    [sendMessage],
  );

  // Handle delete with confirmation
  const handleDelete = useCallback(
    (messageId: string) => {
      if (window.confirm("Delete this message?")) {
        deleteMessage(messageId).catch(() => {});
      }
    },
    [deleteMessage],
  );

  // Handle reply
  const handleReply = useCallback(
    (messageId: string) => {
      setReplyTo(messageId);
    },
    [setReplyTo],
  );

  if (error) {
    // Check if error is due to access denial
    const isAccessDenied =
      error.toLowerCase().includes("access") ||
      error.toLowerCase().includes("match") ||
      error.toLowerCase().includes("block") ||
      error.toLowerCase().includes("unmatch");

    if (isAccessDenied) {
      return (
        <div className="flex min-h-dvh flex-col bg-[var(--tg-theme-bg-color,#ffffff)]">
          <ChatHeader
            otherUser={null}
            realtimeStatus="disconnected"
            onBack={onBack}
          />
          <div className="flex-1 flex items-center justify-center">
            <ErrorState
              title={chatAccessDenied ? "Chat unavailable" : "Chat unavailable"}
              message={error || "This conversation is no longer available."}
              onRetry={() => {
                window.location.reload();
              }}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-dvh flex-col bg-[var(--tg-theme-bg-color,#ffffff)]">
        <ChatHeader
          otherUser={null}
          realtimeStatus="disconnected"
          onBack={onBack}
        />
        <div className="flex-1 flex items-center justify-center">
          <ErrorState
            title="Something went wrong"
            message={error}
            onRetry={() => window.location.reload()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-[var(--tg-theme-bg-color,#ffffff)]">
      {/* Header */}
      <ChatHeader
        otherUser={otherUser}
        realtimeStatus={realtimeStatus}
        onBack={onBack}
        onViewProfile={
          otherUser ? () => onViewProfile?.(otherUser.id) : undefined
        }
        onReport={otherUser ? () => onReport?.(otherUser.id) : undefined}
        onBlock={otherUser ? () => onBlock?.(otherUser.id) : undefined}
        onUnmatch={() => onUnmatch?.(matchId)}
      />

      {/* Messages */}
      <MessageList
        messages={messages}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        otherUser={otherUser}
        otherUserIsTyping={otherUserIsTyping}
        onLoadMore={loadMore}
        onReply={handleReply}
        onDelete={handleDelete}
        onMediaPress={(msg) => setViewMedia(msg)}
      />

      {/* Composer */}
      <MessageComposer
        onSend={handleSend}
        onStartTyping={startTyping}
        onStopTyping={stopTyping}
        onAttach={() => {
          // Future: open media picker
        }}
        replyToMessage={
          replyToMessage
            ? {
                id: replyToMessage.id,
                senderName: replyToMessage.sender.displayName,
                text:
                  replyToMessage.messageType === "text"
                    ? (replyToMessage.textContent ?? "")
                    : replyToMessage.messageType === "image"
                      ? "📷 Photo"
                      : "🎬 Video",
              }
            : null
        }
        onCancelReply={() => setReplyTo(null)}
        disabled={!!error}
        disabledReason={error ?? undefined}
      />

      {/* Image/Video Viewer */}
      <ImageViewer
        message={viewMedia}
        onClose={() => setViewMedia(null)}
      />
    </div>
  );
}
