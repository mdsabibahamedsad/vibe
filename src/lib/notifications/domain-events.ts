/**
 * Notification Domain Events — Centralized event-driven notification creation.
 *
 * Architecture:
 *   Domain Action (like, comment, follow, match, message)
 *     → DomainEvent emitted
 *     → NotificationEventHandler processes event
 *     → NotificationChannel delivers (in_app, realtime, telegram)
 *
 * Benefits:
 *   - Decouples domain logic from notification logic
 *   - Single place for privacy/block/preference checks
 *   - Easy to add new notification types
 *   - Testable event handlers
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";
import { NOTIFICATION_TYPES, NOTIFICATION_RETENTION_DAYS } from "@/lib/notifications/constants";
import { getNotificationTitle, getNotificationBody } from "@/lib/notifications/templates";

// ─── Event Types ────────────────────────────────────────────────────────

export type DomainEventType =
  | "like.created"
  | "comment.created"
  | "reply.created"
  | "mention.created"
  | "follow.created"
  | "follow.requested"
  | "follow.accepted"
  | "match.created"
  | "message.created"
  | "story.reaction"
  | "story.reply"
  | "profile.interaction"
  | "safety.content_removed"
  | "safety.account_restriction"
  | "safety.security_event"
  | "system";

export interface DomainEvent {
  /** Unique event ID for deduplication */
  id: string;
  /** The type of domain event */
  type: DomainEventType;
  /** When the event occurred */
  timestamp: string;
  /** The user who triggered the event (actor) */
  actorId: string | null;
  /** The user who should be notified (recipient) */
  recipientId: string;
  /** The type of entity involved (post, comment, match, etc.) */
  entityType: string;
  /** The entity ID */
  entityId: string;
  /** Optional grouping key for aggregation */
  groupKey?: string;
  /** Additional metadata (safe, non-sensitive data only) */
  metadata?: Record<string, unknown>;
}

// ─── Priority Levels ────────────────────────────────────────────────────

export type NotificationPriority = "low" | "normal" | "high" | "critical";

/** Maps domain event types to notification priorities */
export const EVENT_PRIORITY: Record<DomainEventType, NotificationPriority> = {
  "like.created": "low",
  "comment.created": "normal",
  "reply.created": "normal",
  "mention.created": "normal",
  "follow.created": "low",
  "follow.requested": "normal",
  "follow.accepted": "low",
  "match.created": "high",
  "message.created": "high",
  "story.reaction": "low",
  "story.reply": "normal",
  "profile.interaction": "low",
  "safety.content_removed": "high",
  "safety.account_restriction": "critical",
  "safety.security_event": "critical",
  "system": "normal",
};

/** Maps domain events to notification types */
export const EVENT_TO_NOTIFICATION_TYPE: Record<DomainEventType, string> = {
  "like.created": NOTIFICATION_TYPES.POST_LIKE,
  "comment.created": NOTIFICATION_TYPES.POST_COMMENT,
  "reply.created": NOTIFICATION_TYPES.POST_COMMENT,
  "mention.created": NOTIFICATION_TYPES.STORY_MENTION,
  "follow.created": NOTIFICATION_TYPES.NEW_FOLLOWER,
  "follow.requested": NOTIFICATION_TYPES.NEW_FOLLOWER,
  "follow.accepted": NOTIFICATION_TYPES.NEW_FOLLOWER,
  "match.created": NOTIFICATION_TYPES.NEW_MATCH,
  "message.created": NOTIFICATION_TYPES.NEW_MESSAGE,
  "story.reaction": NOTIFICATION_TYPES.STORY_REACTION,
  "story.reply": NOTIFICATION_TYPES.STORY_REACTION,
  "profile.interaction": NOTIFICATION_TYPES.PROFILE_VISIT,
  "safety.content_removed": NOTIFICATION_TYPES.SYSTEM,
  "safety.account_restriction": NOTIFICATION_TYPES.SYSTEM,
  "safety.security_event": NOTIFICATION_TYPES.SYSTEM,
  "system": NOTIFICATION_TYPES.SYSTEM,
};

// ─── Notification Event Service ─────────────────────────────────────────

/**
 * Process a domain event and create the corresponding notification.
 *
 * This is the central handler all domain actions should call instead
 * of inserting notification rows directly.
 *
 * Steps:
 *   1. Validate event
 *   2. Check privacy/block rules
 *   3. Check notification preferences
 *   4. Deduplicate
 *   5. Create in-app notification
 *   6. Record analytics
 *   7. Return result
 */
