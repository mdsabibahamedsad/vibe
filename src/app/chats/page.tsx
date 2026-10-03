"use client";

import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMatches } from "@/features/matching/hooks/useMatches";
import { MatchCard } from "@/features/matching/components/MatchCard";
import { EmptyState, ChatSkeleton } from "@/components/ui";
import { AppHeader } from "@/components/app-header";
import { BottomNav, DesktopNav } from "@/components/bottom-nav";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function ChatsPage() {
  const router = useRouter();
  const { user, authenticated, loading: authLoading } = useCurrentUser();
  const { t: tNav } = useTranslation("navigation");
  const { t: tChat } = useTranslation("chat");
  const {
    matches,
    loading: matchesLoading,
    error,
    refresh,
  } = useMatches();

  if (authLoading || (!user && authenticated === undefined)) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader title={tNav("chats")} />
        <ChatSkeleton />
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader title={tNav("chats")} />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title={tNav("signInToSee")}
            description={tNav("connectTelegram")}
          />
        </div>
        <BottomNav />
        <DesktopNav />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col pb-safe">
      <AppHeader title={tNav("chats")} />

      <main className="mx-auto w-full max-w-2xl flex-1">
        {matchesLoading ? (
          <ChatSkeleton />
        ) : error ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <div className="px-4 text-center">
              <p className="text-sm text-muted">{error}</p>
              <button
                onClick={refresh}
                className="mt-3 rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform active:scale-95"
              >
                {tNav("home.retry")}
              </button>
            </div>
          </div>
        ) : matches.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <EmptyState
              title={tChat("emptyTitle")}
              description={tChat("emptyDescription")}
              action={
                <button
                  onClick={() => router.push("/dating")}
                  className="mt-3 inline-flex items-center justify-center rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform active:scale-95"
                >
                  {tChat("discoverPeople")}
                </button>
              }
            />
          </div>
        ) : (
          <>
            <div className="px-4 py-2">
              <p className="text-xs font-medium text-muted">{tChat("conversationCount", { count: matches.length })}</p>
            </div>
            <div className="space-y-2 px-3 pb-4">
              {matches.map((match) => (
                <MatchCard
                  key={match.matchId}
                  match={match}
                  onPress={() => router.push(`/chat/${match.matchId}`)}
                />
              ))}
            </div>
          </>
        )}
      </main>

      <BottomNav />
      <DesktopNav />
    </div>
  );
}
