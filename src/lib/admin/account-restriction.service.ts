/**
 * Account Restriction Service.
 *
 * Handles user warnings, restrictions, suspensions, and bans.
 * All enforcement is server-side — frontend checks are UX-only.
 *
 * Key principles:
 *   - Restrictions are granular (posting, messaging, commenting, etc.)
 *   - Suspensions are temporary with auto-expiry
 *   - Bans are permanent with all restrictions applied
 *   - Every action is audited
 *   - Users receive appropriate notifications
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { AppError, authorizationError, notFoundError, validationError } from "@/lib/errors";
import { can, Permissions, type Permission } from "./permissions";
import { recordAuditEvent } from "./audit.service";
import { createModerationAction } from "./moderation.service";

export type RestrictionType =
  | "posting_disabled"
  | "messaging_disabled"
  | "commenting_disabled"
  | "following_disabled"
  | "dating_disabled";

export type AccountStatus = "active" | "restricted" | "suspended" | "banned" | "deleted";

export type ModerationActionType =
  | "report_dismissed"
  | "content_removed"
  | "content_restored"
  | "user_warned"
  | "user_restricted"
  | "user_suspended"
  | "user_banned"
  | "user_unbanned"
  | "appeal_approved"
  | "appeal_denied"
  | "case_escalated"
  | "flag_dismissed";

export interface WarningInput {
  userId: string;
  reasonCode: string;
  reason: string;
}

export interface RestrictionInput {
  userId: string;
  restrictionType: RestrictionType;
  reasonCode: string;
  reason?: string;
  expiresAt?: string; // ISO date string for temporary restrictions
}

export interface SuspensionInput {
  userId: string;
  reason: string;
  suspendedUntil: string; // ISO date string
}

export interface BanInput {
  userId: string;
  reason: string;
}

// ============================================================================
// PERMISSION CHECKS
// ============================================================================

async function requirePermission(role: string, permission: Permission): Promise<void> {
  if (!(await can(role, permission))) {
    throw authorizationError("Insufficient permissions");
  }
}

// ============================================================================
// WARNINGS
// ============================================================================

/**
 * Issue a warning to a user.
 */
export async function warnUser(
  adminId: string,
  role: string,
  input: WarningInput,
): Promise<void> {
  await requirePermission(role, Permissions.USERS_RESTRICT);

  const adminClient = createAdminClient();

  // Verify user exists
  const { data: user } = await adminClient
    .from("users")
    .select("id, account_status")
    .eq("id", input.userId)
    .single();

  if (!user) throw notFoundError("User not found");

  // Don't allow warnings on already banned users
  if (user.account_status === "banned") {
    throw validationError("Cannot warn a banned user");
  }

  // Create warning record
  const { error: warningError } = await adminClient.from("user_warnings").insert({
    user_id: input.userId,
    issued_by: adminId,
    reason_code: input.reasonCode,
    reason: input.reason,
  });

  if (warningError) {
    logger.error("Failed to create warning", { userId: input.userId, error: warningError.message });
    throw new AppError("INTERNAL_ERROR", "Failed to issue warning");
  }

  // Create moderation action (also triggers notification via DB trigger)
  await createModerationAction({
    moderatorId: adminId,
    actionType: "user_warned",
    targetType: "user",
    targetId: input.userId,
    reasonCode: input.reasonCode,
    reason: input.reason,
  });

  await recordAuditEvent({
    adminId,
    action: "user_warned",
    targetType: "user",
    targetId: input.userId,
    metadata: { reasonCode: input.reasonCode, reason: input.reason },
  });
}

// ============================================================================
// RESTRICTIONS
// ============================================================================

/**
 * Apply a restriction to a user.
 */
export async function restrictUser(
  adminId: string,
  role: string,
  input: RestrictionInput,
): Promise<void> {
  await requirePermission(role, Permissions.USERS_RESTRICT);

  const adminClient = createAdminClient();

  // Verify user exists
  const { data: user } = await adminClient
    .from("users")
    .select("id, account_status")
    .eq("id", input.userId)
    .single();

  if (!user) throw notFoundError("User not found");

  // Don't allow restrictions on already banned users
  if (user.account_status === "banned") {
    throw validationError("Cannot restrict a banned user");
  }

  // Update account status to restricted if active
  if (user.account_status === "active") {
    await adminClient
      .from("users")
      .update({ account_status: "restricted" })
      .eq("id", input.userId);
  }

  // Create restriction record
  const { error: restrictionError } = await adminClient.from("user_restrictions").insert({
    user_id: input.userId,
    restriction_type: input.restrictionType,
    reason_code: input.reasonCode,
    reason: input.reason ?? null,
    issued_by: adminId,
    expires_at: input.expiresAt ?? null,
  });

  if (restrictionError) {
    logger.error("Failed to create restriction", {
      userId: input.userId,
      error: restrictionError.message,
    });
    throw new AppError("INTERNAL_ERROR", "Failed to apply restriction");
  }

  // Create moderation action (triggers notification)
  await createModerationAction({
    moderatorId: adminId,
    actionType: "user_restricted",
    targetType: "user",
    targetId: input.userId,
    reasonCode: input.reasonCode,
    reason: input.reason,
    details: { restrictionType: input.restrictionType, expiresAt: input.expiresAt },
  });

  await recordAuditEvent({
    adminId,
    action: "user_restricted",
    targetType: "user",
    targetId: input.userId,
    metadata: {
      restrictionType: input.restrictionType,
      reasonCode: input.reasonCode,
      expiresAt: input.expiresAt,
    },
  });
}

