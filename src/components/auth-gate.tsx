"use client";

import { useEffect, useRef } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTelegramWebApp } from "@/hooks/use-telegram-webapp";
import { logger } from "@/lib/logger";

/**
 * AuthGate — automatically authenticates the user when the app loads
 * inside Telegram Mini App environment.
 *
 * Flow:
 *   1. On mount, detect if running inside Telegram (via TelegramProvider state)
 *   2. If in Telegram, get the raw initData string from the WebApp
 *   3. Call authenticateWithTelegram(initData) to create/restore the session
 *   4. If not in Telegram and dev auth is available, optionally call it
 *
 * This component should be placed inside the TelegramProvider + AuthProvider tree,
 * typically in the root layout after both providers.
 *
 * It only runs once on mount (empty dependency array for the trigger).
 * Subsequent session restores are handled by AuthProvider internally.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isTelegram, initData, ready } = useTelegramWebApp();
  const { authenticateWithTelegram, authenticateDev, authenticated, error } = useCurrentUser();
  const hasAttemptedAuth = useRef(false);

  // Auto-authenticate when Telegram WebApp is ready and no session exists
  useEffect(() => {
    // Only attempt once
    if (hasAttemptedAuth.current) return;
    // Wait for Telegram provider to be ready
    if (!ready) return;
    // Don't re-auth if already authenticated (existing session restored by AuthProvider)
    if (authenticated) {
      hasAttemptedAuth.current = true;
      return;
    }

    hasAttemptedAuth.current = true;

    if (isTelegram && initData) {
      // Running inside Telegram Mini App — authenticate using initData
      logger.info("AuthGate: Telegram environment detected, authenticating with initData");
      authenticateWithTelegram(initData).catch((err: unknown) => {
        logger.error("AuthGate: Telegram auth failed", {
          error: err instanceof Error ? err.message : "Unknown error",
        });
      });
    } else if (!isTelegram && typeof window !== "undefined") {
      // Running outside Telegram — try dev auth for local development
      const isDev = process.env.NODE_ENV === "development";
      if (isDev) {
        logger.info("AuthGate: Outside Telegram in dev mode, trying dev auth");
        authenticateDev().catch((err: unknown) => {
          logger.error("AuthGate: Dev auth failed", {
            error: err instanceof Error ? err.message : "Unknown error",
          });
        });
      }
    }
  }, [ready, isTelegram, initData, authenticated, authenticateWithTelegram, authenticateDev]);

  // Log auth errors for debugging
  useEffect(() => {
    if (error) {
      logger.warn("AuthGate: Authentication error", { error });
    }
  }, [error]);

  return <>{children}</>;
}
