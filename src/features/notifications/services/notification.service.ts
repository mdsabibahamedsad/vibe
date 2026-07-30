/**
 * Notification Service — core operations for the notification center.
 *
 * Handles:
 *  - Creating in-app notifications
 *  - Listing notifications with cursor pagination
 *  - Marking individual/all notifications as read
 *  - Getting unread counts by category
 *  - Cleaning up old notifications
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, authorizationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";
import { NOTIFICATION_PAGE_SIZE, NOTIFICATION_TYPES } from "@/lib/notifications/constants";
import { getNotificationTitle, getNotificationBody } from "@/lib/notifications/templates";
import type {
  NotificationItem,
  NotificationListResponse,
  UnreadCountResponse,
} from "@/lib/notifications/schemas";

// ─── Create Notification ────────────────────────────────────────────────

export interface CreateNotificationParams {
  type: string;
  recipientId: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  groupKey?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create an in-app notification.
 *
 * Server-side validates:
 *  - Recipient exists
 *  - Notification type is valid
 *  - Block filtering (if actor blocked by recipient, suppress)
 *  - Notification preferences respected (in-app)
 *
 * Returns the created notification ID.
 */
export async function createNotification(
  params: CreateNotificationParams,
): Promise<string | null> {
  const adminClient = createAdminClient();

  // ─── Block filtering ───────────────────────────────────────────────
  if (params.actorId) {
    const { count: blockCount } = await adminClient
      .from("blocks")
      .select("*", { count: "exact", head: true })
      .eq("blocker_id", params.recipientId)
      .eq("blocked_id", params.actorId);

    if ((blockCount ?? 0) > 0) {
      return null; // Suppressed — actor is blocked by recipient
    }
  }

  // ─── In-app preference check ────────────────────────────────────────
  // Check if the recipient has enabled the specific notification category
  const { data: prefs } = await adminClient
    .from("notification_preferences")
    .select("*")
    .eq("user_id", params.recipientId)
    .single();

  if (prefs && !prefs.in_app_enabled) {
    return null; // All in-app notifications disabled
  }

  // Check category-specific preference
  if (prefs) {
    const typeCategory = getCategoryForType(params.type);
    if (typeCategory && !isCategoryEnabled(prefs, typeCategory)) {
      return null;
    }
  }

  // ─── Generate title and body ────────────────────────────────────────
  let actorName: string | null = null;
  if (params.actorId) {
    const { data: actor } = await adminClient
      .from("users")
      .select("display_name")
      .eq("id", params.actorId)
      .single();
    actorName = actor?.display_name ?? null;
  }

  const title = getNotificationTitle(params.type, actorName);
  const body = getNotificationBody(params.type, actorName, params.metadata);

  // ─── Insert notification ───────────────────────────────────────────
  const { data: notification, error } = await adminClient
    .from("notifications")
    .insert({
      recipient_id: params.recipientId,
      type: params.type,
      actor_id: params.actorId ?? null,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      title,
      body,
      metadata: params.metadata ?? {},
      channel: "in_app",
      is_read: false,
    })
    .select("id")
    .single();

  if (error) {
    // Idempotency: dedup constraint already exists from migration 022
    if (error.code === "23505") {
      return null; // Duplicate — silently ignore
    }
    logger.error("Failed to create notification", { error: error.message });
    return null;
  }

  return notification?.id ?? null;
}

// ─── Get Notifications (Cursor Pagination) ─────────────────────────────

/**
 * Get notifications for the current user with cursor pagination.
 *
 * Supports optional category filtering.
 */
