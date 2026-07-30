"use client";

import { Card, EmptyState } from "@/components/ui";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import Link from "next/link";

export default function ProfilePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader title="Profile" />
      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Profile Card Placeholder */}
        <Card>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-brand-gradient opacity-40 animate-float" />
            <div className="space-y-2">
              <div className="h-4 w-32 rounded-full bg-surface-2" />
              <div className="h-3 w-24 rounded-full bg-surface-2" />
            </div>
          </div>
        </Card>
        <EmptyState
          title="Edit Your Profile"
          description="Add photos, write a bio, and set your preferences."
          action={
            <Link
              href="/settings"
              className="mt-3 inline-flex items-center justify-center rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform active:scale-95"
            >
              Edit profile
            </Link>
          }
        />
      </div>
      <BottomNav />
    </div>
  );
}
