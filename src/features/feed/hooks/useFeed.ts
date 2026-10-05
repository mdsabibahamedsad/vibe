"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthBootstrap } from "@/hooks/use-auth";
import { authFetch } from "@/lib/auth/auth-fetch";
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
  const { status, user, bootstrapped, error: authError, refreshSession } = useAuthBootstrap();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  // Do NOT call /api/feed while:
  //   - still loading (AuthProvider is still deciding)
  //   - authenticating (Telegram initData is being submitted)
  //   - unauthenticated (no valid session and no auth flow in progress)
  //   - outside a bootstrap (hasn't finished its first resolution)
  const authReady = status === "authenticated";

  const fetchFeed = useCallback(
    async (cursor?: string, opts?: { retried?: boolean }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (cursor) params.set("cursor", cursor);

      // authFetch attaches the Bearer token + same-origin cookies so the
      // request authenticates even where WebView cookies are blocked.
      const res = await authFetch(`/api/feed?${params.toString()}`);

      if (!res.ok) {
        const result = await res.json().catch(() => ({ error: "Failed to load feed" }));

        // 401 => session may have just expired: attempt ONE controlled
        // refresh + single retry, then give up quietly (the hook retries
        // again once auth becomes "authenticated"). Never a fatal error.
        if (res.status === 401) {
          if (!opts?.retried) {
            try {
              await refreshSession();
              return await fetchFeed(cursor, { retried: true });
            } catch {
              // Refresh failed — fall through to the quiet reauth path.
            }
          }
          throw new Error("REAUTHENTICATE_NEEDED");
        }

        throw new Error(result.error || "Failed to load feed");
      }

      return await res.json();
    },
    [limit, refreshSession],
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
      const message = err instanceof Error
        ? err.message
        : "Failed to load feed";

      // REAUTHENTICATE_NEEDED means auth is not ready yet. Store as a
        // transient state but do NOT surface to the user as a fatal feed error.
      if (message === "REAUTHENTICATE_NEEDED") {
        return; // retry once auth is "authenticated"
      }

      logger.error("Feed load error", { error: message });
      setError(message);
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
      const message = err instanceof Error
        ? err.message
        : "Failed to load more feed";

      if (message === "REAUTHENTICATE_NEEDED") {
        return; // retry once auth is "authenticated"
      }

      logger.error("Feed load more error", { error: message });
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [fetchFeed]);

  // Trigger the initial feed load ONLY when:
  //   1. Auth has finished bootstrapping
  //   2. Auth status is "authenticated"
  //
  // While auth is "initializing" (loading) / "authenticating" / "retrying"
  // no fetch is issued — this is the race-condition fix: the feed must
  // never call a protected API before the session is verified.
  // When the bootstrap settles to a non-authenticated state, resolve the
  // initial loading flag so consumers don't spin forever.
  useEffect(() => {
    if (!bootstrapped) return;
    if (authReady) {
      loadInitial();
    } else {
      setLoading(false);
    }
  }, [bootstrapped, authReady, loadInitial]);

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
