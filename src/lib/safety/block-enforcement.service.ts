/**
 * Block Enforcement Service
 *
 * Comprehensive server-side block enforcement. When User A blocks User B:
 *   - Hide profile in discovery/social recommendations
 *   - Prevent unwanted messaging (return block status)
 *   - Prevent inappropriate discovery (mutual exclusion)
 *   - Restrict interactions (follows, comments, likes)
 *   - Respect story/content privacy
 *   - Prevent notification leakage about blocked user
 *
 * All enforcement is server-authoritative — frontend checks are UX-only.
 * Every bypass attempt must fail at the server side.
 *
 * Reuses the existing blocks table and RLS policies.
 * Adds comprehensive enforcement functions for application services.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export type BlockRelationType =
  | "not_blocked"
  | "viewer_blocked_target" // Current user blocked the other user
  | "target_blocked_viewer" // Other user blocked the current user
  | "mutual_block"; // Both blocked each other

export interface BlockCheckResult {
  isBlocked: boolean;
  relationType: BlockRelationType;
}

/**
 * Check the block relationship between two users.
 * This is the primary function for all block checks.
 */
export async function checkBlockRelation(
  userIdA: string,
  userIdB: string,
): Promise<BlockCheckResult> {
  if (userIdA === userIdB) {
    return { isBlocked: false, relationType: "not_blocked" };
  }

  const adminClient = createAdminClient();

  const { data: blocks } = await adminClient
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(
      `and(blocker_id.eq.${userIdA},blocked_id.eq.${userIdB}),and(blocker_id.eq.${userIdB},blocked_id.eq.${userIdA})`,
    )
    .limit(2);

  if (!blocks || blocks.length === 0) {
    return { isBlocked: false, relationType: "not_blocked" };
  }

  const viewerBlockedTarget = blocks.some(
    (b: any) => b.blocker_id === userIdA && b.blocked_id === userIdB,
  );
  const targetBlockedViewer = blocks.some(
    (b: any) => b.blocker_id === userIdB && b.blocked_id === userIdA,
  );

  if (viewerBlockedTarget && targetBlockedViewer) {
    return { isBlocked: true, relationType: "mutual_block" };
  }
  if (viewerBlockedTarget) {
    return { isBlocked: true, relationType: "viewer_blocked_target" };
  }
  return { isBlocked: true, relationType: "target_blocked_viewer" };
}

/**
 * Batch check block relationships for multiple users.
 * More efficient than individual checks.
 */
export async function batchCheckBlockRelations(
  userId: string,
  targetUserIds: string[],
): Promise<Map<string, BlockCheckResult>> {
  const results = new Map<string, BlockCheckResult>();

  if (targetUserIds.length === 0) return results;

  const adminClient = createAdminClient();

  // Get all blocks involving the user
  const { data: userBlocks } = await adminClient
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(
      `blocker_id.eq.${userId},blocked_id.eq.${userId}`,
    );

  const blockedByUser = new Set<string>();
  const blockedByThem = new Set<string>();

  for (const block of userBlocks ?? []) {
    if ((block as any).blocker_id === userId) {
      blockedByUser.add((block as any).blocked_id);
    }
    if ((block as any).blocked_id === userId) {
      blockedByThem.add((block as any).blocker_id);
    }
  }

  for (const targetId of targetUserIds) {
    const userBlocked = blockedByUser.has(targetId);
    const themBlocked = blockedByThem.has(targetId);

    if (userBlocked && themBlocked) {
      results.set(targetId, { isBlocked: true, relationType: "mutual_block" });
    } else if (userBlocked) {
      results.set(targetId, { isBlocked: true, relationType: "viewer_blocked_target" });
    } else if (themBlocked) {
      results.set(targetId, { isBlocked: true, relationType: "target_blocked_viewer" });
    } else {
      results.set(targetId, { isBlocked: false, relationType: "not_blocked" });
    }
  }

  return results;
}

/**
 * Check if a user can message another user.
 * Respects blocks and message request settings.
 */
