"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { FeedItem } from "@/features/feed/services/feed.service";

interface UseFeedOptions {
  limit?: number;
}

interface UseFeedReturn {
  items: FeedItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  removeItem: (postId: string) => void;
  removeItemsByAuthor: (authorId: string) => void;
  updateItem: (postId: string, updater: (item: FeedItem) => FeedItem) => void;
  prependItem: (item: FeedItem) => void;
}

export function useFeed(options: UseFeedOptions = {}): UseFeedReturn {
  const { limit = 20 } = options;
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  const fetchFeed = useCallback(
    async (cursor?: string) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/feed?${params.toString()}`);

      if (!res.ok) {
        const result = await res.json().catch(() => ({ error: "Failed to load feed" }));
        throw new Error(result.error || "Failed to load feed");
      }

      return await res.json();
    },
    [limit],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFeed();
      setItems(data.items || []);
      cursorRef.current = data.nextCursor;
      setHasMore(data.hasMore);
    } catch (err) {
      logger.error("Feed load error", { error: err instanceof Error ? err.message : "Unknown" });
      setError(err instanceof Error ? err.message : "Failed to load feed");
    } finally {
      setLoading(false);
    }
  }, [fetchFeed]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !cursorRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);

    try {
      const data = await fetchFeed(cursorRef.current!);
      setItems((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newItems = (data.items || []).filter((item: FeedItem) => !existingIds.has(item.id));
        return [...prev, ...newItems];
      });
      cursorRef.current = data.nextCursor;
      setHasMore(data.hasMore);
    } catch (err) {
      logger.error("Feed load more error", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [fetchFeed]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const removeItem = useCallback((postId: string) => {
    setItems((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  const removeItemsByAuthor = useCallback((authorId: string) => {
    setItems((prev) => prev.filter((p) => p.authorId !== authorId));
  }, []);

  const updateItem = useCallback((postId: string, updater: (item: FeedItem) => FeedItem) => {
    setItems((prev) => prev.map((p) => (p.id === postId ? updater(p) : p)));
  }, []);

  const prependItem = useCallback((item: FeedItem) => {
    setItems((prev) => [item, ...prev]);
  }, []);

  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    refresh: loadInitial,
    loadMore,
    removeItem,
    removeItemsByAuthor,
    updateItem,
    prependItem,
  };
}
