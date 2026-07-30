/**
 * Review Lock Service.
 *
 * Prevents two moderators from processing the same report or case simultaneously.
 * Locks are short-lived (30 min default) and auto-expire.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { AppError, authorizationError } from "@/lib/errors";
import { can, Permissions } from "./permissions";

const LOCK_DURATION_MINUTES = 30;

export interface ReviewLock {
  id: string;
  lockedBy: string;
  lockedByName?: string;
  targetType: "report" | "case";
  targetId: string;
  lockedAt: string;
  expiresAt: string;
}

/**
 * Acquire a review lock.
 * Throws if the lock is already held by someone else and hasn't expired.
 */
export async function acquireLock(
  userId: string,
  role: string,
  targetType: "report" | "case",
  targetId: string,
): Promise<void> {
  if (!(await can(role, Permissions.REPORTS_VIEW))) {
    throw authorizationError("Insufficient permissions");
  }

  const adminClient = createAdminClient();

  // Check existing lock
  const { data: existing } = await adminClient
    .from("review_locks")
    .select("*")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .single();

  if (existing) {
    const expiresAt = new Date(existing.expires_at).getTime();
    const now = Date.now();

    if (now < expiresAt && existing.locked_by !== userId) {
      // Lock is held by someone else
      const { data: locker } = await adminClient
        .from("users")
        .select("display_name")
        .eq("id", existing.locked_by)
        .single();

      throw new AppError(
        "CONFLICT",
        `This ${targetType} is currently being reviewed by ${locker?.display_name ?? "another moderator"}. Please try again later.`,
        { statusCode: 409 },
      );
    }

    // Lock is expired or owned by this user — update it
    const { error: updateError } = await adminClient
      .from("review_locks")
      .update({
        locked_by: userId,
        locked_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000).toISOString(),
      })
      .eq("target_type", targetType)
      .eq("target_id", targetId);

    if (updateError) {
      logger.error("Failed to update review lock", { targetType, targetId, error: updateError.message });
      throw new AppError("INTERNAL_ERROR", "Failed to acquire review lock");
    }

    return;
  }

  // Create new lock
  const { error } = await adminClient.from("review_locks").insert({
    locked_by: userId,
    target_type: targetType,
    target_id: targetId,
    locked_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000).toISOString(),
  });

  if (error) {
    logger.error("Failed to create review lock", { targetType, targetId, error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to acquire review lock");
  }
}

/**
 * Release a review lock.
 */
export async function releaseLock(
  userId: string,
  role: string,
  targetType: "report" | "case",
  targetId: string,
): Promise<void> {
  if (!(await can(role, Permissions.REPORTS_VIEW))) {
    throw authorizationError("Insufficient permissions");
  }

  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("review_locks")
    .delete()
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("locked_by", userId);

  if (error) {
    logger.error("Failed to release review lock", { targetType, targetId, error: error.message });
  }
}

/**
 * Get the current lock status for a target.
 */
export async function getLock(
  targetType: "report" | "case",
  targetId: string,
): Promise<ReviewLock | null> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("review_locks")
    .select("*, users!review_locks_locked_by_fkey(display_name)")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id as string,
    lockedBy: data.locked_by as string,
    lockedByName: (data.users as any)?.display_name as string | undefined,
    targetType: data.target_type as "report" | "case",
    targetId: data.target_id as string,
    lockedAt: data.locked_at as string,
    expiresAt: data.expires_at as string,
  };
}