export async function processDomainEvent(event: DomainEvent): Promise<{
  notificationId: string | null;
  created: boolean;
  skipped: boolean;
  skipReason?: string;
}> {
  const adminClient = createAdminClient();

  try {
    // ─── Step 1: Self-action filter ────────────────────────────────
    if (event.actorId === event.recipientId) {
      return { notificationId: null, created: false, skipped: true, skipReason: "self_action" };
    }

    // ─── Step 2: Validate recipient exists and is active ────────────
    const { data: recipient } = await adminClient
      .from("users")
      .select("id, is_active, is_banned")
      .eq("id", event.recipientId)
      .single();

    if (!recipient || !recipient.is_active || recipient.is_banned) {
      return { notificationId: null, created: false, skipped: true, skipReason: "recipient_inactive" };
    }

    // ─── Step 3: Check block relationship ───────────────────────────
    if (event.actorId) {
      // Check for mutual blocks: (blocker_id=actor AND blocked_id=recipient)
      // OR (blocker_id=recipient AND blocked_id=actor)
      const { data: blocks } = await adminClient
        .from("blocks")
        .select("id")
        .in("blocker_id", [event.actorId, event.recipientId])
        .in("blocked_id", [event.actorId, event.recipientId])
        .limit(1);

      // If there's a block in either direction, skip notification
      if (blocks && blocks.length > 0) {
        return { notificationId: null, created: false, skipped: true, skipReason: "blocked" };
      }
    }

    // ─── Step 4: Check notification preferences ─────────────────────
    const { data: prefs } = await adminClient
      .from("notification_preferences")
      .select("*")
      .eq("user_id", event.recipientId)
      .single();

    if (prefs && !prefs.in_app_enabled) {
      return { notificationId: null, created: false, skipped: true, skipReason: "in_app_disabled" };
    }

    // Check category-specific preference
    if (prefs && !isCategoryEnabled(event.type, prefs)) {
      return { notificationId: null, created: false, skipped: true, skipReason: "category_disabled" };
    }

    // ─── Step 5: Deduplication ──────────────────────────────────────
    const notificationType = EVENT_TO_NOTIFICATION_TYPE[event.type];

    // Use unique constraint: (recipient_id, type, entity_id)
    // For events that should be deduplicated, check existence
    const { data: existing } = await adminClient
      .from("notifications")
      .select("id")
      .eq("recipient_id", event.recipientId)
      .eq("type", notificationType)
      .eq("entity_id", event.entityId)
      .maybeSingle();

    if (existing) {
      return { notificationId: existing.id, created: false, skipped: true, skipReason: "duplicate" };
    }

    // ─── Step 6: Generate notification content ──────────────────────
    // Resolve actor name for template
    let actorName: string | null = null;
    if (event.actorId) {
      const { data: actor } = await adminClient
        .from("users")
        .select("display_name")
        .eq("id", event.actorId)
        .single();
      actorName = actor?.display_name ?? null;
    }

    const title = getNotificationTitle(notificationType, actorName);
    const body = getNotificationBody(notificationType, actorName, event.metadata);

    // ─── Step 7: Create notification ────────────────────────────────
    const priority = EVENT_PRIORITY[event.type];

    const { data: notification, error } = await adminClient
      .from("notifications")
      .insert({
        recipient_id: event.recipientId,
        type: notificationType,
        actor_id: event.actorId,
        entity_type: event.entityType,
        entity_id: event.entityId,
        group_key: event.groupKey ?? null,
        title,
        body,
        metadata: {
          ...(event.metadata ?? {}),
          eventId: event.id,
          priority,
          domainEventType: event.type,
        },
        channel: "in_app",
        is_read: false,
      })
      .select("id")
      .single();

    if (error || !notification) {
      logger.error("Failed to create notification", { error: error?.message });
      return { notificationId: null, created: false, skipped: true, skipReason: "creation_failed" };
    }

    // ─── Step 8: Track analytics ────────────────────────────────────
    await trackEvent(event.recipientId, "notification_created", "notification", notification.id, {
      type: notificationType,
      priority,
      domainEventType: event.type,
      entityType: event.entityType,
    }).catch(() => {});

    return { notificationId: notification.id, created: true, skipped: false };
  } catch (err) {
    logger.error("Error processing domain event", {
      error: err instanceof Error ? err.message : "Unknown",
      eventType: event.type,
    });

    return { notificationId: null, created: false, skipped: true, skipReason: "error" };
  }
}

// ─── Category Preference Check ──────────────────────────────────────────

function isCategoryEnabled(eventType: DomainEventType, prefs: any): boolean {
  const categoryMap: Record<string, string> = {
    "like.created": "post_notifications",
    "comment.created": "post_notifications",
    "reply.created": "post_notifications",
    "mention.created": "story_notifications",
    "follow.created": "follow_notifications",
    "follow.requested": "follow_notifications",
    "follow.accepted": "follow_notifications",
    "match.created": "match_notifications",
    "message.created": "message_notifications",
    "story.reaction": "story_notifications",
    "story.reply": "story_notifications",
  };

  const prefKey = categoryMap[eventType];
  if (!prefKey) return true; // Safety/system notifications always pass
  return prefs[prefKey] ?? true;
}
