/**
 * Dead-Letter Queue (DLQ)
 *
 * Handles permanently failing background jobs. Admins can:
 *  - Inspect failed jobs and their error details
 *  - Retry jobs (with backoff)
 *  - Cancel/discard jobs
 *  - Resolve jobs (mark as resolved without retrying)
 *
 * Integration:
 *   Use `moveToDLQ()` when a job has exhausted its retry attempts.
 *   Use `getDLQEntries()` to inspect the queue.
 *   Use `retryFromDLQ()` to retry a job.
 *   Use `resolveFromDLQ()` to mark a job as resolved.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

export type DLQEntryStatus = "failed" | "resolved" | "discarded";

export interface DLQEntry {
  id: string;
  jobType: string;
  jobId: string;
  errorMessage: string;
  errorStack: string | null;
  status: DLQEntryStatus;
  retryCount: number;
  maxRetries: number;
  metadata: Record<string, unknown>;
  source: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface DLQListResult {
  items: DLQEntry[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Move a failed job to the dead-letter queue.
 */
export async function moveToDLQ(params: {
  jobType: string;
  jobId: string;
  errorMessage: string;
  errorStack?: string;
  retryCount: number;
  maxRetries: number;
  metadata?: Record<string, unknown>;
  source?: string;
}): Promise<string> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("dead_letter_queue")
    .insert({
      job_type: params.jobType,
      job_id: params.jobId,
      error_message: params.errorMessage,
      error_stack: params.errorStack ?? null,
      status: "failed",
      retry_count: params.retryCount,
      max_retries: params.maxRetries,
      metadata: params.metadata ?? {},
      source: params.source ?? "unknown",
    })
    .select("id")
    .single();

  if (error) {
    logger.error("Failed to move job to DLQ", {
      jobType: params.jobType,
      jobId: params.jobId,
      error: error.message,
    });

    // DLQ failure should not crash the application
    return "";
  }

  logger.warn("Job moved to dead-letter queue", {
    jobType: params.jobType,
    jobId: params.jobId,
    dlqId: data.id,
    retryCount: params.retryCount,
  });

  return data.id;
}

/**
 * List dead-letter queue entries with pagination.
 */
export async function getDLQEntries(params: {
  status?: DLQEntryStatus;
  jobType?: string;
  limit?: number;
  cursor?: string;
} = {}): Promise<DLQListResult> {
  const adminClient = createAdminClient();
  const limit = Math.min(params.limit ?? 25, 100);

  let query = adminClient
    .from("dead_letter_queue")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (params.status) {
    query = query.eq("status", params.status);
  }

  if (params.jobType) {
    query = query.eq("job_type", params.jobType);
  }

  if (params.cursor) {
    const [cursorTime, cursorId] = params.cursor.split("_");
    if (cursorTime && cursorId) {
      query = query.or(
        `created_at.lt.${cursorTime},and(created_at.eq.${cursorTime},id.lt.${cursorId})`,
      );
    }
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error("Failed to query DLQ", { error: error.message });
    return { items: [], total: 0, hasMore: false, nextCursor: null };
  }

  const items = (data ?? []).slice(0, limit);
  const hasMore = (data ?? []).length > limit;
  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? `${lastItem.created_at}_${lastItem.id}`
      : null;

  return {
    items: items.map(formatDLQEntry),
    total: count ?? 0,
    hasMore,
    nextCursor,
  };
}

/**
 * Retry a job from the dead-letter queue.
 * Updates status and returns the job details so the caller can re-execute.
 */
export async function retryFromDLQ(
  dlqId: string,
  adminUserId: string,
): Promise<DLQEntry | null> {
  const adminClient = createAdminClient();

  const { data: entry } = await adminClient
    .from("dead_letter_queue")
    .select("*")
    .eq("id", dlqId)
    .single();

  if (!entry) return null;
  if (entry.status !== "failed") {
    throw new AppError("VALIDATION_ERROR", "DLQ entry is not in failed state");
  }

  // Update status to allow retry
  const { error } = await adminClient
    .from("dead_letter_queue")
    .update({
      status: "resolved",
      resolved_by: adminUserId,
      resolved_at: new Date().toISOString(),
      metadata: {
        ...(entry.metadata as Record<string, unknown> ?? {}),
        retried_at: new Date().toISOString(),
        retried_by: adminUserId,
      },
    })
    .eq("id", dlqId);

  if (error) {
    logger.error("Failed to retry DLQ entry", {
      dlqId,
      error: error.message,
    });
    return null;
  }

  logger.info("Job retried from dead-letter queue", {
    dlqId,
    jobType: entry.job_type,
    adminUserId,
  });

  return formatDLQEntry(entry);
}

/**
 * Resolve (acknowledge without retrying) a DLQ entry.
 */
export async function resolveFromDLQ(
  dlqId: string,
  adminUserId: string,
): Promise<boolean> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("dead_letter_queue")
    .update({
      status: "resolved",
      resolved_by: adminUserId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", dlqId);

  if (error) {
    logger.error("Failed to resolve DLQ entry", {
      dlqId,
      error: error.message,
    });
    return false;
  }

  return true;
}

/**
 * Discard (permanently delete) a DLQ entry.
 */
export async function discardFromDLQ(
  dlqId: string,
  adminUserId: string,
): Promise<boolean> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("dead_letter_queue")
    .update({
      status: "discarded",
      resolved_by: adminUserId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", dlqId);

  if (error) {
    logger.error("Failed to discard DLQ entry", {
      dlqId,
      error: error.message,
    });
    return false;
  }

  return true;
}

/**
 * Get statistics about the dead-letter queue.
 */
export async function getDLQStats(): Promise<{
  total: number;
  failed: number;
  resolved: number;
  discarded: number;
  byType: Record<string, number>;
}> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("dead_letter_queue")
    .select("status, job_type");

  if (error || !data) {
    return { total: 0, failed: 0, resolved: 0, discarded: 0, byType: {} };
  }

  const byType: Record<string, number> = {};
  let failed = 0;
  let resolved = 0;
  let discarded = 0;

  for (const row of data) {
    const status = row.status as string;
    if (status === "failed") failed++;
    else if (status === "resolved") resolved++;
    else if (status === "discarded") discarded++;

    const type = row.job_type as string;
    byType[type] = (byType[type] ?? 0) + 1;
  }

  return {
    total: data.length,
    failed,
    resolved,
    discarded,
    byType,
  };
}

function formatDLQEntry(raw: Record<string, unknown>): DLQEntry {
  return {
    id: raw.id as string,
    jobType: raw.job_type as string,
    jobId: raw.job_id as string,
    errorMessage: raw.error_message as string,
    errorStack: (raw.error_stack as string) ?? null,
    status: (raw.status as DLQEntryStatus) ?? "failed",
    retryCount: (raw.retry_count as number) ?? 0,
    maxRetries: (raw.max_retries as number) ?? 3,
    metadata: (raw.metadata as Record<string, unknown>) ?? {},
    source: (raw.source as string) ?? "unknown",
    resolvedBy: (raw.resolved_by as string) ?? null,
    resolvedAt: (raw.resolved_at as string) ?? null,
    createdAt: raw.created_at as string,
  };
}
