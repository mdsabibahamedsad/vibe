/**
 * Report Management Service.
 *
 * Handles report lifecycle: creation, assignment, review, resolution, escalation.
 * All moderation operations must use server-side authorization checks.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { AppError, authorizationError, notFoundError } from "@/lib/errors";
import { can, Permissions, type Permission } from "./permissions";
import { recordAuditEvent } from "./audit.service";

export type ReportStatus = "pending" | "reviewing" | "resolved" | "dismissed" | "escalated";
export type ReportPriority = "low" | "normal" | "high" | "critical";
export type ReportReason =
  | "spam"
  | "harassment"
  | "nudity"
  | "hate_speech"
  | "violence"
  | "impersonation"
  | "copyright"
  | "other"
  | "minor_safety"
  | "self_harm"
  | "illegal_activity"
  | "privacy"
  | "scam";

export interface Report {
  id: string;
  reporterId: string;
  reportedUserId: string | null;
  reportedPostId: string | null;
  reportedStoryId: string | null;
  reportedMediaId: string | null;
  reportedMessageId: string | null;
  reportedCommentId: string | null;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  priority: ReportPriority;
  assignedTo: string | null;
  assignedAt: string | null;
  escalatedTo: string | null;
  escalatedAt: string | null;
  escalationReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  duplicateGroupId: string | null;
  createdAt: string;
}

export interface ReportFilters {
  status?: ReportStatus;
  priority?: ReportPriority;
  reason?: ReportReason;
  assignedTo?: string;
  targetType?: "user" | "post" | "story" | "message" | "media" | "comment";
  startDate?: string;
  endDate?: string;
  cursor?: string;
  limit?: number;
}

export interface ReportResult {
  items: Report[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

const DEFAULT_PAGE_SIZE = 25;

// ============================================================================
// PERMISSION CHECKS
// ============================================================================

async function requirePermission(role: string, permission: Permission): Promise<void> {
  if (!(await can(role, permission))) {
    throw authorizationError("Insufficient permissions");
  }
}

// ============================================================================
// REPORT QUERIES
// ============================================================================

/**
 * List reports with cursor pagination and filtering.
 */
export async function listReports(
  role: string,
  filters: ReportFilters = {},
): Promise<ReportResult> {
  await requirePermission(role, Permissions.REPORTS_VIEW);

  const adminClient = createAdminClient();
  const limit = Math.min(filters.limit ?? DEFAULT_PAGE_SIZE, 100);

  let query = adminClient
    .from("reports")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.priority) {
    query = query.eq("priority", filters.priority);
  }
  if (filters.reason) {
    query = query.eq("reason", filters.reason);
  }
  if (filters.assignedTo) {
    query = query.eq("assigned_to", filters.assignedTo);
  }
  if (filters.startDate) {
    query = query.gte("created_at", filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte("created_at", filters.endDate);
  }

  // Target type filter
  if (filters.targetType) {
    switch (filters.targetType) {
      case "user":
        query = query.not("reported_user_id", "is", null);
        break;
      case "post":
        query = query.not("reported_post_id", "is", null);
        break;
      case "story":
        query = query.not("reported_story_id", "is", null);
        break;
      case "message":
        query = query.not("reported_message_id", "is", null);
        break;
      case "media":
        query = query.not("reported_media_id", "is", null);
        break;
      case "comment":
        query = query.not("reported_comment_id", "is", null);
        break;
    }
  }

  // Cursor pagination
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
    logger.error("Failed to list reports", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to list reports");
  }

  const items = (data ?? []).slice(0, limit);
  const hasMore = (data ?? []).length > limit;
  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? `${lastItem.created_at}_${lastItem.id}`
      : null;

  return {
    items: items.map(formatReport),
    nextCursor,
    hasMore,
    total: count ?? 0,
  };
}

/**
 * Get a single report by ID.
 */
export async function getReport(
  role: string,
  reportId: string,
): Promise<Report> {
  await requirePermission(role, Permissions.REPORTS_VIEW);

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .single();

  if (error || !data) {
    throw notFoundError("Report not found");
  }

  return formatReport(data);
}

/**
 * Assign a report to a moderator.
 */
