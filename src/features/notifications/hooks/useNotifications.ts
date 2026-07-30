"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { NotificationItem, NotificationListResponse } from "@/lib/notifications/schemas";

type NotificationCategory = "all" | "messages" | "dating" | "social" | "system";

interface UseNotificationsReturn {
  items: NotificationItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  category: NotificationCategory;
  setCategory: (category: NotificationCategory) => void;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

/**
 * Hook for fetching and managing the notification list.
 * Supports cursor pagination, category filtering, and realtime updates.
 */
export function useNotifications(): UseNotificationsReturn {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [category, setCategoryState] = useState<NotificationCategory>("all");

  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  // ─── Fetch notifications ───────────────────────────────────────────

  const fetchNotifications = useCallback(
    async (cursor?: string, cat?: string) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (cursor) params.set("cursor", cursor);
      if (cat && cat !== "all") params.set("category", cat);

      const res = await fetch(`/api/notifications?${params.toString()}`);

      if (!res.ok) {
        const result = await res.json().catch(() => ({ error: "Failed to load" }));
        throw new Error(result.error || "Failed to load notifications");
      }

      return (await res.json()) as NotificationListResponse;
    },
    [],
  );

  // ─── Load initial ─────────────────────────────────────────────────

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchNotifications(undefined, category);
      setItems(data.items);
      cursorRef.current = data.nextCursor;
      setHasMore(data.hasMore);
    } catch (err) {
      logger.error("Notification load error", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [fetchNotifications, category]);

  // ─── Load more ────────────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !cursorRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);

    try {
      const data = await fetchNotifications(cursorRef.current!, category);
      setItems((prev) => {
        const existingIds = new Set(prev.map((n) => n.id));
        const newItems = data.items.filter((n) => !existingIds.has(n.id));
        return [...prev, ...newItems];
      });
      cursorRef.current = data.nextCursor;
      setHasMore(data.hasMore);
    } catch (err) {
      logger.error("Notification load more error", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [fetchNotifications, category]);

  // ─── Set category ─────────────────────────────────────────────────

  const setCategory = useCallback((newCategory: NotificationCategory) => {
    setCategoryState(newCategory);
    setItems([]);
    cursorRef.current = null;
    setHasMore(true);
  }, []);

  // ─── Mark as read ─────────────────────────────────────────────────

  const markAsRead = useCallback(async (notificationId: string) => {
    // Optimistic update
    setItems((prev) =>
      prev.map((n) =>
        n.id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n,
      ),
    );

    try {
      await fetch(`/api/notifications/${notificationId}/read`, { method: "POST" });
    } catch {
      // Revert on failure
      setItems((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, isRead: false, readAt: null } : n,
        ),
      );
    }
  }, []);

  // ─── Mark all as read ─────────────────────────────────────────────

  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((n) => ({ ...n, isRead: true, readAt: now })),
    );

    try {
      await fetch("/api/notifications", { method: "POST" });
    } catch {
      // Refresh on failure
      loadInitial();
    }
  }, [loadInitial]);

  // ─── Initial load ─────────────────────────────────────────────────

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // ─── Realtime subscription ────────────────────────────────────────

  useEffect(() => {
    const supabase = getSupabaseClient();

    const channel = supabase.channel("notifications");

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
      },
      (payload) => {
        // Only handle notifications for current user (filtered by RLS)
        const newNotif = payload.new as any;
        if (!newNotif) return;

        setItems((prev) => {
          const exists = prev.some((n) => n.id === newNotif.id);
          if (exists) return prev;

          return [
            {
              id: newNotif.id,
              type: newNotif.type,
              actor: null, // Will be enriched on next refresh
              entityType: newNotif.entity_type ?? null,
              entityId: newNotif.entity_id ?? null,
              groupKey: newNotif.group_key ?? null,
              title: newNotif.title ?? null,
              body: newNotif.body ?? null,
              readAt: null,
              isRead: false,
              createdAt: newNotif.created_at,
            },
            ...prev,
          ];
        });
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    category,
    setCategory,
    loadMore,
    refresh: loadInitial,
    markAsRead,
    markAllAsRead,
  };
}
