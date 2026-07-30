/**
 * Notification Channel Abstraction.
 *
 * Decouples notification creation from delivery mechanism.
 * The core notification is created first, then delivered via
 * one or more channels independently.
 *
 * Available channels:
 *   - InAppNotificationChannel  → Inserts into notifications table
 *   - RealtimeNotificationChannel  → Broadcasts via Supabase Realtime
 *   - TelegramNotificationChannel  → Sends via Telegram Bot API (async)
 *
 * Each channel can fail independently without affecting others.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { createTelegramDeliveryJob } from "@/features/notifications/services/telegram-notification.service";

// ─── Notification Data ──────────────────────────────────────────────────

export interface NotificationData {
  id: string;
  recipientId: string;
  type: string;
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  groupKey: string | null;
  title: string | null;
  body: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ─── Channel Interface ──────────────────────────────────────────────────

export interface NotificationChannel {
  /** Channel name identifier (e.g., "in_app", "realtime", "telegram") */
  readonly name: string;

  /**
   * Deliver a notification through this channel.
   * Must not throw — failures are logged and isolated.
   * Returns true on success, false on failure.
   */
  deliver(notification: NotificationData): Promise<boolean>;

  /**
   * Whether this channel is available (configured, enabled, etc.)
   */
  isAvailable(): boolean;
}

// ─── In-App Channel ─────────────────────────────────────────────────────

/**
 * In-app channel: notification is already in the database.
 * This channel is a no-op since processDomainEvent already inserts.
 * It exists for consistency with the channel abstraction.
 */
export class InAppNotificationChannel implements NotificationChannel {
  readonly name = "in_app";

  async deliver(_notification: NotificationData): Promise<boolean> {
    // The notification was already created in the database by processDomainEvent.
    // This channel exists for pipeline consistency.
    return true;
  }

  isAvailable(): boolean {
    return true;
  }
}

// ─── Realtime Channel ───────────────────────────────────────────────────

/**
 * Realtime channel: relies on Supabase Realtime to broadcast
 * the new notification row to the recipient. No additional action
 * needed because the database INSERT triggers Realtime.
 */
export class RealtimeNotificationChannel implements NotificationChannel {
  readonly name = "realtime";

  async deliver(_notification: NotificationData): Promise<boolean> {
    // Supabase Realtime automatically broadcasts INSERT events on the
    // notifications table. No explicit broadcast call needed.
    return true;
  }

  isAvailable(): boolean {
    return true;
  }
}

// ─── Telegram Channel ───────────────────────────────────────────────────

/**
 * Telegram channel: creates an async delivery job for Telegram Bot API delivery.
 */
export class TelegramNotificationChannel implements NotificationChannel {
  readonly name = "telegram";

  async deliver(notification: NotificationData): Promise<boolean> {
    try {
      const jobId = await createTelegramDeliveryJob(
        notification.id,
        notification.recipientId,
        notification.type,
        notification.entityType ?? undefined,
        notification.entityId ?? undefined,
      );

      return jobId !== null;
    } catch (err) {
      logger.warn("Failed to create Telegram delivery job", {
        error: err instanceof Error ? err.message : "Unknown",
        notificationId: notification.id,
      });
      return false;
    }
  }

  isAvailable(): boolean {
    // Telegram is always available as a delivery option;
    // the actual sending depends on user preferences (checked in createTelegramDeliveryJob)
    return true;
  }
}

// ─── Notification Pipeline ──────────────────────────────────────────────

/**
 * Deliver a notification through all available channels.
 *
 * Each channel is independent:
 *   - in_app → always succeeds (notification already created)
 *   - realtime → uses Supabase Realtime (automatic from INSERT)
 *   - telegram → async delivery job (depends on user preferences)
 */
export async function deliverThroughChannels(
  notification: NotificationData,
  channels: NotificationChannel[] = defaultChannels,
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};

  for (const channel of channels) {
    if (!channel.isAvailable()) {
      results[channel.name] = false;
      continue;
    }

    try {
      results[channel.name] = await channel.deliver(notification);
    } catch (err) {
      logger.error(`Channel ${channel.name} delivery failed`, {
        error: err instanceof Error ? err.message : "Unknown",
      });
      results[channel.name] = false;
    }
  }

  return results;
}

// ─── Default Channels ───────────────────────────────────────────────────

export const defaultChannels: NotificationChannel[] = [
  new InAppNotificationChannel(),
  new RealtimeNotificationChannel(),
  new TelegramNotificationChannel(),
];