export async function assignReport(
  adminId: string,
  role: string,
  reportId: string,
  assignToUserId: string,
): Promise<void> {
  await requirePermission(role, Permissions.REPORTS_ASSIGN);

  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("reports")
    .update({
      assigned_to: assignToUserId,
      assigned_at: new Date().toISOString(),
      status: "reviewing",
    })
    .eq("id", reportId)
    .eq("status", "pending");

  if (error) {
    logger.error("Failed to assign report", { reportId, error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to assign report");
  }

  await recordAuditEvent({
    adminId,
    action: "report_assigned",
    targetType: "report",
    targetId: reportId,
    metadata: { assignedTo: assignToUserId },
  });
}

/**
 * Resolve a report.
 */
export async function resolveReport(
  adminId: string,
  role: string,
  reportId: string,
  resolution: {
    status: "resolved" | "dismissed";
    note?: string;
  },
): Promise<void> {
  await requirePermission(role, Permissions.REPORTS_RESOLVE);

  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("reports")
    .update({
      status: resolution.status,
      resolved_by: adminId,
      resolved_at: new Date().toISOString(),
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      resolution_note: resolution.note ?? null,
    })
    .eq("id", reportId)
    .in("status", ["pending", "reviewing"]);

  if (error) {
    logger.error("Failed to resolve report", { reportId, error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to resolve report");
  }

  await recordAuditEvent({
    adminId,
    action: resolution.status === "resolved" ? "user_warned" : "report_viewed",
    targetType: "report",
    targetId: reportId,
    metadata: { resolution: resolution.status, note: resolution.note },
  });
}

/**
 * Escalate a report to a higher authority.
 */
export async function escalateReport(
  adminId: string,
  role: string,
  reportId: string,
  escalateToUserId: string,
  reason: string,
): Promise<void> {
  await requirePermission(role, Permissions.REPORTS_VIEW);

  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("reports")
    .update({
      status: "escalated",
      escalated_to: escalateToUserId,
      escalated_at: new Date().toISOString(),
      escalation_reason: reason,
    })
    .eq("id", reportId);

  if (error) {
    logger.error("Failed to escalate report", { reportId, error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to escalate report");
  }

  await recordAuditEvent({
    adminId,
    action: "escalation",
    targetType: "report",
    targetId: reportId,
    metadata: { escalatedTo: escalateToUserId, reason },
  });
}

/**
 * Get reports grouped by target (for duplicate detection).
 */
export async function getReportsForTarget(
  role: string,
  targetType: "user" | "post" | "story" | "message" | "media" | "comment",
  targetId: string,
): Promise<Report[]> {
  await requirePermission(role, Permissions.REPORTS_VIEW);

  const adminClient = createAdminClient();
  const columnMap: Record<string, string> = {
    user: "reported_user_id",
    post: "reported_post_id",
    story: "reported_story_id",
    message: "reported_message_id",
    media: "reported_media_id",
    comment: "reported_comment_id",
  };

  const column = columnMap[targetType];
  if (!column) throw new AppError("VALIDATION_ERROR", "Invalid target type");

  const { data, error } = await adminClient
    .from("reports")
    .select("*")
    .eq(column, targetId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Failed to get reports for target", { targetType, targetId });
    throw new AppError("INTERNAL_ERROR", "Failed to get reports");
  }

  return (data ?? []).map(formatReport);
}

// ============================================================================
// HELPERS
// ============================================================================

function formatReport(raw: Record<string, unknown>): Report {
  return {
    id: raw.id as string,
    reporterId: raw.reporter_id as string,
    reportedUserId: (raw.reported_user_id as string) ?? null,
    reportedPostId: (raw.reported_post_id as string) ?? null,
    reportedStoryId: (raw.reported_story_id as string) ?? null,
    reportedMediaId: (raw.reported_media_id as string) ?? null,
    reportedMessageId: (raw.reported_message_id as string) ?? null,
    reportedCommentId: (raw.reported_comment_id as string) ?? null,
    reason: raw.reason as ReportReason,
    details: (raw.details as string) ?? null,
    status: (raw.status as ReportStatus) ?? "pending",
    priority: (raw.priority as ReportPriority) ?? "normal",
    assignedTo: (raw.assigned_to as string) ?? null,
    assignedAt: (raw.assigned_at as string) ?? null,
    escalatedTo: (raw.escalated_to as string) ?? null,
    escalatedAt: (raw.escalated_at as string) ?? null,
    escalationReason: (raw.escalation_reason as string) ?? null,
    reviewedBy: (raw.reviewed_by as string) ?? null,
    reviewedAt: (raw.reviewed_at as string) ?? null,
    resolvedBy: (raw.resolved_by as string) ?? null,
    resolvedAt: (raw.resolved_at as string) ?? null,
    resolutionNote: (raw.resolution_note as string) ?? null,
    duplicateGroupId: (raw.duplicate_group_id as string) ?? null,
    createdAt: raw.created_at as string,
  };
}
