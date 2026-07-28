"use client";

import { Card } from "@/components/ui";

export default function SettingsPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)] px-4 py-3">
        <h1 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
          Settings
        </h1>
      </header>
      <div className="flex flex-col gap-4 p-4">
        <Card padding={false}>
          <div className="divide-y divide-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-[var(--tg-theme-text-color,#000000)]">
                Notifications
              </span>
              <span className="text-sm text-[var(--tg-theme-hint-color,#999999)]">Soon</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-[var(--tg-theme-text-color,#000000)]">Privacy</span>
              <span className="text-sm text-[var(--tg-theme-hint-color,#999999)]">Soon</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-[var(--tg-theme-text-color,#000000)]">Appearance</span>
              <span className="text-sm text-[var(--tg-theme-hint-color,#999999)]">Soon</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-[var(--tg-theme-text-color,#000000)]">Language</span>
              <span className="text-sm text-[var(--tg-theme-hint-color,#999999)]">English</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
