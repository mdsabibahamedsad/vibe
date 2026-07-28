"use client";

import { useEffect, useState } from "react";
import { initTelegramWebApp, isTelegramWebApp } from "@/lib/telegram";
import { Button } from "@/components/ui";

type PageState = "loading" | "telegram" | "standalone";

export default function HomePage() {
  const [pageState, setPageState] = useState<PageState>("loading");

  useEffect(() => {
    // Small delay to let the Telegram WebApp script load
    const timer = setTimeout(() => {
      if (isTelegramWebApp()) {
        initTelegramWebApp();
        setPageState("telegram");
      } else {
        setPageState("standalone");
      }
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  if (pageState === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--tg-theme-button-color,#0088cc)] border-t-transparent" />
          <p className="text-sm text-[var(--tg-theme-hint-color,#999999)]">Loading Vibe...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-6 text-center">
        {/* Logo / Brand */}
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
            {pageState === "telegram"
              ? "Social discovery inside Telegram"
              : "Open this app inside Telegram for the best experience"}
          </p>
        </div>

        {/* Navigation buttons */}
        <div className="mt-4 flex w-full max-w-xs flex-col gap-3">
          <Button fullWidth>Get Started</Button>
          <Button variant="secondary" fullWidth>
            Learn More
          </Button>
        </div>
      </div>
    </div>
  );
}
