"use client";

import { useCallback, useRef } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMatches } from "@/features/matching/hooks/useMatches";
import { MatchCard } from "@/features/matching/components/MatchCard";
import { EmptyState, ErrorState, ChatSkeleton } from "@/components/ui";
import { AppHeader } from "@/components/app-header";
import { BottomNav, DesktopNav } from "@/components/bottom-nav";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function MatchesPage() {
  const { user, authenticated, loading: authLoading } = useCurrentUser();
  const { t } = useTranslation("dating");
  const { t: tNav } = useTranslation("navigation");
  const {
    matches,
    loading,
    loadingMore,
    error,
    hasMore,
    refresh,
    loadMore,
    removeMatch: _removeMatch,
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

  if (authLoading || (!user && authenticated === undefined)) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader title={t("matchesTitle")} />
        <ChatSkeleton />
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader title={t("matchesTitle")} />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState title={tNav("signInToSee")} description={tNav("connectTelegram")} />
        </div>
        <BottomNav />
        <DesktopNav />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col pb-safe">
      <AppHeader title={t("matchesTitle")} />

      <main className="mx-auto w-full max-w-2xl flex-1">
        {loading ? (
          <ChatSkeleton />
        ) : error ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <ErrorState title={t("matchesErrorTitle")} message={error} onRetry={refresh} />
          </div>
        ) : matches.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <EmptyState
              title={t("matchesEmptyTitle")}
              description={t("matchesEmptyDescription")}
              action={
                <Link
                  href="/dating"
                  className="mt-3 inline-flex items-center justify-center rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform active:scale-95"
                >
                  {t("matchesDiscoverCta")}
                </Link>
              }
            />
          </div>
        ) : (
          <>
            <div className="px-4 py-2">
              <p className="text-xs font-medium text-muted">
                {t("matchCount", { count: matches.length })}
              </p>
            </div>

            <div className="space-y-2 px-3 pb-4">
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
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
                ) : (
                  <button
                    onClick={loadMore}
                    className="text-sm font-semibold text-primary transition-opacity hover:opacity-80"
                  >
                    {t("loadingMore")}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <BottomNav />
      <DesktopNav />
    </div>
  );
}
