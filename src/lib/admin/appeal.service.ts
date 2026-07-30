/**
 * Appeals Management Service.
 *
 * Handles the lifecycle of user appeals against moderation actions.
 * Appeals allow users to contest warnings, restrictions, suspensions, and bans.
 *
 * Prevents abusive repeated appeals for the same action via cooldown.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { AppError, authorizationError, notFoundError, validationError } from "@/lib/errors";
import { can, Permissions, type Permission } from "./permissions";
import { recordAuditEvent } from "./audit.service";
import { createModerationAction } from "./moderation.service";

export type AppealStatus = "pending" | "in_review" | "approved" | "denied";

export interface Appeal {
  id: string;
  userId: string;
  moderationActionId: string | null;
  reason: string;
  status: AppealStatus;
  decisionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppealFilters {
  status?: AppealStatus;
  userId?: string;
  cursor?: string;
  limit?: number;
}

export interface AppealResult {
  items: Appeal[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

const DEFAULT_PAGE_SIZE = 25;
const APPEAL_COOLDOWN_HOURS = 24;

// ============================================================================
// PERMISSION CHECKS
// ============================================================================

async function requirePermission(role: string, permission: Permission): Promise<void> {
  if (!(await can(role, permission))) {
    throw authorizationError("Insufficient permissions");
  }
}

// ============================================================================
// USER-FACING: CREATE APPEAL
// ============================================================================

/**
 * Create a new appeal (called by the affected user).
 * Rate-limited: one appeal per moderation action per 24h.
 */
