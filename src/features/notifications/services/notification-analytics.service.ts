/**
 * Notification Analytics Service — Tracks notification lifecycle events.
 *
 * Events tracked:
 *   notification_created    — When a notification is created (in domain-events.ts)
 *   notification_delivered  — When notification reaches the client
 *   notification_opened     — When user taps/opens a notification
 *   notification_read       — When a notification is marked read
 *   notification_actioned   — When user takes action from notification
 */

import { trackEvent } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import { recordFeedback } from "@/lib/recommendation/feedback.service";

// ─── Delivered ──────────────────────────────────────────────────────────

/**
 * Track that a notification was delivered to the client.
 * Called from the realtime subscription handshake.
 */
export async function trackNotificationDelivered(
  userId: string,
  notificationId: string,
): Promise<void> {
  await trackEvent(userId, "notification_delivered", "notification", notificationId).catch(() => {});
}

// ─── Opened ─────────────────────────────────────────────────────────────

/**
 * Track that a user opened/tapped a notification.
 * Also connects to the recommendation feedback loop if the
 * notification has a recommendation context.
 */
export async function trackNotificationOpened(
  userId: string,
  notification: {
    id: string;
    type: string;
    entityType?: string | null;
    entityId?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    await trackEvent(userId, "notification_opened", "notification", notification.id, {
      type: notification.type,
      entityType: notification.entityType ?? null,
      entityId: notification.entityId ?? null,
    });

    // ─── Recommendation Feedback Integration ──────────────────────────
    // If the notification was triggered by a recommendation impression,
    // record positive feedback (opening = positive signal)
    const requestId = notification.metadata?.recommendationRequestId as string | undefined;
    if (requestId) {
      await recordFeedback({
        viewerId: userId,
        candidateId: notification.entityId ?? "",
        action: "view",
        requestId,
        mode: notification.metadata?.recommendationMode as string | undefined,
      });
    }
  } catch (err) {
    logger.warn("Failed to track notification opened", {
      error: err instanceof Error ? err.message : "Unknown",
    });
  }
}

// ─── Read ───────────────────────────────────────────────────────────────

/**
 * Track that a user marked a notification as read.
 */
export async function trackNotificationRead(
  userId: string,
  notificationId: string,
  bulk: boolean = false,
): Promise<void> {
  await trackEvent(
    userId,
    bulk ? "notifications_marked_all_read" : "notification_marked_read",
    "notification",
    notificationId,
  ).catch(() => {});
}

// ─── Actioned ───────────────────────────────────────────────────────────

/**
 * Track that a user took a follow-up action from a notification
 * (e.g., liked back, followed back, replied to message).
 */
export async function trackNotificationActioned(
  userId: string,
  notificationId: string,
  actionType: string,
): Promise<void> {
  await trackEvent(userId, "notification_actioned", "notification", notificationId, {
    actionType,
  }).catch(() => {});
}

// ─── Notification Center Opened ─────────────────────────────────────────

/**
 * Track that a user opened the notification center.
 */
export async function trackNotificationCenterOpened(userId: string): Promise<void> {
  await trackEvent(userId, "notification_center_opened", "ui").catch(() => {});
}
