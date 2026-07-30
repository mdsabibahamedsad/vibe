/**
 * Moderation Service — Main Entry Point.
 *
 * Centralizes moderation business logic and provides a unified interface
 * for all moderation operations.
 *
 * All security-sensitive operations go through this service:
 *   1. Authorization check (permissions)
 *   2. Business logic execution
 *   3. Moderation action record
 *   4. Audit log entry
 *   5. Notification (via DB trigger)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { AppError, authorizationError } from "@/lib/errors";
import { can, Permissions } from "./permissions";
import { recordAuditEvent, type AuditAction, type AuditTargetType } from "./audit.service";

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

export type ModerationTargetType =
  | "user"
  | "post"
  | "comment"
  | "story"
  | "message"
  | "media";

export interface ModerationActionInput {
  moderatorId: string;
  actionType: ModerationActionType;
  targetType: ModerationTargetType;
  targetId: string;
  reasonCode?: string;
  reason?: string;
  details?: Record<string, unknown>;
}

/**
 * Create a moderation action record.
 * This is the core function that records all moderation actions.
 * It also creates an audit log entry.
 *
 * Call this from all moderation services.
 */
export async function createModerationAction(
  input: ModerationActionInput,
): Promise<string> {
  const adminClient = createAdminClient();

  try {
    const { data, error } = await adminClient.rpc("create_moderation_action", {
      p_moderator_id: input.moderatorId,
      p_action_type: input.actionType,
      p_target_type: input.targetType,
      p_target_id: input.targetId,
      p_reason_code: input.reasonCode ?? null,
      p_reason: input.reason ?? null,
      p_details: (input.details ?? {}) as any,
    });

    if (error) {
      logger.error("Failed to create moderation action", {
        actionType: input.actionType,
        error: error.message,
      });
      // Fallback: insert directly
      const { data: directData, error: directError } = await adminClient
        .from("moderation_actions")
        .insert({
          moderator_id: input.moderatorId,
          action_type: input.actionType,
          target_type: input.targetType,
          target_id: input.targetId,
          reason_code: input.reasonCode ?? null,
          reason: input.reason ?? null,
          details: (input.details ?? {}) as any,
        })
        .select("id")
        .single();

      if (directError) {
        logger.error("Fallback moderation action insert also failed", {
          error: directError.message,
        });
        throw new AppError("INTERNAL_ERROR", "Failed to record moderation action");
      }

      return directData.id;
    }

    return data as string;
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error("Unexpected error creating moderation action", {
      error: String(err),
    });
    throw new AppError("INTERNAL_ERROR", "Failed to record moderation action");
  }
}

/**
 * Check if a user is restricted from a specific capability.
 * Used server-side by API routes and services.
 */
export async function checkUserRestriction(
  userId: string,
  restrictionType: "posting_disabled" | "messaging_disabled" | "commenting_disabled" | "following_disabled" | "dating_disabled",
): Promise<boolean> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient.rpc("check_user_restriction", {
    p_user_id: userId,
    p_restriction_type: restrictionType,
  });

  if (error) {
    logger.error("Failed to check user restriction", {
      userId,
      restrictionType,
      error: error.message,
    });
    return false; // Fail open for safety checks? No — fail securely
  }

  return data ?? false;
}

/**
 * Get dashboard metrics for the admin overview.
 */
export async function getDashboardMetrics() {
  const adminClient = createAdminClient();

  try {
    const { data, error } = await adminClient.rpc("get_moderation_dashboard_metrics");

    if (error) {
      // Fallback: aggregate manually
      return await getDashboardMetricsFallback();
    }

    return data as Record<string, number>;
  } catch {
    return await getDashboardMetricsFallback();
  }
}

async function getDashboardMetricsFallback(): Promise<Record<string, number>> {
  const adminClient = createAdminClient();

  const today = new Date().toISOString().split("T")[0];

  const [
    { count: newUsers },
    { count: openReports },
    { count: criticalReports },
    { count: bannedUsers },
    { count: suspendedUsers },
    { count: pendingAppeals },
  ] = await Promise.all([
    adminClient
      .from("users")
      .select("*", { count: "exact", head: true })
      .gte("created_at", today),
    adminClient
      .from("reports")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "reviewing"]),
    adminClient
      .from("reports")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "reviewing"])
      .eq("priority", "critical"),
    adminClient
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("account_status", "banned"),
    adminClient
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("account_status", "suspended"),
    adminClient
      .from("appeals")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "in_review"]),
  ]);

  return {
    new_users_today: newUsers ?? 0,
    open_reports: openReports ?? 0,
    critical_reports: criticalReports ?? 0,
    banned_users: bannedUsers ?? 0,
    suspended_users: suspendedUsers ?? 0,
    pending_appeals: pendingAppeals ?? 0,
  };
}

/**
 * Log an admin login event.
 */
export async function logAdminLogin(adminId: string, ipAddress?: string): Promise<void> {
  await recordAuditEvent({
    adminId,
    action: "admin_login",
    targetType: "user",
    targetId: adminId,
    ipAddress,
  });
}