/**
 * Lift a specific restriction from a user.
 */
export async function liftRestriction(
  adminId: string,
  role: string,
  restrictionId: string,
): Promise<void> {
  await requirePermission(role, Permissions.USERS_RESTRICT);

  const adminClient = createAdminClient();

  const { data: restriction } = await adminClient
    .from("user_restrictions")
    .select("*")
    .eq("id", restrictionId)
    .single();

  if (!restriction) throw notFoundError("Restriction not found");

  await adminClient
    .from("user_restrictions")
    .update({
      is_active: false,
      lifted_at: new Date().toISOString(),
      lifted_by: adminId,
    })
    .eq("id", restrictionId);

  await recordAuditEvent({
    adminId,
    action: "user_restricted",
    targetType: "user",
    targetId: restriction.user_id,
    metadata: { liftedRestriction: restriction.restriction_type, restrictionId },
  });
}

// ============================================================================
// SUSPENSIONS
// ============================================================================

/**
 * Suspend a user temporarily.
 */
export async function suspendUser(
  adminId: string,
  role: string,
  input: SuspensionInput,
): Promise<void> {
  await requirePermission(role, Permissions.USERS_SUSPEND);

  const adminClient = createAdminClient();

  // Verify user exists
  const { data: user } = await adminClient
    .from("users")
    .select("id, account_status")
    .eq("id", input.userId)
    .single();

  if (!user) throw notFoundError("User not found");

  if (user.account_status === "banned") {
    throw validationError("Cannot suspend a banned user");
  }

  // Update user account status
  const { error: updateError } = await adminClient
    .from("users")
    .update({
      account_status: "suspended",
      suspended_until: input.suspendedUntil,
      suspension_reason: input.reason,
    })
    .eq("id", input.userId);

  if (updateError) {
    logger.error("Failed to suspend user", {
      userId: input.userId,
      error: updateError.message,
    });
    throw new AppError("INTERNAL_ERROR", "Failed to suspend user");
  }

  // Apply messaging restriction during suspension
  await adminClient.from("user_restrictions").upsert(
    {
      user_id: input.userId,
      restriction_type: "messaging_disabled",
      reason_code: "account_suspended",
      reason: input.reason,
      issued_by: adminId,
      expires_at: input.suspendedUntil,
      is_active: true,
    },
    { onConflict: "user_id, restriction_type, is_active" },
  );

  // Create moderation action (triggers notification)
  await createModerationAction({
    moderatorId: adminId,
    actionType: "user_suspended",
    targetType: "user",
    targetId: input.userId,
    reason: input.reason,
    details: { suspendedUntil: input.suspendedUntil },
  });

  await recordAuditEvent({
    adminId,
    action: "user_suspended",
    targetType: "user",
    targetId: input.userId,
    metadata: { suspendedUntil: input.suspendedUntil, reason: input.reason },
  });
}

/**
 * Unsuspend a user.
 */
export async function unsuspendUser(
  adminId: string,
  role: string,
  userId: string,
): Promise<void> {
  await requirePermission(role, Permissions.USERS_SUSPEND);

  const adminClient = createAdminClient();

  await adminClient
    .from("users")
    .update({
      account_status: "active",
      suspended_until: null,
      suspension_reason: null,
    })
    .eq("id", userId);

  // Lift messaging restriction
  await adminClient
    .from("user_restrictions")
    .update({ is_active: false, lifted_at: new Date().toISOString(), lifted_by: adminId })
    .eq("user_id", userId)
    .eq("restriction_type", "messaging_disabled")
    .eq("is_active", true);

  await recordAuditEvent({
    adminId,
    action: "user_unbanned",
    targetType: "user",
    targetId: userId,
    metadata: { action: "unsuspend" },
  });
}

// ============================================================================
// BANS
// ============================================================================

/**
 * Permanently ban a user.
 */
export async function banUser(
  adminId: string,
  role: string,
  input: BanInput,
): Promise<void> {
  await requirePermission(role, Permissions.USERS_BAN);

  const adminClient = createAdminClient();

  // Verify user exists
  const { data: user } = await adminClient
    .from("users")
    .select("id, account_status")
    .eq("id", input.userId)
    .single();

  if (!user) throw notFoundError("User not found");

  if (user.account_status === "banned") {
    throw validationError("User is already banned");
  }

  // The DB trigger (apply_ban_restrictions) will:
  // 1. Set is_banned = true
  // 2. Apply all restrictions
  await adminClient
    .from("users")
    .update({
      account_status: "banned",
      banned_by: adminId,
      banned_at: new Date().toISOString(),
      ban_reason: input.reason,
    })
    .eq("id", input.userId);

  // Create moderation action (triggers notification)
  await createModerationAction({
    moderatorId: adminId,
    actionType: "user_banned",
    targetType: "user",
    targetId: input.userId,
    reason: input.reason,
  });

  await recordAuditEvent({
    adminId,
    action: "user_banned",
    targetType: "user",
    targetId: input.userId,
    metadata: { reason: input.reason },
  });
}

