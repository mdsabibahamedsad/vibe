"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { DiscoveryCandidate, DiscoveryResponse, DiscoveryEligibilityReason } from "@/lib/discovery/schemas";

interface UseDiscoveryReturn {
  /** Discovery candidates */
  candidates: DiscoveryCandidate[];
  /** Whether the user is eligible for discovery */
  eligible: boolean;
  /** If not eligible, the reason */
  ineligibilityReason: DiscoveryEligibilityReason | null;
  /** Loading state */
  loading: boolean;
  /** Loading more state */
  loadingMore: boolean;
  /** Error message */
  error: string | null;
  /** Whether there are more candidates */
  hasMore: boolean;
  /** Load initial candidates */
  refresh: () => Promise<void>;
  /** Load next page */
  loadMore: () => Promise<void>;
  /** Remove a candidate from the list (after action) */
  removeCandidate: (candidateId: string) => void;
  /** Prepend a candidate (for undo/rewind) */
  prependCandidate: (candidate: DiscoveryCandidate) => void;
}

/**
 * Hook for fetching and managing discovery candidates.
 * Uses cursor pagination and handles eligibility states.
 */
export function useDiscovery(): UseDiscoveryReturn {
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [eligible, setEligible] = useState(true);
  const [ineligibilityReason, setIneligibilityReason] = useState<DiscoveryEligibilityReason | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  const fetchCandidates = useCallback(
    async (cursor?: string) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/discovery?${params.toString()}`);

      if (!res.ok) {
        const result = await res.json().catch(() => ({ error: "Failed to load candidates" }));
        throw new Error(result.error || "Failed to load candidates");
      }

      return await res.json();
    },
    [],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data: DiscoveryResponse = await fetchCandidates();

      if (!data.eligible) {
        setEligible(false);
        setIneligibilityReason(data.reason);
        setCandidates([]);
        setHasMore(false);
        return;
      }

      setEligible(true);
      setIneligibilityReason(null);
      setCandidates(data.items);
      cursorRef.current = data.nextCursor;
      setHasMore(data.hasMore);
    } catch (err) {
      logger.error("Discovery load error", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      setError(err instanceof Error ? err.message : "Failed to load discovery");
    } finally {
      setLoading(false);
    }
  }, [fetchCandidates]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !cursorRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);

    try {
      const data: DiscoveryResponse = await fetchCandidates(cursorRef.current!);

      if (!data.eligible) {
        setHasMore(false);
        return;
      }

      setCandidates((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const newItems = data.items.filter((item) => !existingIds.has(item.id));
        return [...prev, ...newItems];
      });
      cursorRef.current = data.nextCursor;
      setHasMore(data.hasMore);
    } catch (err) {
      logger.error("Discovery load more error", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [fetchCandidates]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const removeCandidate = useCallback((candidateId: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
  }, []);

  const prependCandidate = useCallback((candidate: DiscoveryCandidate) => {
    setCandidates((prev) => [candidate, ...prev]);
  }, []);

  return {
    candidates,
    eligible,
    ineligibilityReason,
    loading,
    loadingMore,
    error,
    hasMore,
    refresh: loadInitial,
    loadMore,
    removeCandidate,
    prependCandidate,
  };
}
