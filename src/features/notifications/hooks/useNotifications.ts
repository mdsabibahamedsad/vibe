"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthBootstrap } from "@/hooks/use-auth";
import { authFetch } from "@/lib/auth/auth-fetch";
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
 *
 * The hook waits for auth bootstrap to complete before calling protected APIs.
 * HTTP 401 is interpreted as "auth not ready yet" and triggers a retry once
 * the user becomes authenticated — never as a fatal error.
 */
export function useNotifications(): UseNotificationsReturn {
  const { status, user, bootstrapped, error: authError, refreshSession, logout } = useAuthBootstrap();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [category, setCategoryState] = useState<NotificationCategory>("all");

  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  // Do NOT fetch until auth has finished bootstrapping AND is authenticated.
  const authReady = bootstrapped && status === "authenticated";

  // ─── Fetch notifications ───────────────────────────────────────────

  const fetchNotifications = useCallback(
    async (cursor?: string, cat?: string) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (cursor) params.set("cursor", cursor);
      if (cat && cat !== "all") params.set("category", cat);

      const res = await authFetch(`/api/notifications?${params.toString()}`);

      if (!res.ok) {
        const result = await res.json().catch(() => ({ error: "Failed to load" }));

        // 401 => auth not ready yet / unauthenticated.
        // Do NOT surface as a fatal error; the hook will retry once auth is ready.
        if (res.status === 401) {
          throw new Error("REAUTHENTICATE_NEEDED");
        }

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
      const message = err instanceof Error
        ? err.message
        : "Failed to load notifications";

      // REAUTHENTICATE_NEEDED => auth isn't ready. Return without
        // surfacing a fatal error; the hook will re-run once auth is "authenticated".
      if (message === "REAUTHENTICATE_NEEDED") {
        return;
      }

      logger.error("Notification load error", {
        error: message,
        authError,
      });
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [fetchNotifications, category, authError]);

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
      const message = err instanceof Error
        ? err.message
        : "Failed to load more notifications";

      if (message === "REAUTHENTICATE_NEEDED") {
        return; // retry once auth is "authenticated"
      }

      logger.error("Notification load more error", {
        error: message,
        authError,
      });
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [fetchNotifications, category, authError]);

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
      await authFetch(`/api/notifications/${notificationId}/read`, { method: "POST" });
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
      await authFetch("/api/notifications", { method: "POST" });
    } catch {
      // Refresh on failure
      loadInitial();
    }
  }, [loadInitial]);

  // ─── Initial load ─────────────────────────────────────────────────

  // Load the initial notification batch ONLY when:
  //   1. Auth has finished bootstrapping
  //   2. Auth status is "authenticated"
  useEffect(() => {
    if (bootstrapped && authReady) {
      loadInitial();
    }
  }, [bootstrapped, authReady, loadInitial]);

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
