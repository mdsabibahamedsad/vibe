"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTelegramWebApp } from "@/hooks/use-telegram-webapp";
import { useUnreadCount } from "@/features/notifications/hooks/useUnreadCount";
import { StoriesSection } from "@/features/stories/components/StoriesSection";
import { Feed } from "@/features/feed/components/Feed";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { Avatar } from "@/components/ui/avatar";
import { useTranslation } from "@/lib/i18n/useTranslation";

/** Light haptic tick (no-op outside Telegram). */
function hapticLight(): void {
  try {
    const tg = (
      window as unknown as {
        Telegram?: {
          WebApp?: {
            HapticFeedback?: { impactOccurred?: (style: string) => void };
          };
        };
      }
    ).Telegram;
    tg?.WebApp?.HapticFeedback?.impactOccurred?.("light");
  } catch {
    // Haptics unavailable — silently ignore
  }
}

export default function HomePage() {
  const { loading: authLoading, authenticated, error: authError } = useCurrentUser();
  const { isTelegram, ready: tgReady } = useTelegramWebApp();
  const { total: unreadCount } = useUnreadCount();
  const { t } = useTranslation("navigation");
  const [retrying, setRetrying] = useState(false);

  const handleRetry = useCallback(async () => {
    hapticLight();
    setRetrying(true);
    try {
      // Retry function exposed by AuthGate on window
      const retryFn = (window as unknown as Record<string, unknown>).__vibeRetryAuth;
      if (typeof retryFn === "function") {
        await (retryFn as () => Promise<void>)();
      }
    } catch {
      // Retry function may not be available yet
    } finally {
      setRetrying(false);
    }
  }, []);

  const header = (
    <AppHeader
      brand
      leading={
        authenticated ? (
          <Link
            href="/profile"
            aria-label={t("profile")}
            className="rounded-full transition-transform active:scale-90"
          >
            <Avatar
              alt={t("profile")}
              size="sm"
              ring
            />
          </Link>
        ) : undefined
      }
      actions={
        <>
          <Link
            href="/notifications"
            aria-label={t("notifications")}
            className="relative rounded-full p-2 text-muted transition-colors hover:text-fg"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1h6z"
              />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white shadow-accent-glow">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
          <Link
            href="/settings"
            aria-label={t("settings")}
            className="rounded-full p-2 text-muted transition-colors hover:text-fg"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
        </>
      }
    />
  );

  // Auth state still being determined — brand loading screen (brief)
  if (authLoading && !authError) {
    return (
      <div className="flex min-h-dvh flex-col">
        {header}
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted">{t("home.authenticating")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {header}

      <main className="flex-1 pb-4">
        {authenticated ? (
          <>
            <StoriesSection />
            <Feed />
          </>
        ) : authError ? (
          // Authentication failed — clear retry state, never an infinite spinner
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-danger/10">
              <svg
                className="h-8 w-8 text-danger"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="font-display text-xl font-bold text-fg">{t("home.authFailed")}</h2>
            <p className="mt-2 max-w-xs text-sm text-muted">{t("home.authFailedSub")}</p>
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="mt-6 rounded-full bg-brand-gradient px-8 py-2.5 text-sm font-semibold text-white shadow-glow transition-all active:scale-95 disabled:opacity-60"
            >
              {retrying ? t("home.retrying") : t("home.retry")}
            </button>
          </div>
        ) : tgReady && isTelegram ? (
          // In Telegram, not yet authenticated — brief connecting state
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-4 text-sm text-muted">{t("home.authenticating")}</p>
          </div>
        ) : (
          // Outside Telegram (browser visitor) — brand welcome
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="animate-pop-in mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-gradient shadow-glow">
              <span className="font-display text-4xl font-bold text-white">V</span>
            </div>
            <h2 className="font-display text-2xl font-bold text-fg">{t("home.welcome")}</h2>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
              {t("home.welcomeSub")}
            </p>
            <Link
              href="/feed"
              className="mt-6 rounded-full bg-brand-gradient px-8 py-2.5 text-sm font-semibold text-white shadow-glow transition-all active:scale-95"
            >
              {t("home.open")}
            </Link>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