export async function getNotifications(
  userId: string,
  cursor?: string,
  limit: number = NOTIFICATION_PAGE_SIZE,
  category?: string,
): Promise<NotificationListResponse> {
  const adminClient = createAdminClient();

  let query = adminClient
    .from("notifications")
    .select("*")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  // Cursor: "createdAt_notificationId"
  if (cursor) {
    const parts = cursor.split("_");
    const cursorCreatedAt = parts[0];
    const cursorId = parts.slice(1).join("_");

    query = query.lt("created_at", cursorCreatedAt).or(
      `and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`,
    );
  }

  // Category filter
  if (category && category !== "all") {
    const typeFilter = getTypesForCategory(category);
    if (typeFilter.length > 0) {
      query = query.in("type", typeFilter);
    }
  }

  const { data: notifications, error } = await query;

  if (error) {
    logger.error("Failed to fetch notifications", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to load notifications", {
      statusCode: 500,
    });
  }

  const hasMore = (notifications?.length ?? 0) > limit;
  const pageItems = (notifications ?? []).slice(0, limit);

  // Enrich with actor info
  const enriched = await enrichNotifications(pageItems);

  // Build cursor
  const lastItem = pageItems[pageItems.length - 1];
  const nextCursor = hasMore && lastItem
    ? `${lastItem.created_at}_${lastItem.id}`
    : null;

  return {
    items: enriched,
    nextCursor,
    hasMore,
  };
}

// ─── Mark Notification as Read ─────────────────────────────────────────

/**
 * Mark a single notification as read.
 * Only the recipient can mark their own notification as read.
 */
export async function markNotificationRead(
  notificationId: string,
  userId: string,
): Promise<void> {
  const adminClient = createAdminClient();

  const { data: notification } = await adminClient
    .from("notifications")
    .select("id, recipient_id")
    .eq("id", notificationId)
    .single();

  if (!notification) {
    throw new AppError("NOT_FOUND", "Notification not found", {
      statusCode: 404,
    });
  }

  if (notification.recipient_id !== userId) {
    throw authorizationError("You can only mark your own notifications as read");
  }

  const { error } = await adminClient
    .from("notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq("id", notificationId);

  if (error) {
    logger.error("Failed to mark notification as read", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to mark as read", {
      statusCode: 500,
    });
  }
}

// ─── Mark All Notifications as Read ────────────────────────────────────

/**
 * Mark all unread notifications as read for the current user.
 */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const adminClient = createAdminClient();

  const now = new Date().toISOString();

  const { error, count } = await adminClient
    .from("notifications")
    .update({ is_read: true, read_at: now })
    .eq("recipient_id", userId)
    .eq("is_read", false);

  if (error) {
    logger.error("Failed to mark all notifications as read", {
      error: error.message,
    });
    throw new AppError("INTERNAL_ERROR", "Failed to mark all as read", {
      statusCode: 500,
    });
  }

  await trackEvent(userId, "notifications_marked_all_read", "notification").catch(() => {});

  return count ?? 0;
}

// ─── Get Unread Count ─────────────────────────────────────────────────

/**
 * Get unread notification counts (total + by category).
 * Uses the database function for efficiency.
 */
export async function getUnreadCount(userId: string): Promise<UnreadCountResponse> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient.rpc("get_unread_notification_count", {
    p_recipient_id: userId,
  });

  if (error || !data) {
    // Fallback: manual count
    const { count: total } = await adminClient
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .eq("is_read", false);

    return {
      total: total ?? 0,
      messages: 0,
      dating: 0,
      social: 0,
      system: 0,
    };
  }

  const result = data as Record<string, number>;

  return {
    total: result.total ?? 0,
    messages: result.messages ?? 0,
    dating: result.dating ?? 0,
    social: result.social ?? 0,
    system: 0,
  };
}

// ─── Cleanup ───────────────────────────────────────────────────────────

/**
 * Clean up old (read) notifications.
 * Returns the number of deleted notifications.
 */
export async function cleanupNotifications(
  retentionDays: number = 90,
): Promise<number> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient.rpc("cleanup_old_notifications", {
    p_retention_days: retentionDays,
  });

  if (error) {
    logger.error("Failed to cleanup notifications", { error: error.message });
    return 0;
  }

  return (data ?? 0) as number;
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Enrich notification rows with actor profile information.
 */
