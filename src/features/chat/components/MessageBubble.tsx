"use client";

import { useState } from "react";
import type { MessageResponse } from "@/lib/chat/schemas";

interface MessageBubbleProps {
  message: MessageResponse;
  onReply?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onMediaPress?: (message: MessageResponse) => void;
}

/**
 * MessageBubble — Renders a single chat message.
 *
 * Support:
 *  - Text messages with wrapping
 *  - Media (image/video) previews
 *  - Sent/delivered/read status indicators
 *  - Reply preview
 *  - Deleted message state
 *  - Timestamps
 *  - Long-press for actions (reply, delete)
 */
export function MessageBubble({
  message,
  onReply,
  onDelete,
  onMediaPress,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);

  if (message.messageType === "system") {
    return (
      <div className="flex justify-center py-2">
        <span className="text-xs text-muted italic">
          {message.textContent}
        </span>
      </div>
    );
  }

  const isDeleted = !message.textContent && message.messageType === "text";

  return (
    <div
      className={`flex ${message.isOwn ? "justify-end" : "justify-start"} px-4 py-1`}
    >
      <div
        className={`relative max-w-[80%] group ${
          message.isOwn ? "items-end" : "items-start"
        }`}
      >
        {/* Reply preview */}
        {message.replyPreview && (
          <div
            className={`mb-0.5 rounded-lg px-3 py-1.5 text-xs border-l-2 ${
              message.isOwn
                ? "bg-white/20 border-primary"
                : "bg-surface-2 border-muted"
            }`}
          >
            <p className="font-medium text-primary truncate">
              {message.replyPreview.senderName}
            </p>
            <p className="text-muted truncate">
              {message.replyPreview.text}
            </p>
          </div>
        )}

        {/* Message content */}
        <div
          onClick={() => setShowActions(!showActions)}
          className={`rounded-3xl px-3.5 py-2.5 ${
            message.isOwn
              ? "bg-brand-gradient text-white rounded-br-md shadow-glow"
              : "glass text-fg rounded-bl-md"
          }`}
          role="button"
          tabIndex={0}
          aria-label={`Message from ${message.sender.displayName}`}
          onKeyDown={(e) => {
            if (e.key === "Enter") setShowActions(!showActions);
          }}
        >
          {isDeleted ? (
            <p className="text-sm italic opacity-60">Message deleted</p>
          ) : message.messageType === "text" ? (
            <p className="text-sm whitespace-pre-wrap break-words">{message.textContent}</p>
          ) : message.messageType === "image" || message.messageType === "video" ? (
            <div className="space-y-1.5">
              {/* Media thumbnail */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMediaPress?.(message);
                }}
                className="block rounded-lg overflow-hidden max-w-48"
                aria-label={`View ${message.messageType}`}
              >
                <div className="aspect-square bg-surface-2 rounded-lg flex items-center justify-center">
                  {message.messageType === "video" ? (
                    <svg className="w-8 h-8 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
              </button>
              {message.textContent && (
                <p className="text-sm whitespace-pre-wrap break-words">{message.textContent}</p>
              )}
            </div>
          ) : null}

          {/* Timestamp and status */}
          <div
            className={`flex items-center gap-1 mt-1 ${
              message.isOwn ? "justify-end" : "justify-start"
            }`}
          >
            <span
              className={`text-[10px] ${
                message.isOwn
                  ? "text-white/70"
                  : "text-muted"
              }`}
            >
              {formatTime(message.createdAt)}
            </span>
            {message.isOwn && !isDeleted && (
              <StatusIcon status={message.status} />
            )}
          </div>
        </div>

        {/* Action buttons (on click/tap) */}
        {showActions && (
          <div
            className={`absolute top-0 ${
              message.isOwn ? "left-0 -translate-x-full -ml-2" : "right-0 translate-x-full mr-2"
            } flex gap-1 z-10`}
          >
            {onReply && !isDeleted && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReply(message.id);
                  setShowActions(false);
                }}
                className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center shadow-soft"
                aria-label="Reply"
              >
                <svg className="w-4 h-4 text-fg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>
            )}
            {message.isOwn && !isDeleted && onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(message.id);
                  setShowActions(false);
                }}
                className="w-8 h-8 rounded-full bg-danger/15 flex items-center justify-center shadow-soft"
                aria-label="Delete message"
              >
                <svg className="w-4 h-4 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Status icon for sent/delivered/read */
function StatusIcon({ status }: { status: string }) {
  return (
    <svg className="w-3.5 h-3.5 text-white/70" viewBox="0 0 20 20" fill="currentColor" aria-label={status}>
      {status === "sent" && (
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      )}
      {status === "delivered" && (
        <>
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          <circle cx="16" cy="15" r="2" />
        </>
      )}
      {status === "read" && (
        <>
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          <circle cx="16" cy="15" r="2" fill="#4FC3F7" />
        </>
      )}
    </svg>
  );
}

/** Format a timestamp as HH:MM */
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}
