"use client";

import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { NotificationCenter } from "@/features/notifications/components/NotificationCenter";
import { Loading, EmptyState } from "@/components/ui";
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

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--tg-theme-bg-color,#ffffff)]">
        <Loading />
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <div className="flex min-h-dvh flex-col bg-[var(--tg-theme-bg-color,#ffffff)]">
        <Header title={t("title")} />
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--tg-theme-bg-color,#ffffff)]">
      <Header title={t("title")} />
      <div className="flex-1 max-w-lg mx-auto w-full">
        <NotificationCenter onNotificationPress={handleNotificationPress} />
      </div>
    </div>
  );
}

function Header({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)]/80 backdrop-blur-md">
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">{title}</h1>
      </div>
    </header>
  );
}
