"use client";

import { createContext, type ReactNode, useEffect, useState } from "react";
import { initTelegramWebApp, isTelegramWebApp } from "@/lib/telegram";
import type { TelegramWebAppState } from "@/types/telegram";

const defaultState: TelegramWebAppState = {
  ready: false,
  platform: "unknown",
  colorScheme: "light",
  theme: {},
  viewportHeight: 0,
  viewportStableHeight: 0,
  isExpanded: false,
  initData: "",
};

export interface TelegramContextValue extends TelegramWebAppState {
  isTelegram: boolean;
}

export const TelegramContext = createContext<TelegramContextValue>({
  ...defaultState,
  isTelegram: false,
});

/**
 * TelegramProvider initializes the Telegram WebApp on mount
 * and makes the state available via React Context.
 *
 * Place this once in the root layout.
 */
export function TelegramProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TelegramContextValue>({
    ...defaultState,
    isTelegram: false,
  });

  useEffect(() => {
    const tg = isTelegramWebApp();

    if (tg) {
      const webAppState = initTelegramWebApp();
      setState({
        ...webAppState,
        isTelegram: true,
      });
    } else {
      setState({
        ...defaultState,
        ready: true,
        isTelegram: false,
      });
    }
  }, []);

  return <TelegramContext.Provider value={state}>{children}</TelegramContext.Provider>;
}
