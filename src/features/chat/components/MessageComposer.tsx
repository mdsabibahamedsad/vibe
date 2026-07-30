"use client";

import { useCallback, useRef, useState } from "react";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/constants";

interface MessageComposerProps {
  onSend: (params: {
    messageType: "text" | "image" | "video";
    textContent?: string;
    replyToMessageId?: string;
  }) => Promise<void>;
  onStartTyping: () => void;
  onStopTyping: () => void;
  onAttach?: () => void;
  replyToMessage: { id: string; senderName: string; text: string } | null;
  onCancelReply: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * MessageComposer — Text input, send button, and attachment button.
 *
 * Features:
 *  - Auto-resizing text input
 *  - Send button (disabled when empty or unauthorized)
 *  - Attachment button
 *  - Reply preview bar
 *  - Typing indicator triggers
 *  - Keyboard-safe layout
 *  - Enter to send (Shift+Enter for newline)
 */
export function MessageComposer({
  onSend,
  onStartTyping,
  onStopTyping,
  onAttach,
  replyToMessage,
  onCancelReply,
  disabled = false,
  disabledReason,
}: MessageComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Auto-resize textarea ─────────────────────────────────────────

  const adjustHeight = useCallback(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, []);

  // ─── Handle send ──────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || disabled) return;

    setSending(true);
    try {
      await onSend({
        messageType: "text",
        textContent: trimmed,
        replyToMessageId: replyToMessage?.id,
      });
      setText("");
      adjustHeight();
      onStopTyping();
    } catch {
      // Error is handled by the parent
    } finally {
      setSending(false);
    }
  }, [text, sending, disabled, onSend, replyToMessage, adjustHeight, onStopTyping]);

  // ─── Handle keydown ───────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ─── Typing indicator ─────────────────────────────────────────────

  const handleInput = useCallback(
    (value: string) => {
      setText(value);
      adjustHeight();

      // Throttled typing indicator
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }

      if (value.trim()) {
        onStartTyping();
        typingTimerRef.current = setTimeout(() => {
          onStopTyping();
        }, 3000);
      } else {
        onStopTyping();
      }
    },
    [adjustHeight, onStartTyping, onStopTyping],
  );

  const canSend = text.trim().length > 0 && !sending && !disabled;

  return (
    <div className="glass border-t border-divider">
      {/* Reply preview bar */}
      {replyToMessage && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-2">
          <div className="w-0.5 h-8 rounded-full bg-primary" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-primary truncate">
              {replyToMessage.senderName}
            </p>
            <p className="text-xs text-muted truncate">
              {replyToMessage.text}
            </p>
          </div>
          <button
            onClick={onCancelReply}
            className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center hover:bg-surface-2/70"
            aria-label="Cancel reply"
          >
            <svg className="w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-end gap-2 px-3 py-2">
        {/* Attachment button */}
        {onAttach && !disabled && (
          <button
            onClick={onAttach}
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-2 active:bg-surface-2/70 transition-colors"
            aria-label="Attach media"
          >
            <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}

        {/* Text input */}
        <div className="flex-1 min-w-0">
          {disabled && disabledReason ? (
            <div className="px-3 py-2.5 rounded-full bg-surface-2">
              <p className="text-xs text-muted text-center">
                {disabledReason}
              </p>
            </div>
          ) : (
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              maxLength={MAX_MESSAGE_LENGTH}
              rows={1}
              className="w-full resize-none rounded-full bg-surface-2 px-4 py-2.5 text-sm text-fg placeholder:text-muted outline-none focus:ring-1 focus:ring-primary"
              aria-label="Message input"
            />
          )}
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
            canSend
              ? "bg-brand-gradient text-white shadow-glow"
              : "bg-surface-2 text-muted"
          }`}
          aria-label="Send message"
        >
          {sending ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
