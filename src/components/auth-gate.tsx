"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTelegramWebApp } from "@/hooks/use-telegram-webapp";
import { useAuthBootstrap } from "@/hooks/use-auth";
import {
  AUTH_MAX_ATTEMPTS,
  classifyAuthError,
  retryDelayMs,
  shouldRetry,
} from "@/lib/auth/auth-machine";
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
 * Retry behavior (bounded — never infinite, never hammering):
 *   - Up to AUTH_MAX_ATTEMPTS automatic attempts with exponential backoff
 *     (1s, 2s, 4s… capped). Credential rejections (400/401) are NOT retried
 *     automatically — the user gets a Retry button instead.
 *   - While offline, retries are deferred until the browser fires `online`.
 *   - After the budget is exhausted the gate stops; status becomes
 *     "error"/"unauthenticated" with the failure message, and the user can
 *     retry manually (which resets the budget).
 *
 * This component should be placed inside the TelegramProvider + AuthProvider tree,
 * typically in the root layout after both providers.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isTelegram, initData, ready } = useTelegramWebApp();
  const { authenticateWithTelegram, authenticateDev, status, bootstrapped, error, attempts } =
    useAuthBootstrap();
  const autoStartedRef = useRef(false);
  const offlineDeferredRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  /**
   * Attempt authentication based on the current Telegram context.
   * Safe to call multiple times. Manual calls (retry button) reset the
   * automatic-attempt budget when the previous round ended in error.
   */
  const attemptAuth = useCallback(async (opts?: { manual?: boolean; isRetry?: boolean }) => {
    if (status === "authenticating" || status === "retrying") return; // already in progress

    if (isTelegram && initData) {
      // Running inside Telegram Mini App — authenticate using initData.
      // initData itself is never logged (it is a bearer credential).
      logger.info("[AUTH] telegram environment detected, authenticating", {
        manual: opts?.manual ?? false,
      });
      try {
        await authenticateWithTelegram(initData, { isRetry: opts?.isRetry });
      } catch (err: unknown) {
        logger.error("[AUTH] telegram auth threw", {
          kind: classifyAuthError(err).kind,
        });
      }
    } else if (!isTelegram && typeof window !== "undefined") {
      // Running outside Telegram — try dev auth for local development
      const isDev = process.env.NODE_ENV === "development";
      if (isDev) {
        logger.info("[AUTH] outside telegram in dev mode, trying dev auth");
        try {
          await authenticateDev();
        } catch (err: unknown) {
          logger.error("[AUTH] dev auth threw", {
            kind: classifyAuthError(err).kind,
          });
        }
      }
    }
  }, [isTelegram, initData, status, authenticateWithTelegram, authenticateDev]);

  /**
   * Manual retry entry point (wired to UI retry buttons + window handle).
   * Resets the backoff timer and re-attempts immediately as a "retry".
   */
  const retryAuth = useCallback(async () => {
    clearRetryTimer();
    offlineDeferredRef.current = false;
    await attemptAuth({ manual: true, isRetry: true });
  }, [attemptAuth, clearRetryTimer]);

  // Auto-authenticate when Telegram WebApp is ready and no session exists.
  // Fires once; subsequent automatic attempts are driven by the effect below.
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!ready) return;
    // Don't re-auth if already authenticated (session verified by AuthProvider)
    if (status === "authenticated") {
      autoStartedRef.current = true;
      return;
    }
    // Only auto-start from the pre-auth states.
    if (status !== "loading" && status !== "unauthenticated") return;

    autoStartedRef.current = true;
    attemptAuth();
  }, [ready, status, attemptAuth]);

  // Bounded automatic retry: while the last attempt ended in "error" with a
  // retryable message and budget remains, back off and try again.
  // Credential failures land in "unauthenticated" (not retried automatically).
  useEffect(() => {
    if (!bootstrapped && status !== "error") return;
    if (status !== "error") return;
    if (!shouldRetry(attempts, AUTH_MAX_ATTEMPTS)) {
      logger.warn("[AUTH] automatic retry budget exhausted", { attempts });
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      // Offline — defer until the browser reports connectivity again.
      offlineDeferredRef.current = true;
      logger.info("[AUTH] offline — retry deferred until online");
      return;
    }
    const delay = retryDelayMs(attempts);
    logger.info("[AUTH] scheduling automatic retry", { attempt: attempts + 1, delayMs: delay });
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      attemptAuth({ isRetry: true });
    }, delay);
    return clearRetryTimer;
  }, [status, bootstrapped, attempts, attemptAuth, clearRetryTimer]);

  // Recover when the network comes back (offline → online).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      logger.info("[AUTH] network online");
      if (offlineDeferredRef.current || status === "error" || status === "unauthenticated") {
        offlineDeferredRef.current = false;
        // Only auto-retry on reconnect when Telegram auth data is available
        // and we are not already authenticated.
        if (isTelegram && initData && status !== "authenticated") {
          attemptAuth({ isRetry: true });
        }
      }
    };
    const onOffline = () => {
      logger.info("[AUTH] network offline — reconnect attempts paused");
      clearRetryTimer();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearRetryTimer();
    };
  }, [status, isTelegram, initData, attemptAuth, clearRetryTimer]);

  // Log auth errors for debugging (message only — never initData/tokens).
  useEffect(() => {
    if (error) {
      logger.warn("[AUTH] authentication error surfaced", { error });
    }
  }, [error]);

  // Expose retryAuth on window for debugging / retry buttons
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__vibeRetryAuth = retryAuth;
    }
  }, [retryAuth]);

  return <>{children}</>;
}
