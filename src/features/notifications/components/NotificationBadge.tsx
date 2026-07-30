"use client";

import { useUnreadCount } from "@/features/notifications/hooks/useUnreadCount";

interface NotificationBadgeProps {
  className?: string;
}

/**
 * NotificationBadge — Shows unread notification count.
 *
 * Designed for use in navigation bars.
 * Capped at "99+" visually.
 */
export function NotificationBadge({ className = "" }: NotificationBadgeProps) {
  const { total, loading } = useUnreadCount();

  if (loading || total === 0) return null;

  return (
    <span
      className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1 shadow-sm ${className}`}
      aria-label={`${total} unread notifications`}
    >
      {total > 99 ? "99+" : total}
    </span>
  );
}
