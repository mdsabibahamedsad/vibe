"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { NotificationItem } from "./NotificationItem";
import { NotificationEmptyState } from "./NotificationEmptyState";
import { ErrorState, NotificationSkeleton } from "@/components/ui";
import { useTranslation } from "@/lib/i18n/useTranslation";
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
  const { t } = useTranslation("notifications");
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
    { key: "all", label: t("categories.all") },
    { key: "messages", label: t("categories.messages") },
    { key: "dating", label: t("categories.dating") },
    { key: "social", label: t("categories.social") },
    { key: "system", label: t("categories.system") },
  ];

  if (loading) {
    return <NotificationSkeleton />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Category filter tabs */}
      <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 py-2.5">
        {categories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            aria-pressed={category === cat.key}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
              category === cat.key
                ? "bg-brand-gradient text-white shadow-glow"
                : "border border-divider bg-surface-2 text-muted hover:text-fg"
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
            <div className="px-4 py-2">
              <button
                onClick={markAllAsRead}
                className="text-xs font-semibold text-primary transition-opacity hover:opacity-80"
              >
                {t("markAllRead")}
              </button>
            </div>
          )}

          {/* Notification list */}
          <div className="divide-y divide-divider">
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
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
              ) : (
                <button
                  onClick={loadMore}
                  className="text-xs font-semibold text-primary transition-opacity hover:opacity-80"
                >
                  {t("loadMore")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
