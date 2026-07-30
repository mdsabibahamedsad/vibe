"use client";

import { StoriesSection } from "@/features/stories/components/StoriesSection";
import { Feed } from "@/features/feed/components/Feed";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useI18n } from "@/components/i18n-provider";

export default function HomePage() {
  const { t } = useTranslation("navigation");
  const { isRtl } = useI18n();

  return (
    <div className="min-h-dvh bg-[var(--tg-theme-bg-color,#ffffff)]">
      <header className="sticky top-0 z-10 bg-[var(--tg-theme-bg-color,#ffffff)]/80 backdrop-blur-md border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold text-[var(--tg-theme-text-color,#000000)]">Vibe</h1>
          <div className="flex items-center gap-2">
            <Link
              href="/stories"
              className="rounded-full p-2 text-[var(--tg-theme-hint-color,#999999)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              aria-label={t("stories")}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </Link>
            <Link
              href="/settings"
              className="rounded-full p-2 text-[var(--tg-theme-hint-color,#999999)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              aria-label={t("settings")}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      <StoriesSection />
      <Feed />
    </div>
  );
}
