/**
 * Notification Integration Service — Hooks for domain actions.
 *
 * Provides clean integration points for other parts of the app
 * to trigger notifications without needing to understand the
 * domain event system internals.
 *
 * Each function:
 *   1. Validates the action
 *   2. Emits a domain event
 *   3. Processes it through the notification pipeline
 *   4. Returns the result
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { processDomainEvent, type DomainEvent } from "@/lib/notifications/domain-events";
import { checkNotificationCooldown } from "@/lib/notifications/services/throttle.service";

// ─── Helpers ────────────────────────────────────────────────────────────

function generateEventId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

// ─── Like Notification ──────────────────────────────────────────────────

/**
 * Create a notification when a user likes a post.
 * Call this after the like is persisted.
 */
export async function notifyPostLike(
  postAuthorId: string,
  likerId: string,
  postId: string,
): Promise<void> {
  const event: DomainEvent = {
    id: generateEventId(),
    type: "like.created",
    timestamp: now(),
    actorId: likerId,
    recipientId: postAuthorId,
    entityType: "post",
    entityId: postId,
    groupKey: `post_like:${postId}`,
    metadata: { post_id: postId },
  };

  await processDomainEvent(event);
}

// ─── Comment Notification ───────────────────────────────────────────────

/**
 * Create a notification when a user comments on a post.
 * Notifies the post author.
 */
export async function notifyPostComment(
  postAuthorId: string,
  commenterId: string,
  postId: string,
  commentId: string,
): Promise<void> {
  const cooldown = checkNotificationCooldown("comment.created", postAuthorId);
  if (cooldown.shouldSuppress) return;

  const event: DomainEvent = {
    id: generateEventId(),
    type: "comment.created",
    timestamp: now(),
    actorId: commenterId,
    recipientId: postAuthorId,
    entityType: "post",
    entityId: postId,
    groupKey: `post_comment:${postId}`,
    metadata: { post_id: postId, comment_id: commentId },
  };

  await processDomainEvent(event);
}

// ─── Reply Notification ─────────────────────────────────────────────────

/**
 * Create a notification when someone replies to a comment.
 * Notifies the parent comment author (if different from replier).
 */
export async function notifyCommentReply(
  parentCommentAuthorId: string,
  replierId: string,
  postId: string,
  commentId: string,
  parentCommentId: string,
): Promise<void> {
  // Don't notify if replying to own comment
  if (parentCommentAuthorId === replierId) return;

  const cooldown = checkNotificationCooldown("reply.created", parentCommentAuthorId);
  if (cooldown.shouldSuppress) return;

  const event: DomainEvent = {
    id: generateEventId(),
    type: "reply.created",
    timestamp: now(),
    actorId: replierId,
    recipientId: parentCommentAuthorId,
    entityType: "comment",
    entityId: parentCommentId,
    metadata: {
      post_id: postId,
      comment_id: commentId,
      parent_comment_id: parentCommentId,
    },
  };

  await processDomainEvent(event);
}

// ─── Mention Notification ───────────────────────────────────────────────

/**
 * Create a notification when a user is mentioned (@username).
 * Validates the mentioned user server-side and respects blocks.
 */
export async function notifyMention(
  mentionedUserId: string,
  mentionerId: string,
  entityType: "post" | "comment",
  entityId: string,
): Promise<void> {
  // Don't notify self-mentions
  if (mentionedUserId === mentionerId) return;

  const cooldown = checkNotificationCooldown("mention.created", mentionedUserId);
  if (cooldown.shouldSuppress) return;

  const event: DomainEvent = {
    id: generateEventId(),
    type: "mention.created",
    timestamp: now(),
    actorId: mentionerId,
    recipientId: mentionedUserId,
    entityType,
    entityId,
    metadata: { mention_type: entityType },
  };

  await processDomainEvent(event);
}

// ─── Follow Notification ────────────────────────────────────────────────

/**
 * Create a notification when someone follows a user.
 */
