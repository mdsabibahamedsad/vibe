"use client";

import type { OtherUserInfo } from "@/features/chat/hooks/useChat";

interface TypingIndicatorProps {
  otherUser: OtherUserInfo | null;
  visible: boolean;
}

/**
 * TypingIndicator — Animated dots shown when the other user is typing.
 *
 * Uses minimal animation respecting reduced-motion preferences.
 */
export function TypingIndicator({ otherUser, visible }: TypingIndicatorProps) {
  if (!visible) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5" aria-live="polite" role="status">
      <div className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--tg-theme-hint-color,#999999)] animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--tg-theme-hint-color,#999999)] animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--tg-theme-hint-color,#999999)] animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
      <span className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
        {otherUser?.displayName ?? "User"} is typing...
      </span>
    </div>
  );
}