async function enrichNotifications(
  notifications: any[],
): Promise<NotificationItem[]> {
  if (notifications.length === 0) return [];

  const adminClient = createAdminClient();

  // Collect actor IDs
  const actorIds = notifications
    .map((n) => n.actor_id)
    .filter(Boolean);

  // Batch fetch actor info
  const actorMap = new Map<string, { id: string; displayName: string; avatarUrl: string | null }>();

  if (actorIds.length > 0) {
    const { data: actors } = await adminClient
      .from("users")
      .select("id, display_name, avatar_media_id")
      .in("id", actorIds);

    for (const actor of actors ?? []) {
      actorMap.set(actor.id, {
        id: actor.id,
        displayName: actor.display_name ?? "Unknown",
        avatarUrl: actor.avatar_media_id ?? null,
      });
    }
  }

  return notifications.map((n) => ({
    id: n.id,
    type: n.type,
    actor: n.actor_id ? (actorMap.get(n.actor_id) ?? null) : null,
    entityType: n.entity_type ?? null,
    entityId: n.entity_id ?? null,
    groupKey: n.group_key ?? null,
    title: n.title ?? null,
    body: n.body ?? null,
    readAt: n.read_at ?? null,
    isRead: n.is_read ?? false,
    createdAt: n.created_at,
  }));
}

/**
 * Get the UI category for a notification type.
 */
function getCategoryForType(type: string): string | null {
  const typeToCategory: Record<string, string> = {
    [NOTIFICATION_TYPES.NEW_MESSAGE]: "messages",
    [NOTIFICATION_TYPES.NEW_MATCH]: "dating",
    [NOTIFICATION_TYPES.POST_LIKE]: "social",
    [NOTIFICATION_TYPES.POST_COMMENT]: "social",
    [NOTIFICATION_TYPES.NEW_FOLLOWER]: "social",
    [NOTIFICATION_TYPES.STORY_VIEW]: "social",
    [NOTIFICATION_TYPES.STORY_REACTION]: "social",
    [NOTIFICATION_TYPES.STORY_MENTION]: "social",
    [NOTIFICATION_TYPES.PROFILE_VISIT]: "social",
    [NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED]: "system",
    [NOTIFICATION_TYPES.SUBSCRIPTION_RENEWED]: "system",
    [NOTIFICATION_TYPES.REPORT_UPDATE]: "system",
    [NOTIFICATION_TYPES.SYSTEM]: "system",
  };

  return typeToCategory[type] ?? null;
}

/**
 * Check if a category is enabled in the user's preferences.
 */
function isCategoryEnabled(
  prefs: any,
  category: string,
): boolean {
  switch (category) {
    case "messages":
      return prefs.message_notifications ?? true;
    case "dating":
      return prefs.match_notifications ?? true;
    case "social":
      return prefs.follow_notifications ?? true;
    case "system":
      return prefs.system_notifications ?? true;
    default:
      return true;
  }
}

/**
 * Get the notification types for a given category filter.
 */
function getTypesForCategory(category: string): string[] {
  const categoryTypes: Record<string, string[]> = {
    messages: [NOTIFICATION_TYPES.NEW_MESSAGE],
    dating: [NOTIFICATION_TYPES.NEW_MATCH],
    social: [
      NOTIFICATION_TYPES.POST_LIKE,
      NOTIFICATION_TYPES.POST_COMMENT,
      NOTIFICATION_TYPES.NEW_FOLLOWER,
      NOTIFICATION_TYPES.STORY_VIEW,
      NOTIFICATION_TYPES.STORY_REACTION,
      NOTIFICATION_TYPES.STORY_MENTION,
      NOTIFICATION_TYPES.PROFILE_VISIT,
    ],
    system: [
      NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED,
      NOTIFICATION_TYPES.SUBSCRIPTION_RENEWED,
      NOTIFICATION_TYPES.REPORT_UPDATE,
      NOTIFICATION_TYPES.SYSTEM,
    ],
  };

  return categoryTypes[category] ?? [];
}
