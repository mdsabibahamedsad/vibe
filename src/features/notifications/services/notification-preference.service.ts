/**
 * Notification Preference Service — manage per-user notification settings.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, authorizationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notifications/constants";
import type { NotificationPreferences, NotificationPreferencesInput } from "@/lib/notifications/schemas";

/**
 * Get notification preferences for the current user.
 * Creates default preferences if none exist.
 */
export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    logger.error("Failed to fetch notification preferences", {
      error: error.message,
    });
  }

  if (!data) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  return {
    inAppEnabled: data.in_app_enabled ?? true,
    matchNotifications: data.match_notifications ?? true,
    messageNotifications: data.message_notifications ?? true,
    followNotifications: data.follow_notifications ?? true,
    postNotifications: data.post_notifications ?? true,
    storyNotifications: data.story_notifications ?? true,
    systemNotifications: data.system_notifications ?? true,
    telegramEnabled: data.telegram_enabled ?? false,
    telegramActivated: data.telegram_activated ?? false,
    quietHoursEnabled: data.quiet_hours_enabled ?? false,
    quietHoursStart: data.quiet_hours_start ?? "22:00",
    quietHoursEnd: data.quiet_hours_end ?? "08:00",
    timezone: data.timezone ?? "UTC",
  };
}

/**
 * Update notification preferences for the current user.
 * Only provided fields are updated (partial update).
 */
export async function updateNotificationPreferences(
  userId: string,
  input: NotificationPreferencesInput,
): Promise<NotificationPreferences> {
  const adminClient = createAdminClient();

  // Build update object from input
  const updateData: Record<string, unknown> = {};

  if (input.inAppEnabled !== undefined) updateData.in_app_enabled = input.inAppEnabled;
  if (input.matchNotifications !== undefined) updateData.match_notifications = input.matchNotifications;
  if (input.messageNotifications !== undefined) updateData.message_notifications = input.messageNotifications;
  if (input.followNotifications !== undefined) updateData.follow_notifications = input.followNotifications;
  if (input.postNotifications !== undefined) updateData.post_notifications = input.postNotifications;
  if (input.storyNotifications !== undefined) updateData.story_notifications = input.storyNotifications;
  if (input.systemNotifications !== undefined) updateData.system_notifications = input.systemNotifications;
  if (input.telegramEnabled !== undefined) updateData.telegram_enabled = input.telegramEnabled;
  if (input.quietHoursEnabled !== undefined) updateData.quiet_hours_enabled = input.quietHoursEnabled;
  if (input.quietHoursStart !== undefined) updateData.quiet_hours_start = input.quietHoursStart;
  if (input.quietHoursEnd !== undefined) updateData.quiet_hours_end = input.quietHoursEnd;
  if (input.timezone !== undefined) updateData.timezone = input.timezone;

  updateData.updated_at = new Date().toISOString();

  // Upsert: create if not exists, update if exists
  const { error } = await adminClient
    .from("notification_preferences")
    .upsert(
      {
        user_id: userId,
        ...updateData,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    logger.error("Failed to update notification preferences", {
      error: error.message,
    });
    throw new AppError("INTERNAL_ERROR", "Failed to update preferences", {
      statusCode: 500,
    });
  }

  // Track preference change
  if (input.telegramEnabled !== undefined) {
    await trackEvent(
      userId,
      input.telegramEnabled ? "telegram_notification_enabled" : "telegram_notification_disabled",
      "preference",
    ).catch(() => {});
  }

  // Return updated preferences
  return getNotificationPreferences(userId);
}
