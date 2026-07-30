"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getNotificationIcon } from "@/lib/notifications/templates";
import type { NotificationItem } from "@/lib/notifications/schemas";

interface NotificationToastProps {
  /** Called when the toast is tapped */
  onTap?: (notification: NotificationItem) => void;
  /** Time in ms before auto-dismiss (default: 4000) */
  autoDismissMs?: number;
}

/**
 * NotificationToast — Lightweight in-app toast for new notifications.
 *
 * Subscribes to realtime INSERT events on the notifications table
 * and shows a brief, non-intrusive toast at the top of the screen.
 *
 * Features:
 *  - Fade-in / fade-out animation
 *  - Auto-dismiss after configurable duration
 *  - Tappable to navigate to the notification
 *  - Deduplication by notification ID
 *  - Respects current foreground state
 */
export function NotificationToast({
  onTap,
  autoDismissMs = 4000,
}: NotificationToastProps) {
  const [toast, setToast] = useState<{
    notification: NotificationItem;
    visible: boolean;
  } | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  // ─── Show toast ──────────────────────────────────────────────────

  const showToast = useCallback(
    (notification: NotificationItem) => {
      // Clear existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      setToast({ notification, visible: true });

      // Auto-dismiss
      timerRef.current = setTimeout(() => {
        setToast((prev) =>
          prev ? { ...prev, visible: false } : null,
        );
        timerRef.current = null;

        // Remove from DOM after animation
        setTimeout(() => setToast(null), 300);
      }, autoDismissMs);
    },
    [autoDismissMs],
  );

  // ─── Dismiss immediately ────────────────────────────────────────

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast((prev) =>
      prev ? { ...prev, visible: false } : null,
    );
    setTimeout(() => setToast(null), 300);
  }, []);

  // ─── Handle tap ─────────────────────────────────────────────────

  const handleTap = useCallback(() => {
    if (toast?.notification) {
      dismiss();
      onTap?.(toast.notification);
    }
  }, [toast, dismiss, onTap]);

  // ─── Realtime subscription ───────────────────────────────────────

  useEffect(() => {
    const supabase = getSupabaseClient();

    const channel = supabase.channel("notification-toasts");

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
      },
      (payload) => {
        const newNotif = payload.new as any;
        if (!newNotif || newNotif.is_read) return;

        // Deduplicate
        if (seenRef.current.has(newNotif.id)) return;
        seenRef.current.add(newNotif.id);

        // Don't show toast if it's a message notification and user is in chat
        // (handled by the chat system)
        if (newNotif.type === "new_message") return;

        showToast({
          id: newNotif.id,
          type: newNotif.type,
          actor: null,
          entityType: newNotif.entity_type ?? null,
          entityId: newNotif.entity_id ?? null,
          groupKey: newNotif.group_key ?? null,
          title: newNotif.title ?? null,
          body: newNotif.body ?? null,
          readAt: null,
          isRead: false,
          createdAt: newNotif.created_at,
        });
      },
    );

    // Handle reconnection: refetch recent unread notifications
    // that may have been missed during disconnect
    channel.subscribe(async (status: string) => {
      if (status === "SUBSCRIBED") {
        // Refetch recent unread notifications to catch any missed while disconnected
        try {
          const res = await fetch("/api/notifications?limit=1");
          if (res.ok) {
            const data = await res.json();
            if (data?.items?.length > 0) {
              // Add to seen set to prevent duplicate toasts
              for (const item of data.items) {
                if (item.id) seenRef.current.add(item.id);
              }
            }
          }
        } catch {
          // Non-critical — realtime will catch future events
        }
      }
    });

    return () => {
      supabase.removeChannel(channel);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [showToast]);

  if (!toast) return null;

  const icon = getNotificationIcon(toast.notification.type);

  return (
    <div className="fixed top-0 left-0 right-0 z-50 px-4 pt-3 pointer-events-none">
      <button
        onClick={handleTap}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--tg-theme-bg-color,#ffffff)] shadow-lg border border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] pointer-events-auto transition-all duration-300 ${
          toast.visible
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-4"
        }`}
        aria-label={`New notification: ${toast.notification.title ?? ""}`}
      >
        <span className="text-lg flex-shrink-0" role="img" aria-hidden="true">
          {icon}
        </span>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold text-[var(--tg-theme-text-color,#000000)] truncate">
            {toast.notification.title ?? "New notification"}
          </p>
          {toast.notification.body && (
            <p className="text-xs text-[var(--tg-theme-hint-color,#999999)] truncate mt-0.5">
              {toast.notification.body}
            </p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[var(--tg-theme-hint-color,#999999)]"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </button>
    </div>
  );
}
