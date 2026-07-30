"use client";

import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMatches } from "@/features/matching/hooks/useMatches";
import { MatchCard } from "@/features/matching/components/MatchCard";
import { Loading, EmptyState } from "@/components/ui";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";

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
      <div className="flex min-h-dvh flex-col">
        <AppHeader title="Chats" />
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            title="Sign in to see your chats"
            description="Connect with Telegram to see your conversations."
          />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col pb-safe">
      <AppHeader title="Chats" />

      {matchesLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loading message="Loading chats..." />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-4">
            <p className="text-sm text-muted">{error}</p>
            <button onClick={refresh} className="mt-3 text-sm font-semibold text-gradient">
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
                className="mt-3 inline-flex items-center justify-center rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform active:scale-95"
              >
                Discover People
              </button>
            }
          />
        </div>
      ) : (
        <div className="flex-1">
          <div className="px-4 py-2">
            <p className="text-xs font-medium text-muted">
              {matches.length} conversation{matches.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="divide-y divide-divider">
            {matches.map((match) => (
              <MatchCard
                key={match.matchId}
                match={match}
                onPress={() => router.push(`/chat/${match.matchId}`)}
              />
            ))}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
