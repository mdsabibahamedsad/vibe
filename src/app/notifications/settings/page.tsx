"use client";

import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { NotificationSettings } from "@/features/notifications/components/NotificationSettings";
import { Loading, EmptyState } from "@/components/ui";

/**
 * Notification Settings Page — Manage notification preferences.
 *
 * Route: /notifications/settings
 *
 * Controls for in-app, Telegram, and quiet hours settings.
 */
export default function NotificationSettingsPage() {
  const router = useRouter();
  const { user, authenticated, loading: authLoading } = useCurrentUser();

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--tg-theme-bg-color,#ffffff)]">
        <Loading />
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <div className="flex min-h-dvh flex-col bg-[var(--tg-theme-bg-color,#ffffff)]">
        <Header onBack={() => router.back()} />
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            title="Sign in to manage notifications"
            description="Connect with Telegram to customize your notification preferences."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--tg-theme-bg-color,#ffffff)]">
      <Header onBack={() => router.back()} />
      <div className="flex-1 max-w-lg mx-auto w-full">
        <NotificationSettings />
      </div>
    </div>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <header className="sticky top-0 z-10 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)]/80 backdrop-blur-md">
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/10 dark:active:bg-white/15 transition-colors"
          aria-label="Go back"
        >
          <svg className="w-5 h-5 text-[var(--tg-theme-text-color,#000000)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
          Notification Settings
        </h1>
      </div>
    </header>
  );
}
