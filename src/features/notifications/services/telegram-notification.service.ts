/**
 * Telegram Notification Service — send notifications via Telegram Bot API.
 *
 * All Bot API calls are server-side only. The Bot token is never exposed
 * to the client. Notification delivery is asynchronous via delivery jobs.
 *
 * Architecture:
 *   Notification created
 *     → createTelegramDeliveryJob() [if user opted in]
 *     → processDeliveryJob() [async, via server-side processing]
 *         → sendTelegramMessage() [Bot API call]
 *         → update job status
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";
import { MAX_DELIVERY_RETRIES, DELIVERY_RETRY_BACKOFF_MS } from "@/lib/notifications/constants";
import { getNotificationTitle } from "@/lib/notifications/templates";
import { buildTelegramDeepLink } from "@/lib/utils/deep-link";

// ─── Create Delivery Job ────────────────────────────────────────────────

/**
 * Create a Telegram delivery job for a notification.
 * Checks user preferences first before creating the job.
 *
 * Called after an in-app notification is created.
 */
export async function createTelegramDeliveryJob(
  notificationId: string,
  recipientId: string,
  type: string,
  entityType?: string,
  entityId?: string,
): Promise<string | null> {
  const adminClient = createAdminClient();

  // Check if user has Telegram notifications enabled
  const { data: prefs } = await adminClient
    .from("notification_preferences")
    .select("telegram_enabled, telegram_activated, telegram_chat_id, quiet_hours_enabled, quiet_hours_start, quiet_hours_end")
    .eq("user_id", recipientId)
    .single();

  if (!prefs || !prefs.telegram_enabled || !prefs.telegram_activated) {
    return null; // User hasn't opted in
  }

  // Check category-specific Telegram preferences
  if (!isTelegramCategoryEnabled(type, prefs)) {
    return null;
  }

  // Check quiet hours
  if (prefs.quiet_hours_enabled) {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    if (isInQuietHours(currentTime, prefs.quiet_hours_start, prefs.quiet_hours_end)) {
      // Create the job but skip delivery — will be handled when quiet hours end
      // For V1, we simply skip during quiet hours
      return null;
    }
  }

  // Get the actor's display name
  const { data: notif } = await adminClient
    .from("notifications")
    .select("actor_id, title, body")
    .eq("id", notificationId)
    .single();

  if (!notif) return null;

  // Create delivery job
  const { data: job, error } = await adminClient
    .from("notification_delivery_jobs")
    .insert({
      notification_id: notificationId,
      recipient_id: recipientId,
      delivery_channel: "telegram",
      status: "pending",
      max_retries: MAX_DELIVERY_RETRIES,
      scheduled_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    logger.error("Failed to create delivery job", { error: error.message });
    return null;
  }

  return job?.id ?? null;
}

// ─── Process Delivery Job ──────────────────────────────────────────────

/**
 * Process a pending delivery job — sends the Telegram notification.
 * Called by a server-side scheduler or manually.
 */
export async function processDeliveryJob(jobId: string): Promise<boolean> {
  const adminClient = createAdminClient();

  // Load job
  const { data: job } = await adminClient
    .from("notification_delivery_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("status", "pending")
    .single();

  if (!job) return false;

  // Load notification
  const { data: notification } = await adminClient
    .from("notifications")
    .select("*")
    .eq("id", job.notification_id)
    .single();

  if (!notification) {
    await updateJobStatus(jobId, "skipped", "Notification not found");
    return false;
  }

  // Get user's Telegram chat ID
  const { data: prefs } = await adminClient
    .from("notification_preferences")
    .select("telegram_chat_id")
    .eq("user_id", job.recipient_id)
    .single();

  if (!prefs?.telegram_chat_id) {
    await updateJobStatus(jobId, "skipped", "No Telegram chat ID");
    return false;
  }

  // Build deep link for the notification
  let deepLink: string | undefined;
  if (notification.entity_type && notification.entity_id) {
    // Map entity type to DeepLinkEntity
    const entityTypeMap: Record<string, string> = {
      match: "match",
      post: "post",
      story: "story",
      message: "chat",
      conversation: "chat",
      profile: "profile",
    };

    const linkType = entityTypeMap[notification.entity_type];
    if (linkType) {
      deepLink = buildTelegramDeepLink(
        linkType as any,
        notification.entity_id,
      );
    }
  }

  // Send via Bot API
  const success = await sendTelegramMessage(
    prefs.telegram_chat_id,
    notification.title ?? "New notification",
    notification.body ?? undefined,
    deepLink,
  );

  if (success) {
    await updateJobStatus(jobId, "sent");
    await trackEvent(job.recipient_id, "telegram_notification_sent", "notification", notification.id).catch(() => {});
    return true;
  } else {
    // Handle failure
    const retryCount = (job.retry_count ?? 0) + 1;

    if (retryCount >= job.max_retries) {
      await adminClient
        .from("notification_delivery_jobs")
        .update({
          status: "failed",
          retry_count: retryCount,
          last_error: "Max retries exceeded",
          failed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      await trackEvent(job.recipient_id, "telegram_notification_failed", "notification", notification.id).catch(() => {});
    } else {
      // Schedule retry with backoff
      const backoffMs = DELIVERY_RETRY_BACKOFF_MS[retryCount - 1] ?? 30000;
      const scheduledAt = new Date(Date.now() + backoffMs).toISOString();

      await adminClient
        .from("notification_delivery_jobs")
        .update({
          retry_count: retryCount,
          last_error: "Delivery failed, retrying",
          scheduled_at: scheduledAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }

    return false;
  }
}

// ─── Send Telegram Message ─────────────────────────────────────────────

/**
 * Send a notification message via Telegram Bot API.
 *
 * The Bot token is read from server-side environment variables only.
 */
async function sendTelegramMessage(
  chatId: string,
  title: string,
  body?: string,
  deepLink?: string,
): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    logger.error("TELEGRAM_BOT_TOKEN is not configured");
    return false;
  }

  const text = body ? `${title}\n\n${body}` : title;

  try {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_notification: false,
    };

    // Add inline keyboard with deep link button
    if (deepLink) {
      payload.reply_markup = {
        inline_keyboard: [
          [
            {
              text: "Open Vibe",
              url: deepLink,
            },
          ],
        ],
      };
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorCode = errorData?.error_code;
      const errorDescription = errorData?.description ?? "Unknown error";

      // Handle specific error cases
      if (errorCode === 403) {
        // Bot blocked or user not started — mark preferences accordingly
        logger.warn("Telegram bot blocked by user", { chatId });
        await deactivateTelegramForUser(chatId);
      } else if (errorCode === 429) {
        // Rate limited — log and retry
        logger.warn("Telegram API rate limit hit", { chatId });
      }

      logger.error("Telegram API error", {
        errorCode,
        errorDescription,
      });
      return false;
    }

    return true;
  } catch (err) {
    logger.error("Failed to send Telegram notification", {
      error: err instanceof Error ? err.message : "Unknown",
    });
    return false;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Update a delivery job's status and timestamps.
 */
async function updateJobStatus(
  jobId: string,
  status: string,
  lastError?: string,
): Promise<void> {
  const adminClient = createAdminClient();

  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "sent") {
    updateData.sent_at = new Date().toISOString();
  }

  if (status === "failed") {
    updateData.failed_at = new Date().toISOString();
  }

  if (lastError) {
    updateData.last_error = lastError;
  }

  await adminClient
    .from("notification_delivery_jobs")
    .update(updateData)
    .eq("id", jobId);
}

/**
 * Deactivate Telegram notifications for a user when the bot is blocked.
 */
async function deactivateTelegramForUser(chatId: string): Promise<void> {
  const adminClient = createAdminClient();

  await adminClient
    .from("notification_preferences")
    .update({
      telegram_enabled: false,
      telegram_activated: false,
      updated_at: new Date().toISOString(),
    })
    .eq("telegram_chat_id", chatId);
}

/**
 * Check if a notification type is enabled for Telegram delivery.
 */
function isTelegramCategoryEnabled(type: string, prefs: any): boolean {
  const typeToPref: Record<string, string> = {
    new_message: "message_notifications",
    new_match: "match_notifications",
    post_like: "post_notifications",
    post_comment: "post_notifications",
    new_follower: "follow_notifications",
    story_view: "story_notifications",
    story_reaction: "story_notifications",
    system: "system_notifications",
  };

  const prefKey = typeToPref[type];
  if (!prefKey) return true; // Unknown types default to enabled
  return prefs[prefKey] ?? true;
}

/**
 * Check if the current time falls within quiet hours.
 */
function isInQuietHours(
  currentTime: string,
  startTime: string | null,
  endTime: string | null,
): boolean {
  if (!startTime || !endTime) return false;

  return currentTime >= startTime || currentTime < endTime;
}

/**
 * Process all pending delivery jobs.
 * Called by a scheduled job or manually.
 */
export async function processPendingDeliveries(maxJobs: number = 50): Promise<number> {
  const adminClient = createAdminClient();

  const { data: jobs } = await adminClient
    .from("notification_delivery_jobs")
    .select("id")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(maxJobs);

  if (!jobs || jobs.length === 0) return 0;

  let processed = 0;
  for (const job of jobs) {
    await processDeliveryJob(job.id);
    processed++;
  }

  return processed;
}
