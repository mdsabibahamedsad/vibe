"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChatScreen } from "@/features/chat/components/ChatScreen";
import { Loading } from "@/components/ui";
import { useCurrentUser } from "@/hooks/use-current-user";

/**
 * Chat Page — Individual match chat screen.
 *
 * Route: /chat/[matchId]
 *
 * Wraps ChatScreen with auth check and navigation.
 */
export default function ChatPage() {
  const params = useParams<{ matchId: string }>();
  const router = useRouter();
  const { user, authenticated, loading: authLoading } = useCurrentUser();

  const matchId = params?.matchId;

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--tg-theme-bg-color,#ffffff)]">
        <Loading message="Loading chat..." />
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--tg-theme-bg-color,#ffffff)]">
        <Loading message="Sign in required..." />
      </div>
    );
  }

  if (!matchId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--tg-theme-bg-color,#ffffff)]">
        <p className="text-sm text-[var(--tg-theme-hint-color,#999999)]">
          Invalid chat
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <ChatScreen
        matchId={matchId}
        onBack={() => router.push("/matches")}
        onViewProfile={(userId) => {
          router.push(`/profile/${userId}`);
        }}
        onReport={(userId) => {
          // Future: redirect to report flow
          router.push(`/report?userId=${userId}&context=match`);
        }}
        onBlock={(userId) => {
          if (confirm("Block this user? This will unmatch and prevent future contact.")) {
            fetch("/api/blocks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ targetUserId: userId }),
            })
              .then(() => router.push("/matches"))
              .catch(() => {});
          }
        }}
        onUnmatch={(matchId) => {
          if (confirm("Unmatch this user? This will end the match permanently.")) {
            fetch(`/api/matches/${matchId}/unmatch`, { method: "POST" })
              .then(() => router.push("/matches"))
              .catch(() => {});
          }
        }}
      />
    </div>
  );
}
