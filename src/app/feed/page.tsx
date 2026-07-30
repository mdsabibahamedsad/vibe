"use client";

import { Feed } from "@/features/feed/components/Feed";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function FeedPage() {
  const { t } = useTranslation("navigation");

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--tg-theme-bg-color,#ffffff)]">
      <header className="sticky top-0 z-10 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)]/80 backdrop-blur-lg">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-[var(--tg-theme-text-color,#000000)]">Vibe</h1>
          <a
            href="/create"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tg-theme-button-color,#0088cc)] text-white"
            aria-label={t("create")}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </a>
        </div>
      </header>

      <main className="flex-1">
        <Feed />
      </main>

      <nav className="sticky bottom-0 z-10 border-t border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)]/80 backdrop-blur-lg">
        <div className="flex items-center justify-around py-2">
          <a
            href="/feed"
            className="flex flex-col items-center gap-0.5 px-4 py-1 text-[var(--tg-theme-button-color,#0088cc)]"
            aria-label={t("bottomNav.feed")}
          >
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
            </svg>
            <span className="text-[10px] font-medium">{t("bottomNav.feed")}</span>
          </a>
          <a
            href="/discover"
            className="flex flex-col items-center gap-0.5 px-4 py-1 text-[var(--tg-theme-hint-color,#999999)]"
            aria-label={t("bottomNav.discover")}
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span className="text-[10px] font-medium">{t("bottomNav.discover")}</span>
          </a>
          <a
            href="/matches"
            className="flex flex-col items-center gap-0.5 px-4 py-1 text-[var(--tg-theme-hint-color,#999999)]"
            aria-label={t("bottomNav.matches")}
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
            <span className="text-[10px] font-medium">{t("bottomNav.matches")}</span>
          </a>
          <a
            href="/chats"
            className="flex flex-col items-center gap-0.5 px-4 py-1 text-[var(--tg-theme-hint-color,#999999)]"
            aria-label={t("bottomNav.chats")}
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <span className="text-[10px] font-medium">{t("bottomNav.chats")}</span>
          </a>
          <a
            href="/profile"
            className="flex flex-col items-center gap-0.5 px-4 py-1 text-[var(--tg-theme-hint-color,#999999)]"
            aria-label={t("bottomNav.profile")}
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span className="text-[10px] font-medium">{t("bottomNav.profile")}</span>
          </a>
        </div>
      </nav>
    </div>
  );
}
