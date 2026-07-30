"use client";

import { useCallback, useRef } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMatches } from "@/features/matching/hooks/useMatches";
import { MatchCard } from "@/features/matching/components/MatchCard";
import { Loading, EmptyState, ErrorState } from "@/components/ui";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
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
      <div className="flex min-h-dvh flex-col">
        <AppHeader title="Matches" />
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            title="Sign in to see your matches"
            description="Connect with Telegram to see your matches."
          />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col pb-safe">
      <AppHeader title="Matches" />

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
                className="mt-3 inline-flex items-center justify-center rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform active:scale-95"
              >
                Discover People
              </Link>
            }
          />
        </div>
      ) : (
        <div className="flex-1">
          <div className="px-4 py-2">
            <p className="text-xs font-medium text-muted">
              {matches.length} match{matches.length !== 1 ? "es" : ""}
            </p>
          </div>

          <div className="divide-y divide-divider">
            {matches.map((match) => (
              <MatchCard
                key={match.matchId}
                match={match}
                onPress={() => {
                  markAsRead(match.matchId);
                }}
              />
            ))}
          </div>

          {hasMore && (
            <div ref={loadMoreRef} className="flex justify-center py-6">
              {loadingMore ? (
                <Loading message="Loading more..." />
              ) : (
                <button onClick={loadMore} className="text-sm font-semibold text-gradient">
                  Load more
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