export async function canUserMessage(
  senderId: string,
  recipientId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const adminClient = createAdminClient();

  // Check block relationship
  const blockCheck = await checkBlockRelation(senderId, recipientId);
  if (blockCheck.isBlocked) {
    return { allowed: false, reason: "Blocked" };
  }

  // Check if recipient has restricted messaging
  const { data: restriction } = await adminClient
    .from("user_restrictions")
    .select("id")
    .eq("user_id", senderId)
    .eq("restriction_type", "messaging_disabled")
    .eq("is_active", true)
    .maybeSingle();

  if (restriction) {
    return { allowed: false, reason: "Messaging restricted" };
  }

  // Check if users are matched (for match-only messaging contexts)
  const { data: match } = await adminClient
    .from("matches")
    .select("id")
    .or(
      `and(user_a_id.eq.${senderId},user_b_id.eq.${recipientId}),and(user_a_id.eq.${recipientId},user_b_id.eq.${senderId})`,
    )
    .eq("status", "active")
    .maybeSingle();

  if (!match) {
    // Check message request settings for non-matched users
    const { data: msgSettings } = await adminClient
      .from("message_request_settings")
      .select("who_can_message, allow_new_accounts")
      .eq("user_id", recipientId)
      .maybeSingle();

    if (msgSettings) {
      switch (msgSettings.who_can_message) {
        case "nobody":
          return { allowed: false, reason: "Recipient does not accept messages" };
        case "matches_only":
          return { allowed: false, reason: "Match with recipient to message" };
        case "followers": {
          // Check if sender follows recipient
          const { data: follow } = await adminClient
            .from("follows")
            .select("id")
            .eq("follower_id", senderId)
            .eq("following_id", recipientId)
            .maybeSingle();

          if (!follow) {
            return { allowed: false, reason: "Follow recipient to message" };
          }
          break;
        }
        // 'everyone' — allow through
      }

      if (!msgSettings.allow_new_accounts) {
        // Check if sender account is very new
        const { data: user } = await adminClient
          .from("users")
          .select("created_at")
          .eq("id", senderId)
          .single();

        if (user) {
          const daysOld =
            (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24);
          if (daysOld < 1) {
            return {
              allowed: false,
              reason: "Your account is too new to send messages. Please try again later.",
            };
          }
        }
      }
    }
  }

  return { allowed: true };
}

/**
 * Check if a user can see another user's profile.
 * Blocks should prevent profile visibility.
 */
export async function canViewProfile(
  viewerId: string,
  profileUserId: string,
): Promise<boolean> {
  if (viewerId === profileUserId) return true;

  const blockCheck = await checkBlockRelation(viewerId, profileUserId);
  return !blockCheck.isBlocked;
}

/**
 * Get blocked user IDs for exclusion from discovery/feed.
 * Returns a combined set of users blocked by or blocking the given user.
 */
export async function getBlockedUserIdsFor(userId: string): Promise<Set<string>> {
  const adminClient = createAdminClient();

  const [asBlocker, asBlocked] = await Promise.all([
    adminClient.from("blocks").select("blocked_id").eq("blocker_id", userId),
    adminClient.from("blocks").select("blocker_id").eq("blocked_id", userId),
  ]);

  const ids = new Set<string>();
  (asBlocker.data ?? []).forEach((b: any) => ids.add(b.blocked_id));
  (asBlocked.data ?? []).forEach((b: any) => ids.add(b.blocker_id));

  return ids;
}

/**
 * Remove any interactions triggered by a blocked user.
 * Called after a block is created to clean up existing interactions.
 */
export async function cleanupBlockedInteractions(
  blockerId: string,
  blockedId: string,
): Promise<void> {
  const adminClient = createAdminClient();

  const now = new Date().toISOString();

  // Fetch story IDs separately (Supabase JS client doesn't support subqueries)
  const { data: blockerStories } = await adminClient
    .from("stories")
    .select("id")
    .eq("author_id", blockerId);
  const blockerStoryIds = (blockerStories ?? []).map((s: any) => s.id);

  // Fetch conversation IDs with blocked user
  const { data: blockedConvs } = await adminClient
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", blockedId);
  const blockedConvIds = (blockedConvs ?? []).map((c: any) => c.conversation_id);

  // Execute cleanup operations — each wrapped in try/catch to avoid one failure blocking others
  const cleanupTasks: Promise<unknown>[] = [
    // Remove follows (both directions)
    Promise.resolve(
      adminClient
        .from("follows")
        .delete()
        .or(
          `and(follower_id.eq.${blockerId},following_id.eq.${blockedId}),and(follower_id.eq.${blockedId},following_id.eq.${blockerId})`,
        ),
    ),
  ];

  // Remove story views from blocked user
  if (blockerStoryIds.length > 0) {
    cleanupTasks.push(
      Promise.resolve(
        adminClient
          .from("story_views")
          .delete()
          .eq("viewer_id", blockedId)
          .in("story_id", blockerStoryIds),
      ),
    );
  }

  // Mute conversations with blocked user
  if (blockedConvIds.length > 0) {
    cleanupTasks.push(
      Promise.resolve(
        adminClient
          .from("conversation_members")
          .update({ is_active: false, left_at: now })
          .eq("user_id", blockerId)
          .in("conversation_id", blockedConvIds),
      ),
    );
  }

  await Promise.allSettled(cleanupTasks);

  logger.info("Block interaction cleanup complete", { blockerId, blockedId });
}

/**
 * Check if a user can interact with another user (follow, comment, like).
 */
export async function canInteract(
  actorId: string,
  targetId: string,
): Promise<boolean> {
  if (actorId === targetId) return true;

  const blockCheck = await checkBlockRelation(actorId, targetId);
  if (blockCheck.isBlocked) return false;

  // Check if actor has interaction restrictions
  const adminClient = createAdminClient();
  const { data: restriction } = await adminClient
    .from("user_restrictions")
    .select("id")
    .eq("user_id", actorId)
    .in("restriction_type", [
      "posting_disabled",
      "commenting_disabled",
      "following_disabled",
    ])
    .eq("is_active", true)
    .maybeSingle();

  return !restriction;
}
