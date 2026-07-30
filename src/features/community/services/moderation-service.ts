import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ModerationReport, CreateReportInput } from "../types";

export async function reportContent(input: CreateReportInput): Promise<ModerationReport> {
  const adminClient = createAdminClient();
  const user = await getCurrentUser();

  if (!input.reportedUserId && !input.reportedPostId && !input.reportedMessageId) {
    throw new AppError("VALIDATION_ERROR", "Must specify a user, post, or message to report", {
      statusCode: 400,
    });
  }

  const { data: existing } = await adminClient
    .from("reports")
    .select("id")
    .eq("reporter_id", user.id)
    .eq("reason", input.reason)
    .in("status", ["pending", "reviewing"])
    .maybeSingle();

  if (input.reportedPostId && existing) {
    throw new AppError("VALIDATION_ERROR", "You have already reported this content", {
      statusCode: 409,
    });
  }

  const { data, error } = await adminClient
    .from("reports")
    .insert({
      reporter_id: user.id,
      reported_user_id: input.reportedUserId ?? null,
      reported_post_id: input.reportedPostId ?? null,
      reported_message_id: input.reportedMessageId ?? null,
      reason: input.reason,
      details: input.details ?? null,
    })
    .select()
    .single();

  if (error) {
    logger.error("Failed to create report", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to submit report", { statusCode: 500 });
  }

  return mapReport(data);
}

export async function getReports(
  params: { status?: string; cursor?: string; limit?: number } = {},
): Promise<{ reports: ModerationReport[]; hasMore: boolean }> {
  const adminClient = createAdminClient();

  const { status, cursor, limit = 20 } = params;

  let query = adminClient
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (status) query = query.eq("status", status);
  if (cursor) query = query.lt("created_at", cursor);

  const { data, error } = await query;

  if (error) {
    logger.error("Failed to fetch reports", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to load reports", { statusCode: 500 });
  }

  const hasMore = (data?.length ?? 0) > limit;
  const reports = ((data ?? []).slice(0, limit)).map(mapReport);

  return { reports, hasMore };
}

export async function reviewReport(
  reportId: string,
  action: string,
  resolution: string,
): Promise<void> {
  const adminClient = createAdminClient();
  const user = await getCurrentUser();

  const { error } = await adminClient
    .from("reports")
    .update({
      status: "resolved",
      reviewed_by: user.id,
      details: `${action}: ${resolution}`,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reportId);

  if (error) {
    logger.error("Failed to review report", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to review report", { statusCode: 500 });
  }
}

export async function dismissReport(reportId: string): Promise<void> {
  const adminClient = createAdminClient();
  const user = await getCurrentUser();

  const { error } = await adminClient
    .from("reports")
    .update({
      status: "dismissed",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reportId);

  if (error) {
    logger.error("Failed to dismiss report", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to dismiss report", { statusCode: 500 });
  }
}

export async function getReportCount(status?: string): Promise<number> {
  const adminClient = createAdminClient();

  let query = adminClient
    .from("reports")
    .select("*", { count: "exact", head: true });

  if (status) query = query.eq("status", status);

  const { count, error } = await query;

  if (error) {
    logger.error("Failed to count reports", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to count reports", { statusCode: 500 });
  }

  return count ?? 0;
}

function mapReport(data: Record<string, unknown>): ModerationReport {
  return {
    id: data.id as string,
    reporterId: data.reporter_id as string,
    reportedUserId: data.reported_user_id as string | null,
    reportedPostId: data.reported_post_id as string | null,
    reportedMessageId: data.reported_message_id as string | null,
    reason: data.reason as string,
    details: data.details as string | null,
    status: data.status as ModerationReport["status"],
    reviewedBy: data.reviewed_by as string | null,
    reviewedAt: data.reviewed_at as string | null,
    createdAt: data.created_at as string,
  };
}
