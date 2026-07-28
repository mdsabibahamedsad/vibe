"use client";

import { EmptyState } from "@/components/ui";

export default function FeedPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)] px-4 py-3">
        <h1 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">Feed</h1>
      </header>
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          title="Your Feed"
          description="Posts from people you follow will appear here."
        />
      </div>
    </div>
  );
}
