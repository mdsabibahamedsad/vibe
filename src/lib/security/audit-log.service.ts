/**
 * Audit Log Service
 *
 * Records sensitive operations for security and compliance.
 * Logs are tamper-resistant (append-only from application code)
 * and are never exposed to ordinary users.
 *
 * The following operations MUST be audited:
 *  - Admin actions (user management, moderation, payments)
 *  - Permission changes
 *  - Moderation actions
 *  - Payment adjustments / refunds
 *  - Payout decisions
 *  - Verification decisions
 *  - Data exports
 *  - Account deletion
 *  - Security settings changes
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/** Categories of auditable actions */
export type AuditActionCategory =
  | "admin"
  | "auth"
  | "moderation"
  | "payment"
  | "payout"
  | "verification"
  | "data_export"
  | "account_deletion"
  | "security"
  | "feature_flag"
  | "support";

/** Severity levels */
export type AuditSeverity = "info" | "warning" | "critical";

/** Structure of an audit log entry */
export interface AuditLogEntry {
  id?: string;
  /** The user who performed the action */
  actor_id: string;
  /** The user who was acted upon (if applicable) */
  target_user_id?: string | null;
  /** Action category */
  category: AuditActionCategory;
  /** Action name (e.g., "user_banned", "payment_refunded") */
  action: string;
  /** Human-readable description */
  description: string;
  /** Severity level */
  severity: AuditSeverity;
  /** The IP address from which the action was performed */
  ip_address?: string | null;
  /** Request ID for correlation */
  request_id?: string | null;
  /** Additional context (no sensitive data) */
  metadata?: Record<string, unknown>;
  /** Previous state (for changes) */
  previous_state?: Record<string, unknown> | null;
  /** New state (for changes) */
  new_state?: Record<string, unknown> | null;
  created_at?: string;
}

/**
 * Record an audit log entry.
 *
 * Uses the admin client (service_role) to bypass RLS.
 * This ensures logs are always written regardless of user session state.
 * The admin client is only used server-side.
 */
export async function recordAuditLogEntry(
  entry: AuditLogEntry,
): Promise<string | null> {
  try {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("admin_audit_log")
      .insert({
        admin_id: entry.actor_id,
        action: `${entry.category}:${entry.action}`,
        target_type: entry.target_user_id ? "user" : null,
        target_id: entry.target_user_id,
        details: {
          description: entry.description,
          severity: entry.severity,
          request_id: entry.request_id,
          ip_address: entry.ip_address,
          previous_state: entry.previous_state,
          new_state: entry.new_state,
          ...entry.metadata,
        },
      })
      .select("id")
      .single();

    if (error) {
      logger.error("Failed to write audit log entry", {
        error: error.message,
        category: entry.category,
        action: entry.action,
      });
      return null;
    }

    return data.id;
  } catch (err) {
    // Audit log failure must never crash the application
    logger.error("Audit log write exception", {
      error: err instanceof Error ? err.message : "Unknown",
      category: entry.category,
      action: entry.action,
    });
    return null;
  }
}

/**
 * Convenience wrapper — records an audit entry and returns a log function
 * for chaining additional context or timing.
 */
export function createAuditLogger(actorId: string, requestId?: string) {
  return {
    log: async (
      category: AuditActionCategory,
      action: string,
      description: string,
      options?: {
        severity?: AuditSeverity;
        targetUserId?: string;
        ipAddress?: string;
        metadata?: Record<string, unknown>;
        previousState?: Record<string, unknown> | null;
        newState?: Record<string, unknown> | null;
      },
    ): Promise<string | null> => {
      return recordAuditLogEntry({
        actor_id: actorId,
        target_user_id: options?.targetUserId,
        category,
        action,
        description,
        severity: options?.severity ?? "info",
        ip_address: options?.ipAddress,
        request_id: requestId,
        metadata: options?.metadata,
        previous_state: options?.previousState,
        new_state: options?.newState,
      });
    },
  };
}

/**
 * Query audit log entries (admin-only).
 */
export async function queryAuditLog(
  options: {
    actorId?: string;
    targetUserId?: string;
    category?: AuditActionCategory;
    severity?: AuditSeverity;
    limit?: number;
    offset?: number;
    fromDate?: string;
    toDate?: string;
  } = {},
): Promise<{ entries: AuditLogEntry[]; total: number }> {
  try {
    const adminClient = createAdminClient();
    let query = adminClient
      .from("admin_audit_log")
      .select("*", { count: "exact" });

    if (options.actorId) {
      query = query.eq("admin_id", options.actorId);
    }
    if (options.targetUserId) {
      query = query.eq("target_id", options.targetUserId);
    }
    if (options.severity) {
      // Severity is stored in details->severity
      query = query.eq("details->>severity", options.severity);
    }
    if (options.fromDate) {
      query = query.gte("created_at", options.fromDate);
    }
    if (options.toDate) {
      query = query.lte("created_at", options.toDate);
    }

    const limit = Math.min(options.limit ?? 50, 200);
    const offset = options.offset ?? 0;

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error("Failed to query audit log", { error: error.message });
      return { entries: [], total: 0 };
    }

    return {
      entries: (data ?? []).map(mapAuditRow),
      total: count ?? 0,
    };
  } catch (err) {
    logger.error("Audit log query exception", {
      error: err instanceof Error ? err.message : "Unknown",
    });
    return { entries: [], total: 0 };
  }
}

function mapAuditRow(row: Record<string, unknown>): AuditLogEntry {
  const details = (row.details as Record<string, unknown>) ?? {};
  const actionStr = (row.action as string) ?? "admin:unknown";
  const parts = actionStr.split(":");
  const category = (parts[0] as AuditActionCategory) ?? "admin";
  const action = parts.slice(1).join(":") || "unknown";

  return {
    id: row.id as string,
    actor_id: row.admin_id as string,
    target_user_id: (row.target_id as string) ?? null,
    category,
    action,
    description: (details.description as string) ?? "",
    severity: (details.severity as AuditSeverity) ?? "info",
    ip_address: (details.ip_address as string) ?? null,
    request_id: (details.request_id as string) ?? null,
    metadata: details,
    created_at: row.created_at as string,
  };
}
