"use client";

import { useCallback, useRef, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMatches } from "@/features/matching/hooks/useMatches";
import { MatchCard } from "@/features/matching/components/MatchCard";
import { Loading, EmptyState, ErrorState } from "@/components/ui";
import Link from "next/link";

export default function MatchesPage() {
  const { user, authenticated } = useCurrentUser();
  const {
    matches,
    loading,
    loadingMore,
    error,
    hasMore,
    refresh,
    loadMore,
    removeMatch,
    markAsRead,
  } = useMatches();

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loadingMore) return;
      if (observerRef.current) observerRef.current.disconnect();

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      });

      if (node) observerRef.current.observe(node);
    },
    [loadingMore, hasMore, loadMore],
  );

  if (!authenticated || !user) {
    return (
      <div className="flex min-h-dvh flex-col bg-[var(--tg-theme-bg-color,#ffffff)]">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            title="Sign in to see your matches"
            description="Connect with Telegram to see your matches."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--tg-theme-bg-color,#ffffff)] pb-safe">
      <Header />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loading message="Loading matches..." />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <ErrorState title="Failed to load matches" message={error} onRetry={refresh} />
        </div>
      ) : matches.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            title="No matches yet"
            description="Keep discovering people who share your interests. When you both like each other, you'll match here."
            action={
              <Link
                href="/discover"
                className="mt-3 inline-block rounded-xl bg-[var(--tg-theme-button-color,#0088cc)] px-6 py-2.5 text-sm font-medium text-white"
              >
                Discover People
              </Link>
            }
          />
        </div>
      ) : (
        <div className="flex-1">
          {/* Match count */}
          <div className="px-4 py-2">
            <p className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
              {matches.length} match{matches.length !== 1 ? "es" : ""}
            </p>
          </div>

          {/* Match list */}
          <div className="divide-y divide-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
            {matches.map((match) => (
              <MatchCard
                key={match.matchId}
                match={match}
                onPress={() => {
                  markAsRead(match.matchId);
                  // Future: navigate to chat
                }}
              />
            ))}
          </div>

          {/* Load more trigger */}
          {hasMore && (
            <div ref={loadMoreRef} className="flex justify-center py-6">
              {loadingMore ? (
                <Loading message="Loading more..." />
              ) : (
                <button
                  onClick={loadMore}
                  className="text-sm text-[var(--tg-theme-button-color,#0088cc)] font-medium"
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

function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)]/80 backdrop-blur-md">
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
          Matches
        </h1>
      </div>
    </header>
  );
}