export async function createAppeal(
  userId: string,
  moderationActionId: string,
  reason: string,
): Promise<void> {
  if (!reason || reason.trim().length < 10) {
    throw validationError("Appeal reason must be at least 10 characters");
  }

  if (reason.length > 2000) {
    throw validationError("Appeal reason must be under 2000 characters");
  }

  const adminClient = createAdminClient();

  // Verify the moderation action exists and involves this user
  const { data: action } = await adminClient
    .from("moderation_actions")
    .select("id, target_type, target_id, action_type, created_at")
    .eq("id", moderationActionId)
    .single();

  if (!action) throw notFoundError("Moderation action not found");
  if (action.target_type !== "user" || action.target_id !== userId) {
    throw validationError("This moderation action does not apply to you");
  }

  // Check for existing pending/in-review appeals for this action
  const { data: existing } = await adminClient
    .from("appeals")
    .select("id, status, created_at")
    .eq("user_id", userId)
    .eq("moderation_action_id", moderationActionId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (existing && existing.length > 0) {
    const latest = existing[0];
    if (latest.status === "pending" || latest.status === "in_review") {
      throw validationError("You already have a pending appeal for this action");
    }

    // Check cooldown
    const hoursSinceLastAppeal =
      (Date.now() - new Date(latest.created_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastAppeal < APPEAL_COOLDOWN_HOURS) {
      throw validationError(
        `You can submit another appeal in ${Math.ceil(APPEAL_COOLDOWN_HOURS - hoursSinceLastAppeal)} hours`,
      );
    }
  }

  // Create appeal
  const { error } = await adminClient.from("appeals").insert({
    user_id: userId,
    moderation_action_id: moderationActionId,
    reason: reason.trim(),
  });

  if (error) {
    logger.error("Failed to create appeal", { userId, error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to submit appeal");
  }
}

// ============================================================================
// ADMIN-FACING: LIST APPEALS
// ============================================================================

/**
 * List appeals with cursor pagination.
 */
export async function listAppeals(
  role: string,
  filters: AppealFilters = {},
): Promise<AppealResult> {
  await requirePermission(role, Permissions.APPEALS_VIEW);

  const adminClient = createAdminClient();
  const limit = Math.min(filters.limit ?? DEFAULT_PAGE_SIZE, 100);

  let query = adminClient
    .from("appeals")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.userId) {
    query = query.eq("user_id", filters.userId);
  }

  if (filters.cursor) {
    const [cursorTime, cursorId] = filters.cursor.split("_");
    if (cursorTime && cursorId) {
      query = query.or(
        `created_at.lt.${cursorTime},and(created_at.eq.${cursorTime},id.lt.${cursorId})`,
      );
    }
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error("Failed to list appeals", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to list appeals");
  }

  const items = (data ?? []).slice(0, limit);
  const hasMore = (data ?? []).length > limit;
  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? `${lastItem.created_at}_${lastItem.id}`
      : null;

  return {
    items: items.map(formatAppeal),
    nextCursor,
    hasMore,
    total: count ?? 0,
  };
}

// ============================================================================
// ADMIN-FACING: GET SINGLE APPEAL
// ============================================================================

/**
 * Get a single appeal with full context for review.
 */
export async function getAppeal(
  role: string,
  appealId: string,
) {
  await requirePermission(role, Permissions.APPEALS_VIEW);

  const adminClient = createAdminClient();

  const { data: appeal, error } = await adminClient
    .from("appeals")
    .select("*")
    .eq("id", appealId)
    .single();

  if (error || !appeal) throw notFoundError("Appeal not found");

  // Get the moderation action being appealed
  const { data: modAction } = await adminClient
    .from("moderation_actions")
    .select("*")
    .eq("id", appeal.moderation_action_id)
    .single();

  // Get the user info
  const { data: user } = await adminClient
    .from("users")
    .select("id, display_name, telegram_username, account_status, is_banned")
    .eq("id", appeal.user_id)
    .single();

  // Get user's moderation history
  const { data: userActions } = await adminClient
    .from("moderation_actions")
    .select("id, action_type, reason, created_at")
    .eq("target_type", "user")
    .eq("target_id", appeal.user_id)
    .order("created_at", { ascending: false })
    .limit(10);

  return {
    appeal: formatAppeal(appeal),
    moderationAction: modAction
      ? {
          id: modAction.id,
          actionType: modAction.action_type,
          reason: modAction.reason,
          createdAt: modAction.created_at,
          details: modAction.details,
        }
      : null,
    user: user
      ? {
          id: user.id,
          displayName: user.display_name,
          username: user.telegram_username,
          accountStatus: user.account_status,
          isBanned: user.is_banned,
        }
      : null,
    userModerationHistory: (userActions ?? []).map((a) => ({
      id: a.id,
      actionType: a.action_type,
      reason: a.reason,
      createdAt: a.created_at,
    })),
  };
}

// ============================================================================
// ADMIN-FACING: RESOLVE APPEAL
// ============================================================================

/**
 * Resolve an appeal (approve or deny).
 */
export async function resolveAppeal(
  adminId: string,
  role: string,
  appealId: string,
  decision: {
    status: "approved" | "denied";
    note?: string;
  },
): Promise<void> {
  await requirePermission(role, Permissions.APPEALS_RESOLVE);

  const adminClient = createAdminClient();

  // Get appeal
  const { data: appeal } = await adminClient
    .from("appeals")
    .select("*")
    .eq("id", appealId)
    .single();

  if (!appeal) throw notFoundError("Appeal not found");
  if (appeal.status !== "pending" && appeal.status !== "in_review") {
    throw validationError("Appeal has already been resolved");
  }

  // Update appeal
  const { error } = await adminClient
    .from("appeals")
    .update({
      status: decision.status,
      decision_note: decision.note ?? null,
      resolved_by: adminId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", appealId);

  if (error) {
    logger.error("Failed to resolve appeal", { appealId, error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to resolve appeal");
  }

  // If approved, reverse the original moderation action
  if (decision.status === "approved" && appeal.moderation_action_id) {
    const { data: modAction } = await adminClient
      .from("moderation_actions")
      .select("action_type, target_type, target_id")
      .eq("id", appeal.moderation_action_id)
      .single();

    if (modAction) {
      // Reverse based on the original action type
      switch (modAction.action_type) {
        case "user_banned":
          await reverseBan(adminClient, modAction.target_id, adminId);
          break;
        case "user_suspended":
          await reverseSuspension(adminClient, modAction.target_id, adminId);
          break;
        case "user_restricted":
          await reverseRestrictions(adminClient, modAction.target_id, adminId);
          break;
        case "content_removed":
          await reverseContentRemoval(
            adminClient,
            modAction.target_type as ContentType,
            modAction.target_id,
            adminId,
          );
          break;
      }
    }
  }

  // Create audit event
  await createModerationAction({
    moderatorId: adminId,
    actionType: decision.status === "approved" ? "appeal_approved" : "appeal_denied",
    targetType: "user",
    targetId: appeal.user_id,
    reason: decision.note ?? `Appeal ${decision.status}`,
    details: { appealId, moderationActionId: appeal.moderation_action_id },
  });

  await recordAuditEvent({
    adminId,
    action: "appeal_reviewed",
    targetType: "appeal",
    targetId: appealId,
    metadata: { decision: decision.status, note: decision.note },
  });
}

// ============================================================================
// HELPER: Get user-facing appeals
// ============================================================================

/**
 * Get appeals for the current user (for the user-facing appeal page).
 */
export async function getUserAppeals(userId: string): Promise<Appeal[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("appeals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    logger.error("Failed to get user appeals", { userId, error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to get appeals");
  }

  return (data ?? []).map(formatAppeal);
}

// ============================================================================
// HELPERS: Reversal functions
// ============================================================================

type ContentType = "post" | "comment" | "story" | "media";

async function reverseBan(
  client: ReturnType<typeof createAdminClient>,
  userId: string,
  adminId: string,
) {
  await client
    .from("users")
    .update({
      account_status: "active",
      banned_by: null,
      banned_at: null,
      ban_reason: null,
    })
    .eq("id", userId);
}

async function reverseSuspension(
  client: ReturnType<typeof createAdminClient>,
  userId: string,
  adminId: string,
) {
  await client
    .from("users")
    .update({
      account_status: "active",
      suspended_until: null,
      suspension_reason: null,
    })
    .eq("id", userId);
}

async function reverseRestrictions(
  client: ReturnType<typeof createAdminClient>,
  userId: string,
  adminId: string,
) {
  await client
    .from("user_restrictions")
    .update({ is_active: false, lifted_at: new Date().toISOString(), lifted_by: adminId })
    .eq("user_id", userId)
    .eq("is_active", true);
}

async function reverseContentRemoval(
  client: ReturnType<typeof createAdminClient>,
  contentType: ContentType,
  contentId: string,
  adminId: string,
) {
  const tableMap: Record<ContentType, string> = {
    post: "posts",
    comment: "post_comments",
    story: "stories",
    media: "media",
  };

  const table = tableMap[contentType];
  if (table) {
    await client
      .from(table)
      .update({
        moderation_status: "restored",
        restored_at: new Date().toISOString(),
        restored_by: adminId,
        deleted_at: null,
      })
      .eq("id", contentId);
  }
}

// ============================================================================
// FORMATTING
// ============================================================================

function formatAppeal(raw: Record<string, unknown>): Appeal {
  return {
    id: raw.id as string,
    userId: raw.user_id as string,
    moderationActionId: (raw.moderation_action_id as string) ?? null,
    reason: raw.reason as string,
    status: (raw.status as AppealStatus) ?? "pending",
    decisionNote: (raw.decision_note as string) ?? null,
    resolvedBy: (raw.resolved_by as string) ?? null,
    resolvedAt: (raw.resolved_at as string) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}
