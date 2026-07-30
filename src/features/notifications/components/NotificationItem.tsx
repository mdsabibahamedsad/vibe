"use client";

import { Avatar } from "@/components/ui";
import { getNotificationIcon } from "@/lib/notifications/templates";
import type { NotificationItem as NotificationItemType } from "@/lib/notifications/schemas";

interface NotificationItemProps {
  notification: NotificationItemType;
  onPress: (notification: NotificationItemType) => void;
}

/**
 * NotificationItem — Renders a single notification in the notification center.
 *
 * Features:
 *  - Type-specific icon/emoji
 *  - Actor avatar or fallback
 *  - Title and body
 *  - Relative timestamp
 *  - Unread indicator (blue dot)
 *  - Accessible touch target
 */
export function NotificationItem({
  notification,
  onPress,
}: NotificationItemProps) {
  const icon = getNotificationIcon(notification.type);

  return (
    <button
      onClick={() => onPress(notification)}
      className={`flex items-start gap-3 w-full px-4 py-3 text-left transition-colors active:bg-black/5 dark:active:bg-white/5 ${
        !notification.isRead
          ? "bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)]/40"
          : ""
      }`}
      aria-label={`${notification.title ?? "Notification"} — ${notification.body ?? ""}`}
    >
      {/* Icon / Avatar */}
      <div className="flex-shrink-0 flex items-center justify-center w-10 h-10">
        {notification.actor?.avatarUrl ? (
          <Avatar
            src={notification.actor.avatarUrl}
            alt={notification.actor.displayName}
            size="sm"
            fallback={notification.actor.displayName.charAt(0)}
          />
        ) : (
          <span className="text-lg" role="img" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-[var(--tg-theme-text-color,#000000)] truncate">
            {notification.actor?.displayName ?? notification.title ?? "Notification"}
          </p>
          {!notification.isRead && (
            <span className="w-2 h-2 rounded-full bg-[var(--tg-theme-button-color,#0088cc)] flex-shrink-0" />
          )}
        </div>
        <p
          className={`text-sm mt-0.5 line-clamp-2 ${
            !notification.isRead
              ? "text-[var(--tg-theme-text-color,#000000)]"
              : "text-[var(--tg-theme-hint-color,#999999)]"
          }`}
        >
          {notification.body ?? notification.title ?? ""}
        </p>
        <p className="text-xs text-[var(--tg-theme-hint-color,#999999)] mt-0.5">
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>
    </button>
  );
}

/**
 * Format a timestamp as a relative time string.
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}