export async function notifyFollow(
  followedUserId: string,
  followerId: string,
): Promise<void> {
  // Check privacy: private accounts may need follow request handling
  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("profiles")
    .select("profile_visibility")
    .eq("user_id", followedUserId)
    .single();

  const isPrivate = profile?.profile_visibility === "private";

  if (isPrivate) {
    // Private account: follow request (no group key — each request is distinct)
    const event: DomainEvent = {
      id: generateEventId(),
      type: "follow.requested",
      timestamp: now(),
      actorId: followerId,
      recipientId: followedUserId,
      entityType: "profile",
      entityId: followerId,
      metadata: { private_account: true },
    };
    await processDomainEvent(event);
  } else {
    // Public account: standard follow notification
    const event: DomainEvent = {
      id: generateEventId(),
      type: "follow.created",
      timestamp: now(),
      actorId: followerId,
      recipientId: followedUserId,
      entityType: "profile",
      entityId: followerId,
      groupKey: `follow:`,
      metadata: {},
    };
    await processDomainEvent(event);
  }
}

// ─── Match Notification ─────────────────────────────────────────────────

/**
 * Create a notification when a mutual match is created.
 * The match itself is created by process_dating_action;
 * this handles just the notification side.
 */
export async function notifyMatch(
  matchedUserId: string,
  matcherUserId: string,
  matchId: string,
): Promise<void> {
  const event: DomainEvent = {
    id: generateEventId(),
    type: "match.created",
    timestamp: now(),
    actorId: matcherUserId,
    recipientId: matchedUserId,
    entityType: "match",
    entityId: matchId,
    metadata: { match_id: matchId },
  };

  await processDomainEvent(event);
}

// ─── Message Notification ───────────────────────────────────────────────

/**
 * Create a notification when a message is sent in a match conversation.
 */
export async function notifyMessage(
  recipientId: string,
  senderId: string,
  conversationId: string,
  messageId: string,
): Promise<void> {
  if (recipientId === senderId) return;

  const event: DomainEvent = {
    id: generateEventId(),
    type: "message.created",
    timestamp: now(),
    actorId: senderId,
    recipientId,
    entityType: "conversation",
    entityId: conversationId,
    metadata: { conversation_id: conversationId, message_id: messageId },
  };

  await processDomainEvent(event);
}

// ─── Story Reaction Notification ────────────────────────────────────────

/**
 * Create a notification when someone reacts to a story.
 */
export async function notifyStoryReaction(
  storyAuthorId: string,
  reactorId: string,
  storyId: string,
  reactionType?: string,
): Promise<void> {
  const event: DomainEvent = {
    id: generateEventId(),
    type: "story.reaction",
    timestamp: now(),
    actorId: reactorId,
    recipientId: storyAuthorId,
    entityType: "story",
    entityId: storyId,
    groupKey: `story_reaction:${storyId}`,
    metadata: { story_id: storyId, reaction_type: reactionType ?? "like" },
  };

  await processDomainEvent(event);
}

// ─── Safety Notification ────────────────────────────────────────────────

/**
 * Create a safety notification (content removal, account restriction).
 * Only system/admin can trigger these — actorId is null.
 */
export async function notifySafety(
  recipientId: string,
  safetyType: "safety.content_removed" | "safety.account_restriction" | "safety.security_event",
  entityType: string,
  entityId: string,
  details: Record<string, unknown>,
): Promise<void> {
  const event: DomainEvent = {
    id: generateEventId(),
    type: safetyType,
    timestamp: now(),
    actorId: null, // System-generated
    recipientId,
    entityType,
    entityId,
    metadata: {
      ...details,
      safety_type: safetyType,
    },
  };

  await processDomainEvent(event);
}

// ─── System Notification ────────────────────────────────────────────────

/**
 * Create a generic system notification (feature updates, maintenance, etc.).
 */
export async function notifySystem(
  recipientId: string,
  title: string,
  body: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const event: DomainEvent = {
    id: generateEventId(),
    type: "system",
    timestamp: now(),
    actorId: null,
    recipientId,
    entityType: "system",
    entityId: "system",
    metadata: { title, body, ...metadata },
  };

  await processDomainEvent(event);
}
