"use client";

import { createContext, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { logger } from "@/lib/logger";
import type { TelegramWebAppState, TelegramPlatform, TelegramColorScheme } from "@/types/telegram";

const defaultState: TelegramWebAppState = {
  ready: false,
  platform: "unknown" as TelegramPlatform,
  colorScheme: "light" as TelegramColorScheme,
  theme: {},
  viewportHeight: 0,
  viewportStableHeight: 0,
  isExpanded: false,
  initData: "",
};

export interface TelegramContextValue extends TelegramWebAppState {
  /** Whether the app is running inside a Telegram Mini App WebView */
  isTelegram: boolean;
  /** Whether initialization has completed (successfully or not) */
  ready: boolean;
}

export const TelegramContext = createContext<TelegramContextValue>({
  ...defaultState,
  ready: false,
  isTelegram: false,
});

const RETRY_INTERVAL_MS = 200;
const MAX_RETRIES = 15; // ~3 seconds total

interface TelegramWebAppSDK {
  initData: string;
  initDataUnsafe?: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    receiver?: unknown;
    chat?: {
      id: number;
      type: string;
      title?: string;
      username?: string;
      photo_url?: string;
    };
    start_param?: string;
    can_send_after?: number;
    auth_date?: number;
    hash?: string;
    query_id?: string;
  };
  version: string;
  platform: string;
  colorScheme: string;
  themeParams: Record<string, string>;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  isClosingConfirmationEnabled: boolean;
  ready(): void;
  expand(): void;
  close(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  onEvent(eventType: string, callback: () => void): void;
  offEvent(eventType: string, callback: () => void): void;
  sendData(data: string): void;
  switchInlineQuery(query: string, choose_chat_types?: string[]): void;
}

function getWebAppSDK(): TelegramWebAppSDK | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { Telegram?: { WebApp?: TelegramWebAppSDK } };
  return w.Telegram?.WebApp ?? null;
}

/**
 * Safely calls a Telegram SDK method, catching and logging errors
 * (e.g. "Connection closed" when the WebView bridge is unavailable).
 * Returns true if the call succeeded, false otherwise.
 */
function safeTelegramCall<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // "Connection closed" is a known Telegram WebView error that occurs when
    // the native bridge connection is interrupted or CSP-blocked.
    // It is safe to ignore — the app degrades gracefully.
    if (msg.includes("Connection closed")) {
      logger.debug("TelegramProvider: WebView bridge connection closed (expected in browser)");
    } else {
      logger.warn("TelegramProvider: SDK call failed", { error: msg });
    }
    return fallback;
  }
}

/**
 * TelegramProvider initializes the Telegram WebApp SDK once and exposes
 * its state via React Context.
 *
 * Design decisions:
 * - The Telegram WebView injects window.Telegram.WebApp natively BEFORE any
 *   page scripts run. No CDN script tag is needed in the HTML head.
 * - Retries detection up to ~3 seconds for edge cases where injection is delayed.
 * - Calls ready() + expand() exactly once on successful init, wrapped in
 *   safeTelegramCall to catch "Connection closed" errors gracefully.
 * - Sets up the Telegram back button handler safely (wrapped in try/catch).
 * - If the SDK is unavailable (normal browser), marks as ready with isTelegram: false.
 * - If SDK is available but calls fail (e.g. CSP-blocked bridge), degrades gracefully.
 * - Errors from Telegram APIs are caught to prevent crashes.
 */
export function TelegramProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TelegramContextValue>({
    ...defaultState,
    ready: false,
    isTelegram: false,
  });

  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router; // always fresh

  const initializedRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initWebApp = useCallback(() => {
    if (initializedRef.current) return true;

    const sdk = getWebAppSDK();
    if (!sdk) return false;

    try {
      // Signal readiness to Telegram — wrapped to catch "Connection closed"
      safeTelegramCall(() => sdk.ready(), undefined);
      safeTelegramCall(() => sdk.expand(), undefined);

      // Set up Telegram back button to use Next.js router navigation
      // router.back() respects the client-side navigation stack and keeps the SPA intact.
      safeTelegramCall(() => {
        sdk.onEvent?.("backButtonClicked", () => {
          routerRef.current?.back();
        });
      }, undefined);

      initializedRef.current = true;

      setState({
        ready: true,
        isTelegram: true,
        platform: (sdk.platform as TelegramPlatform) || "unknown",
        colorScheme: (sdk.colorScheme as TelegramColorScheme) || "light",
        theme: sdk.themeParams ? { ...sdk.themeParams } : {},
        viewportHeight: sdk.viewportHeight ?? 0,
        viewportStableHeight: sdk.viewportStableHeight ?? 0,
        isExpanded: sdk.isExpanded ?? false,
        initData: sdk.initData ?? "",
        unsafeUser: sdk.initDataUnsafe?.user,
      });

      logger.info("TelegramProvider: WebApp initialized", {
        platform: sdk.platform,
        version: sdk.version,
      });

      return true;
    } catch (err) {
      // Telegram bridge may be CSP-blocked or otherwise unavailable
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("TelegramProvider: WebApp init failed", { error: msg });

      // Mark as ready but not Telegram so the app can degrade gracefully
      initializedRef.current = true;
      setState({
        ...defaultState,
        ready: true,
        isTelegram: false,
      });

      return true;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Attempt initialization with retries for edge-case delayed injection
    const attempt = () => {
      if (initWebApp()) return; // Success or terminal failure

      retryCountRef.current += 1;

      if (retryCountRef.current < MAX_RETRIES) {
        // SDK not loaded yet — schedule a retry
        retryTimerRef.current = setTimeout(attempt, RETRY_INTERVAL_MS);
      } else {
        // SDK never appeared — running outside Telegram
        initializedRef.current = true;
        setState({
          ...defaultState,
          ready: true,
          isTelegram: false,
        });
        logger.info("TelegramProvider: Not a Telegram environment (SDK unavailable after retries)");
      }
    };

    attempt();

    return () => {
      // Cancel any pending retry timer
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      // Reset ref so re-mount can re-attempt
      initializedRef.current = false;
    };
  }, [initWebApp]);

  return <TelegramContext.Provider value={state}>{children}</TelegramContext.Provider>;
}
