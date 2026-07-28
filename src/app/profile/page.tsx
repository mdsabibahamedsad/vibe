"use client";

import { Card, EmptyState } from "@/components/ui";

export default function ProfilePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)] px-4 py-3">
        <h1 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">Profile</h1>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Profile Card Placeholder */}
        <Card>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)]" />
            <div className="space-y-1">
              <div className="h-4 w-32 rounded bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)]" />
              <div className="h-3 w-24 rounded bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)]" />
            </div>
          </div>
        </Card>
        <EmptyState
          title="Edit Your Profile"
          description="Add photos, write a bio, and set your preferences."
        />
      </div>
    </div>
  );
}
