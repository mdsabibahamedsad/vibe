"use client";

import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMatches } from "@/features/matching/hooks/useMatches";
import { MatchCard } from "@/features/matching/components/MatchCard";
import { Loading, EmptyState } from "@/components/ui";

/**
 * Chats Page — Shows all matched conversations.
 *
 * Redirects to individual chat on tap.
 * Reuses the MatchCard component for consistency.
 */
export default function ChatsPage() {
  const router = useRouter();
  const { user, authenticated, loading: authLoading } = useCurrentUser();
  const {
    matches,
    loading: matchesLoading,
    error,
    refresh,
  } = useMatches();

  if (authLoading || (!user && authenticated === undefined)) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loading />
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <div className="flex min-h-dvh flex-col bg-[var(--tg-theme-bg-color,#ffffff)]">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            title="Sign in to see your chats"
            description="Connect with Telegram to see your conversations."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--tg-theme-bg-color,#ffffff)] pb-safe">
      <Header />

      {matchesLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loading message="Loading chats..." />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-4">
            <p className="text-sm text-[var(--tg-theme-hint-color,#999999)]">
              {error}
            </p>
            <button
              onClick={refresh}
              className="mt-3 text-sm font-medium text-[var(--tg-theme-button-color,#0088cc)]"
            >
              Try again
            </button>
          </div>
        </div>
      ) : matches.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            title="No conversations yet"
            description="When you match with someone, you can start chatting here."
            action={
              <button
                onClick={() => router.push("/discover")}
                className="mt-3 inline-block rounded-xl bg-[var(--tg-theme-button-color,#0088cc)] px-6 py-2.5 text-sm font-medium text-white"
              >
                Discover People
              </button>
            }
          />
        </div>
      ) : (
        <div className="flex-1">
          <div className="px-4 py-2">
            <p className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
              {matches.length} conversation{matches.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="divide-y divide-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
            {matches.map((match) => (
              <MatchCard
                key={match.matchId}
                match={match}
                onPress={() => {
                  router.push(`/chat/${match.matchId}`);
                }}
              />
            ))}
          </div>
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
          Chats
        </h1>
      </div>
    </header>
  );
}