/**
 * Unban a user.
 */
export async function unbanUser(
  adminId: string,
  role: string,
  userId: string,
  reason?: string,
): Promise<void> {
  await requirePermission(role, Permissions.USERS_BAN);

  const adminClient = createAdminClient();

  // The DB trigger (apply_ban_restrictions) will:
  // 1. Set is_banned = false
  // 2. Lift all restrictions
  await adminClient
    .from("users")
    .update({
      account_status: "active",
      banned_by: null,
      banned_at: null,
      ban_reason: null,
    })
    .eq("id", userId);

  // Create moderation action (triggers notification)
  await createModerationAction({
    moderatorId: adminId,
    actionType: "user_unbanned",
    targetType: "user",
    targetId: userId,
    reason: reason ?? "Account restored",
  });

  await recordAuditEvent({
    adminId,
    action: "user_unbanned",
    targetType: "user",
    targetId: userId,
    metadata: { reason },
  });
}

// ============================================================================
// USER MODERATION STATUS
// ============================================================================

/**
 * Get full moderation status for a user.
 */
export async function getUserModerationStatus(role: string, userId: string) {
  await requirePermission(role, Permissions.USERS_VIEW);

  const adminClient = createAdminClient();

  // Get user
  const { data: user } = await adminClient
    .from("users")
    .select("id, display_name, telegram_user_id, telegram_username, role, is_active, is_banned, account_status, suspended_until, suspension_reason, created_at, last_seen_at")
    .eq("id", userId)
    .single();

  if (!user) throw notFoundError("User not found");

  // Get active warnings
  const { data: warnings } = await adminClient
    .from("user_warnings")
    .select("id, reason_code, reason, is_active, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  // Get active restrictions
  const { data: restrictions } = await adminClient
    .from("user_restrictions")
    .select("id, restriction_type, reason_code, reason, expires_at, is_active, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  // Get report count (as target)
  const { count: reportCount } = await adminClient
    .from("reports")
    .select("*", { count: "exact", head: true })
    .eq("reported_user_id", userId);

  // Get moderation action history
  const { data: actions } = await adminClient
    .from("moderation_actions")
    .select("id, action_type, reason, created_at")
    .eq("target_type", "user")
    .eq("target_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  return {
    user: {
      id: user.id,
      displayName: user.display_name,
      telegramUserId: user.telegram_user_id,
      telegramUsername: user.telegram_username,
      role: user.role,
      isActive: user.is_active,
      isBanned: user.is_banned,
      accountStatus: user.account_status,
      suspendedUntil: user.suspended_until,
      suspensionReason: user.suspension_reason,
      createdAt: user.created_at,
      lastSeenAt: user.last_seen_at,
    },
    warnings: (warnings ?? []).map((w) => ({
      id: w.id,
      reasonCode: w.reason_code,
      reason: w.reason,
      isActive: w.is_active,
      createdAt: w.created_at,
    })),
    restrictions: (restrictions ?? []).map((r) => ({
      id: r.id,
      type: r.restriction_type,
      reasonCode: r.reason_code,
      reason: r.reason,
      expiresAt: r.expires_at,
      isActive: r.is_active,
      createdAt: r.created_at,
    })),
    reportCount: reportCount ?? 0,
    moderationHistory: (actions ?? []).map((a) => ({
      id: a.id,
      actionType: a.action_type,
      reason: a.reason,
      createdAt: a.created_at,
    })),
  };
}

/**
 * Search users by various identifiers (admin only).
 */
export async function searchUsers(
  role: string,
  query: string,
  limit = 20,
) {
  await requirePermission(role, Permissions.USERS_VIEW);

  const adminClient = createAdminClient();

  // Search by telegram_user_id, display_name, or id
  const { data, error } = await adminClient
    .from("users")
    .select("id, display_name, telegram_user_id, telegram_username, role, is_active, is_banned, account_status, created_at, last_seen_at")
    .or(
      `telegram_user_id.eq.${query},` +
      `display_name.ilike.%${query}%,` +
      `telegram_username.ilike.%${query}%,` +
      `id.eq.${query}`,
    )
    .limit(limit);

  if (error) {
    logger.error("Failed to search users", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to search users");
  }

  return (data ?? []).map((u) => ({
    id: u.id,
    displayName: u.display_name,
    telegramUserId: u.telegram_user_id,
    telegramUsername: u.telegram_username,
    role: u.role,
    isActive: u.is_active,
    isBanned: u.is_banned,
    accountStatus: u.account_status,
    createdAt: u.created_at,
    lastSeenAt: u.last_seen_at,
  }));
}
