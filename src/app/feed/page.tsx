"use client";

import { Feed } from "@/features/feed/components/Feed";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";

export default function FeedPage() {
  const { t } = useTranslation("navigation");

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        brand
        actions={
          <a
            href="/create"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-white shadow-glow transition-transform active:scale-90"
            aria-label={t("create")}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </a>
        }
      />

      <main className="flex-1">
        <Feed />
      </main>

      <BottomNav />
    </div>
  );
}
