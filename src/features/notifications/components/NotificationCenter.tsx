"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { NotificationItem } from "./NotificationItem";
import { NotificationEmptyState } from "./NotificationEmptyState";
import { Loading, ErrorState } from "@/components/ui";
import type { NotificationItem as NotificationItemType } from "@/lib/notifications/schemas";

type NotificationCategory = "all" | "messages" | "dating" | "social" | "system";

interface NotificationCenterProps {
  onNotificationPress?: (notification: NotificationItemType) => void;
}

/**
 * NotificationCenter — Full notification list with category filtering,
 * cursor pagination, and realtime updates.
 *
 * Categories:
 *  - All
 *  - Messages
 *  - Dating
 *  - Social
 *  - System
 */
export function NotificationCenter({
  onNotificationPress,
}: NotificationCenterProps) {
  const {
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    category,
    setCategory,
    loadMore,
    refresh,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [showMarkAllRead, setShowMarkAllRead] = useState(false);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMore || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  // Handle notification press
  const handlePress = useCallback(
    (notification: NotificationItemType) => {
      if (!notification.isRead) {
        markAsRead(notification.id);
      }
      onNotificationPress?.(notification);
    },
    [markAsRead, onNotificationPress],
  );

  const categories: { key: NotificationCategory; label: string }[] = [
    { key: "all", label: "All" },
    { key: "messages", label: "Messages" },
    { key: "dating", label: "Dating" },
    { key: "social", label: "Social" },
    { key: "system", label: "System" },
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loading message="Loading notifications..." />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Category filter tabs */}
      <div className="flex gap-1 px-2 py-2 overflow-x-auto scrollbar-none border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
        {categories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors ${
              category === cat.key
                ? "bg-[var(--tg-theme-button-color,#0088cc)] text-[var(--tg-theme-button-text-color,#ffffff)] font-medium"
                : "text-[var(--tg-theme-text-color,#000000)] hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Content area */}
      {error ? (
        <div className="flex-1 flex items-center justify-center">
          <ErrorState
            title="Failed to load notifications"
            message={error}
            onRetry={refresh}
          />
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <NotificationEmptyState category={category} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Mark all as read */}
          {items.some((n) => !n.isRead) && (
            <div className="px-4 py-2 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
              <button
                onClick={markAllAsRead}
                className="text-xs font-medium text-[var(--tg-theme-button-color,#0088cc)]"
              >
                Mark all as read
              </button>
            </div>
          )}

          {/* Notification list */}
          <div className="divide-y divide-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
            {items.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onPress={handlePress}
              />
            ))}
          </div>

          {/* Load more trigger */}
          {hasMore && (
            <div ref={loadMoreRef} className="flex justify-center py-4">
              {loadingMore ? (
                <Loading message="Loading more..." />
              ) : (
                <button
                  onClick={loadMore}
                  className="text-xs text-[var(--tg-theme-button-color,#0088cc)] font-medium"
                >
                  Load more
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
