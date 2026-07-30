/**
 * Audit Log Service.
 *
 * Every privileged admin/moderation action must generate an audit event.
 * Audit logs are immutable — they cannot be edited or deleted through the admin UI.
 *
 * NEVER log:
 *   - Passwords or authentication tokens
 *   - Telegram bot tokens
 *   - Private message contents
 *   - Unnecessary sensitive personal data
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

export type AuditAction =
  | "admin_login"
  | "role_changed"
  | "permission_changed"
  | "report_viewed"
  | "report_assigned"
  | "content_removed"
  | "content_restored"
  | "user_warned"
  | "user_restricted"
  | "user_suspended"
  | "user_banned"
  | "user_unbanned"
  | "appeal_reviewed"
  | "admin_note_created"
  | "bulk_action"
  | "escalation"
  | "subscription_viewed"
  | "subscription_reconciled"
  | "manual_entitlement_granted"
  | "manual_entitlement_revoked";

export type AuditTargetType =
  | "user"
  | "post"
  | "comment"
  | "story"
  | "message"
  | "media"
  | "report"
  | "appeal"
  | "moderation_case"
  | "role"
  | "permission"
  | "subscription"
  | "entitlement";

export interface AuditEventInput {
  adminId: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export interface AuditLogEntry extends AuditEventInput {
  id: string;
  createdAt: string;
}

export interface AuditLogFilters {
  adminId?: string;
  action?: AuditAction;
  targetType?: AuditTargetType;
  startDate?: string;
  endDate?: string;
  cursor?: string;
  limit?: number;
}

export interface AuditLogResult {
  items: AuditLogEntry[];
  nextCursor: string | null;
  hasMore: boolean;
}

const DEFAULT_PAGE_SIZE = 50;

/**
 * Record an audit event.
 *
 * This should be the ONLY function used to create audit log entries.
 * All admin services must call this for every privileged operation.
 *
 * The audit entry is created atomically and cannot be removed.
 */
export async function recordAuditEvent(event: AuditEventInput): Promise<void> {
  try {
    const adminClient = createAdminClient();

    const { error } = await adminClient.from("admin_audit_log").insert({
      admin_id: event.adminId,
      action: event.action,
      entity_type: event.targetType,
      entity_id: event.targetId,
      details: event.metadata ?? {},
      ip_address: event.ipAddress ?? null,
    });

    if (error) {
      logger.error("Failed to record audit event", {
        action: event.action,
        error: error.message,
      });
      throw new AppError("INTERNAL_ERROR", "Failed to record audit event");
    }
  } catch (err) {
    // Audit failure should not crash the main operation, but must be logged
    logger.error("Audit log recording failed", {
      action: event.action,
      error: String(err),
    });
  }
}

/**
 * List audit log entries with cursor pagination and filtering.
 */
export async function listAuditLogs(
  filters: AuditLogFilters = {},
): Promise<AuditLogResult> {
  const adminClient = createAdminClient();
  const limit = Math.min(filters.limit ?? DEFAULT_PAGE_SIZE, 100);
  const cursor = filters.cursor;

  let query = adminClient
    .from("admin_audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1); // Fetch one extra to determine hasMore

  // Apply filters
  if (filters.adminId) {
    query = query.eq("admin_id", filters.adminId);
  }
  if (filters.action) {
    query = query.eq("action", filters.action);
  }
  if (filters.targetType) {
    query = query.eq("entity_type", filters.targetType);
  }
  if (filters.startDate) {
    query = query.gte("created_at", filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte("created_at", filters.endDate);
  }

  // Cursor pagination
  if (cursor) {
    // Cursor format: timestamp_id
    const [cursorTime, cursorId] = cursor.split("_");
    if (cursorTime && cursorId) {
      query = query.or(
        `created_at.lt.${cursorTime},and(created_at.eq.${cursorTime},id.lt.${cursorId})`,
      );
    }
  }

  const { data, error } = await query;

  if (error) {
    logger.error("Failed to list audit logs", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to list audit logs");
  }

  const items = (data ?? []).slice(0, limit);
  const hasMore = (data ?? []).length > limit;
  const lastItem = items[items.length - 1];

  const nextCursor =
    hasMore && lastItem
      ? `${lastItem.created_at}_${lastItem.id}`
      : null;

  return {
    items: items.map(formatAuditEntry),
    nextCursor,
    hasMore,
  };
}

/**
 * Get audit logs for a specific target.
 */
export async function getAuditLogsForTarget(
  targetType: AuditTargetType,
  targetId: string,
  limit = 20,
): Promise<AuditLogEntry[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("admin_audit_log")
    .select("*")
    .eq("entity_type", targetType)
    .eq("entity_id", targetId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logger.error("Failed to get audit logs for target", {
      targetType,
      targetId,
      error: error.message,
    });
    throw new AppError("INTERNAL_ERROR", "Failed to get audit logs");
  }

  return (data ?? []).map(formatAuditEntry);
}

function formatAuditEntry(raw: Record<string, unknown>): AuditLogEntry {
  return {
    id: raw.id as string,
    adminId: raw.admin_id as string,
    action: raw.action as AuditAction,
    targetType: raw.entity_type as AuditTargetType,
    targetId: raw.entity_id as string,
    metadata: (raw.details as Record<string, unknown>) ?? {},
    ipAddress: raw.ip_address as string | undefined,
    createdAt: raw.created_at as string,
  };
}

/**
 * Get aggregated audit summary (counts by action type).
 */
export async function getAuditSummary(
  startDate: string,
  endDate: string,
): Promise<Record<string, number>> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("admin_audit_log")
    .select("action", { count: "exact", head: false })
    .gte("created_at", startDate)
    .lte("created_at", endDate);

  if (error) {
    logger.error("Failed to get audit summary", { error: error.message });
    return {};
  }

  const summary: Record<string, number> = {};
  for (const row of data ?? []) {
    const action = row.action as string;
    summary[action] = (summary[action] ?? 0) + 1;
  }

  return summary;
}
