"use client";

import { useContext } from "react";
import { TelegramContext } from "@/components/telegram-provider";
import type { TelegramContextValue } from "@/components/telegram-provider";

/**
 * React hook that provides Telegram WebApp state.
 * Requires TelegramProvider to be mounted in the tree.
 *
 * Usage:
 *   const { ready, isTelegram, theme, unsafeUser } = useTelegramWebApp();
 */
export function useTelegramWebApp(): TelegramContextValue {
  return useContext(TelegramContext);
}
