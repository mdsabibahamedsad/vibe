/**
 * DiscoveryResultList — Renders search + discovery results with infinite scroll.
 *
 * Supports:
 *   - Result cards (social mode)
 *   - Loading skeletons
 *   - Empty states (no results / no query)
 *   - Error state with retry
 *   - Infinite scroll via IntersectionObserver
 */

"use client";

import { useRef, useEffect, useCallback } from "react";
import { DiscoveryCard } from "./DiscoveryCard";
import type { SearchProfileResult } from "@/lib/discovery/schemas";

interface DiscoveryResultListProps {
  results: SearchProfileResult[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  hasQuery: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  onViewProfile?: (userId: string) => void;
}

export function DiscoveryResultList({
  results,
  loading,
  loadingMore,
  error,
  hasMore,
  hasQuery,
  onLoadMore,
  onRetry,
  onViewProfile,
}: DiscoveryResultListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          onLoadMore();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, onLoadMore]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-3 mt-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-4 animate-pulse">
            <div className="flex gap-3">
              <div className="w-12 h-12 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-2/3" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="mt-8 text-center space-y-3">
        <div className="text-destructive">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto mb-2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          onClick={onRetry}
          className="text-sm text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  // Empty (no query yet)
  if (!hasQuery && results.length === 0) {
    return (
      <div className="mt-12 text-center space-y-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mx-auto text-muted-foreground/40"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <p className="text-sm text-muted-foreground">
          Search for people by name, username, or interests
        </p>
        <p className="text-xs text-muted-foreground/60">
          Try &quot;Alex&quot;, &quot;photography&quot;, or use the filters above
        </p>
      </div>
    );
  }

  // Empty results
  if (results.length === 0 && hasQuery) {
    return (
      <div className="mt-12 text-center space-y-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mx-auto text-muted-foreground/40"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <p className="text-sm text-muted-foreground">No people found</p>
        <p className="text-xs text-muted-foreground/60">
          Try broadening your search, adjusting filters, or searching for something else
        </p>
      </div>
    );
  }

  // Results
  return (
    <div className="space-y-3 mt-4">
      {/* Result count */}
      <p className="text-xs text-muted-foreground/60 px-1">
        {results.length} result{results.length !== 1 ? "s" : ""}
      </p>

      {/* Cards */}
      {results.map((profile) => (
        <DiscoveryCard
          key={profile.id}
          profile={profile}
          mode="social"
          onViewProfile={onViewProfile}
          onFollow={(userId) => {
            // Follow action — future implementation
          }}
        />
      ))}

      {/* Loading more spinner */}
      {loadingMore && (
        <div className="flex justify-center py-4">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />

      {/* End of results */}
      {!hasMore && results.length > 0 && (
        <p className="text-xs text-center text-muted-foreground/40 py-4">
          {results.length >= 20 ? "No more results" : "All caught up"}
        </p>
      )}
    </div>
  );
}
