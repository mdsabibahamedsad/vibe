"use client";

import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { NotificationCenter } from "@/features/notifications/components/NotificationCenter";
import { EmptyState, NotificationSkeleton } from "@/components/ui";
import { AppHeader } from "@/components/app-header";
import { BottomNav, DesktopNav } from "@/components/bottom-nav";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { NotificationItem } from "@/lib/notifications/schemas";

export default function NotificationsPage() {
  const router = useRouter();
  const { user, authenticated, loading: authLoading } = useCurrentUser();
  const { t } = useTranslation("notifications");

  const handleNotificationPress = (notification: NotificationItem) => {
    if (notification.entityType && notification.entityId) {
      switch (notification.entityType) {
        case "match":
          router.push(`/chat/${notification.entityId}`);
          break;
        case "post":
          router.push(`/feed?postId=${notification.entityId}`);
          break;
        case "message":
        case "conversation":
          router.push(`/chat/${notification.entityId}`);
          break;
        case "story":
          router.push(`/stories?storyId=${notification.entityId}`);
          break;
        case "profile":
          router.push(`/profile/${notification.entityId}`);
          break;
        default:
          break;
      }
    }
  };

  return (
    <div className="flex min-h-dvh flex-col pb-safe">
      <AppHeader title={t("title")} />

      <main className="mx-auto w-full max-w-2xl flex-1">
        {authLoading ? (
          <NotificationSkeleton />
        ) : !authenticated || !user ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
          </div>
        ) : (
          <NotificationCenter onNotificationPress={handleNotificationPress} />
        )}
      </main>

      <BottomNav />
      <DesktopNav />
    </div>
  );
}
