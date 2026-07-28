"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTelegramWebApp } from "@/hooks/use-telegram-webapp";
import { initTelegramWebApp, isTelegramWebApp } from "@/lib/telegram";
import { Button } from "@/components/ui";

type PageState = "loading" | "authenticated" | "unauthenticated";

export default function HomePage() {
  const router = useRouter();
  const {
    loading: authLoading,
    authenticated,
    user,
    authenticateWithTelegram,
    authenticateDev,
    error: authError,
  } = useCurrentUser();
  const { initData } = useTelegramWebApp();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [devAuthEnabled, setDevAuthEnabled] = useState(false);

  // Check if dev auth is available
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      setDevAuthEnabled(true);
    }
  }, []);

  // Handle authentication state
  useEffect(() => {
    if (authLoading) return;

    if (authenticated && user) {
      setPageState("authenticated");

      // Redirect to onboarding if needed
      if (user.needsOnboarding) {
        router.push("/onboarding");
        return;
      }

      // Otherwise stay on home page
      setPageState("authenticated");
    } else {
      setPageState("unauthenticated");
    }
  }, [authLoading, authenticated, user, router]);

  // Auto-authenticate via Telegram
  useEffect(() => {
    if (pageState !== "unauthenticated") return;

    const init = async () => {
      if (isTelegramWebApp()) {
        initTelegramWebApp();

        // Wait a brief moment for the Telegram WebApp script to fully initialize
        setTimeout(async () => {
          if (typeof window !== "undefined") {
            const tg = (window as Window).Telegram?.WebApp;
            if (tg?.initData) {
              await authenticateWithTelegram(tg.initData);
            }
          }
        }, 200);
      }
    };

    init();
  }, [pageState, authenticateWithTelegram]);

  if (pageState === "loading" || authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--tg-theme-button-color,#0088cc)] border-t-transparent" />
          <p className="text-sm text-[var(--tg-theme-hint-color,#999999)]">Loading Vibe...</p>
        </div>
      </div>
    );
  }

  // Authenticated + complete profile — show home
  if (authenticated && user) {
    return (
      <div className="flex min-h-dvh flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)] px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
              Vibe
            </h1>
            <button
              onClick={() => router.push("/settings")}
              className="rounded-full p-2 text-[var(--tg-theme-hint-color,#999999)] hover:bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--tg-theme-button-color,#0088cc)]">
              <span className="text-3xl font-bold text-[var(--tg-theme-button-text-color,#ffffff)]">
                V
              </span>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-[var(--tg-theme-text-color,#000000)]">
                Welcome, {user.displayName}!
              </h1>
              <p className="text-[var(--tg-theme-hint-color,#999999)]">
                Your profile is ready. Coming soon: discover, feed, and chat.
              </p>
            </div>
            <div className="flex w-full max-w-xs flex-col gap-3">
              <Button fullWidth onClick={() => router.push("/settings")}>
                Edit Profile
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated — show login/splash screen
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--tg-theme-button-color,#0088cc)]">
          <span className="text-3xl font-bold text-[var(--tg-theme-button-text-color,#ffffff)]">
            V
          </span>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[var(--tg-theme-text-color,#000000)]">
            Welcome to Vibe
          </h1>
          <p className="text-[var(--tg-theme-hint-color,#999999)]">
            Social discovery inside Telegram
          </p>
        </div>

        {authError && <p className="text-sm text-red-500">{authError}</p>}

        {devAuthEnabled && (
          <div className="flex w-full max-w-xs flex-col gap-3">
            <Button fullWidth variant="secondary" onClick={() => authenticateDev()}>
              Dev Login
            </Button>
          </div>
        )}

        <p className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
          Open this inside Telegram for the full experience
        </p>
      </div>
    </div>
  );
}
