"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { MatchItem, MatchListResponse } from "@/features/matching/services/match.service";

interface UseMatchesReturn {
  matches: MatchItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  removeMatch: (matchId: string) => void;
  markAsRead: (matchId: string) => void;
}

/**
 * Hook for fetching and managing the match list.
 * Uses cursor pagination and supports refresh and load-more.
 */
export function useMatches(): UseMatchesReturn {
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  const fetchMatches = useCallback(
    async (cursor?: string) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/matches?${params.toString()}`);

      if (!res.ok) {
        const result = await res.json().catch(() => ({ error: "Failed to load matches" }));
        throw new Error(result.error || "Failed to load matches");
      }

      return await res.json();
    },
    [],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data: MatchListResponse = await fetchMatches();
      setMatches(data.items);
      cursorRef.current = data.nextCursor;
      setHasMore(data.hasMore);
    } catch (err) {
      logger.error("Match list load error", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      setError(err instanceof Error ? err.message : "Failed to load matches");
    } finally {
      setLoading(false);
    }
  }, [fetchMatches]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !cursorRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);

    try {
      const data: MatchListResponse = await fetchMatches(cursorRef.current!);
      setMatches((prev) => {
        const existingIds = new Set(prev.map((m) => m.matchId));
        const newItems = data.items.filter((item) => !existingIds.has(item.matchId));
        return [...prev, ...newItems];
      });
      cursorRef.current = data.nextCursor;
      setHasMore(data.hasMore);
    } catch (err) {
      logger.error("Match list load more error", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [fetchMatches]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const removeMatch = useCallback((matchId: string) => {
    setMatches((prev) => prev.filter((m) => m.matchId !== matchId));
  }, []);

  const markAsRead = useCallback((matchId: string) => {
    setMatches((prev) =>
      prev.map((m) =>
        m.matchId === matchId ? { ...m, unread: false } : m,
      ),
    );
    // Fire-and-forget server update
    fetch(`/api/matches/${matchId}/read`, { method: "POST" }).catch(() => {});
  }, []);

  return {
    matches,
    loading,
    loadingMore,
    error,
    hasMore,
    refresh: loadInitial,
    loadMore,
    removeMatch,
    markAsRead,
  };
}
