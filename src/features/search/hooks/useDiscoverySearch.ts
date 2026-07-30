/**
 * useDiscoverySearch — Hook for social discovery with text search and filters.
 *
 * Features:
 *   - Text search with debounce (handled by SearchBar)
 *   - Interest filtering
 *   - Distance filtering
 *   - Sort modes
 *   - Cursor pagination
 *   - Loading/error states
 */

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { SearchProfileResult } from "@/lib/discovery/schemas";
import { logger } from "@/lib/logger";

interface SocialFilterState {
  interestIds: string[];
  maxDistanceKm: number | null;
  sort: "recommended" | "nearby" | "recent";
}

interface UseDiscoverySearchOptions {
  initialFilters?: Partial<SocialFilterState>;
}

export function useDiscoverySearch(options: UseDiscoverySearchOptions = {}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SocialFilterState>({
    interestIds: [],
    maxDistanceKm: null,
    sort: "recommended",
    ...options.initialFilters,
  });
  const [results, setResults] = useState<SearchProfileResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Build query params
  const buildParams = useCallback(
    (nextCursor?: string | null) => {
      const params = new URLSearchParams();
      params.set("mode", "social");
      if (query) params.set("query", query);
      if (filters.sort !== "recommended") params.set("sort", filters.sort);
      if (filters.maxDistanceKm) params.set("maxDistance", String(filters.maxDistanceKm));
      if (filters.interestIds.length > 0) params.set("interests", filters.interestIds.join(","));
      if (nextCursor) params.set("cursor", nextCursor);
      return params;
    },
    [query, filters],
  );

  // Fetch results (initial or refresh)
  const search = useCallback(async () => {
    // Abort any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = buildParams(null);
      const response = await fetch(`/api/discovery?${params.toString()}`, {
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Search failed (${response.status})`);
      }

      const data = await response.json();

      // Social mode returns { items, nextCursor, hasMore }
      if ("items" in data) {
        setResults(data.items ?? []);
        setCursor(data.nextCursor ?? null);
        setHasMore(data.hasMore ?? false);
      } else {
        setResults([]);
        setCursor(null);
        setHasMore(false);
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      const message = err.message || "Search failed";
      setError(message);
      logger.error("Discovery search failed", { error: message });
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  // Load more (pagination)
  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || loading) return;

    setLoadingMore(true);

    try {
      const params = buildParams(cursor);
      const response = await fetch(`/api/discovery?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to load more");
      }

      const data = await response.json();

      if ("items" in data) {
        setResults((prev) => {
          // Deduplicate
          const existingIds = new Set(prev.map((r) => r.id));
          const newItems = (data.items ?? []).filter(
            (item: SearchProfileResult) => !existingIds.has(item.id),
          );
          return [...prev, ...newItems];
        });
        setCursor(data.nextCursor ?? null);
        setHasMore(data.hasMore ?? false);
      }
    } catch (err: any) {
      logger.error("Load more failed", { error: err.message });
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, loading, buildParams]);

  // Auto-search when query or filters change
  useEffect(() => {
    // Don't search on empty query without filters
    if (!query && filters.interestIds.length === 0 && !filters.maxDistanceKm) {
      setResults([]);
      setCursor(null);
      setHasMore(false);
      return;
    }

    search();
  }, [query, filters.sort, filters.interestIds.join(","), filters.maxDistanceKm]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    search();
  }, [search]);

  return {
    query,
    setQuery,
    filters,
    setFilters,
    results,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}
