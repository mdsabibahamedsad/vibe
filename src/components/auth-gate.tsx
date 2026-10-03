"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTelegramWebApp } from "@/hooks/use-telegram-webapp";
import { useAuthBootstrap } from "@/hooks/use-auth";
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
 * Retry behavior:
 *   - If the first auth attempt fails, the gate does NOT permanently block.
 *   - The `attemptAuth` callback can be called again (e.g. by a retry button).
 *   - A brief cooldown (2 s) prevents rapid-fire retries.
 *
 * This component should be placed inside the TelegramProvider + AuthProvider tree,
 * typically in the root layout after both providers.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isTelegram, initData, ready } = useTelegramWebApp();
  const { authenticateWithTelegram, authenticateDev, status, bootstrapped, error } = useAuthBootstrap();
  const hasAttemptedAuth = useRef(false);
  const lastAttemptRef = useRef(0);

  /**
   * Attempt authentication based on the current Telegram context.
   * Safe to call multiple times — respects a 2-second cooldown.
   */
  const attemptAuth = useCallback(async () => {
    if (status === "authenticating") return; // already in progress

    const now = Date.now();
    if (now - lastAttemptRef.current < 2000) return; // cooldown
    lastAttemptRef.current = now;

    if (isTelegram && initData) {
      // Running inside Telegram Mini App — authenticate using initData
      logger.info("AuthGate: Telegram environment detected, authenticating with initData");
      try {
        await authenticateWithTelegram(initData);
      } catch (err: unknown) {
        logger.error("AuthGate: Telegram auth failed", {
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    } else if (!isTelegram && typeof window !== "undefined") {
      // Running outside Telegram — try dev auth for local development
      const isDev = process.env.NODE_ENV === "development";
      if (isDev) {
        logger.info("AuthGate: Outside Telegram in dev mode, trying dev auth");
        try {
          await authenticateDev();
        } catch (err: unknown) {
          logger.error("AuthGate: Dev auth failed", {
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
    }
  }, [isTelegram, initData, status, authenticateWithTelegram, authenticateDev]);

  // Auto-authenticate when Telegram WebApp is ready and no session exists
  useEffect(() => {
    // Only attempt once automatically
    if (hasAttemptedAuth.current) return;
    // Wait for Telegram provider to be ready
    if (!ready) return;
    // Don't re-auth if already authenticated (session verified by AuthProvider)
    if (status === "authenticated" || status === "error") {
      hasAttemptedAuth.current = true;
      return;
    }

    hasAttemptedAuth.current = true;
    attemptAuth();
  }, [ready, status, attemptAuth]);

  // Log auth errors for debugging
  useEffect(() => {
    if (error) {
      logger.warn("AuthGate: Authentication error", { error });
    }
  }, [error]);

  // Expose retryAuth on window for debugging / retry buttons
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__vibeRetryAuth = attemptAuth;
    }
  }, [attemptAuth]);

  return <>{children}</>;
}
