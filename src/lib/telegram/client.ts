/**
 * Telegram WebApp integration module.
 *
 * Provides a clean abstraction for interacting with the Telegram Mini App environment.
 *
 * IMPORTANT SECURITY NOTE:
 * Client-provided Telegram identity data (initDataUnsafe.user) must NOT be trusted
 * for authorization purposes. The initData string must be validated server-side
 * using the Telegram Bot Token before relying on the user identity.
 *
 * Server-side validation flow:
 *   1. Client sends the raw initData string to the server
 *   2. Server validates the HMAC-SHA-256 signature using the Bot Token
 *   3. Server extracts the verified user data
 *   4. Server creates/retrieves the user in Supabase
 *   5. Server issues a session token
 *
 * TODO: Implement server-side initData validation endpoint.
 */

import type {
  TelegramWebAppState,
  TelegramInitDataUnsafe,
  TelegramThemeParams,
  TelegramPlatform,
  TelegramColorScheme,
} from "@/types/telegram";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

/**
 * Telegram WebApp interface from the Telegram SDK.
 */
interface TelegramWebApp {
  initData: string;
  initDataUnsafe: TelegramInitDataUnsafe;
  version: string;
  platform: string;
  colorScheme: TelegramColorScheme;
  themeParams: TelegramThemeParams;
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
  setBackButtonVisibility(visibility: boolean): void;
}

/**
 * Check if running inside Telegram WebApp.
 */
export function isTelegramWebApp(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as Window).Telegram?.WebApp;
}

/**
 * Get the Telegram WebApp instance (or null if not available).
 */
function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return (window as Window).Telegram?.WebApp ?? null;
}

/**
 * Initialize the Telegram WebApp.
 * Should be called once on app mount.
 */
export function initTelegramWebApp(): TelegramWebAppState {
  const webApp = getWebApp();

  if (!webApp) {
    return {
      ready: false,
      platform: "unknown",
      colorScheme: "light",
      theme: {},
      viewportHeight: 0,
      viewportStableHeight: 0,
      isExpanded: false,
      initData: "",
    };
  }

  // Signal to Telegram that the Mini App is ready
  webApp.ready();

  // Expand the Mini App to full height
  webApp.expand();

  return {
    ready: true,
    platform: webApp.platform as TelegramPlatform,
    colorScheme: webApp.colorScheme,
    theme: { ...webApp.themeParams },
    viewportHeight: webApp.viewportHeight,
    viewportStableHeight: webApp.viewportStableHeight,
    isExpanded: webApp.isExpanded,
    initData: webApp.initData,
    unsafeUser: webApp.initDataUnsafe.user,
  };
}

/**
 * Get the raw initData string for server-side validation.
 * This should be sent to the server to validate the user identity.
 */
export function getInitData(): string {
  return getWebApp()?.initData ?? "";
}

/**
 * Set Telegram header color to match the app theme.
 */
export function setHeaderColor(color: string): void {
  getWebApp()?.setHeaderColor(color);
}

/**
 * Set Telegram background color to match the app theme.
 */
export function setBackgroundColor(color: string): void {
  getWebApp()?.setBackgroundColor(color);
}

/**
 * Expand the Mini App to full viewport height.
 */
export function expand(): void {
  getWebApp()?.expand();
}

/**
 * Close the Mini App.
 */
export function close(): void {
  getWebApp()?.close();
}

/**
 * Send data back to the Telegram Bot.
 */
export function sendData(data: string): void {
  getWebApp()?.sendData(data);
}
