/**
 * Dating action service — server-side operations for like, pass, super_like.
 *
 * @deprecated Use the unified match.service.ts (`processDatingAction()`)
 * instead. The functions here are preserved for reference but are no
 * longer called by the API routes — they have been replaced by the
 * atomic match-creation pipeline in features/matching/services/match.service.ts
 * which integrates match detection into every positive action.
 *
 * All new code should import from `@/features/matching/services/match.service`.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, notFoundError, authorizationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";
import { checkUserEligibility } from "./discovery.service";
import {
  DAILY_SUPER_LIKE_LIMIT,
  MAX_LIKES_PER_HOUR,
  MAX_PASSES_PER_HOUR,
  MAX_SUPER_LIKES_PER_HOUR,
} from "./constants";
import type { DatingActionInput, DatingActionResponse } from "./schemas";
import type { CurrentUser } from "@/lib/auth/get-current-user";
import { RateLimiter } from "@/lib/rate-limiter";

// ─── Rate Limiters ───────────────────────────────────────────────────────

const likeRateLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: MAX_LIKES_PER_HOUR,
  name: "dating_like",
});

const passRateLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: MAX_PASSES_PER_HOUR,
  name: "dating_pass",
});

const superLikeRateLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: MAX_SUPER_LIKES_PER_HOUR,
  name: "dating_super_like",
});

// ─── Like Candidate ──────────────────────────────────────────────────────

/**
 * Like a candidate.
 *
 * Requirements:
 *  1. Authenticate user (caller-provided)
 *  2. Validate candidate exists and is eligible
 *  3. Verify candidate is not blocked
 *  4. Prevent self-target
 *  5. Create/update dating action (upsert)
 *  6. Record analytics
 *  7. Return action result
 *
 * Does NOT check for mutual likes or create a match.
 */
export async function likeCandidate(
  actorUserId: string,
  targetUserId: string,
): Promise<DatingActionResponse> {
  return performDatingAction(actorUserId, targetUserId, "like", likeRateLimiter);
}

// ─── Pass Candidate ──────────────────────────────────────────────────────

/**
 * Pass on a candidate.
 *
 * A passed candidate is excluded from future discovery.
 */
export async function passCandidate(
  actorUserId: string,
  targetUserId: string,
): Promise<DatingActionResponse> {
  return performDatingAction(actorUserId, targetUserId, "pass", passRateLimiter);
}

// ─── Super Like Candidate ────────────────────────────────────────────────

/**
 * Super Like a candidate.
 *
 * Enforces daily and hourly limits for free tier.
 * Premium increases will be handled later.
 */
export async function superLikeCandidate(
  actorUserId: string,
  targetUserId: string,
): Promise<DatingActionResponse> {
  // Check daily super like limit
  const dailyCount = await getDailySuperLikeCount(actorUserId);

  if (dailyCount >= DAILY_SUPER_LIKE_LIMIT) {
    throw new AppError(
      "RATE_LIMITED",
      `Daily super like limit reached (${DAILY_SUPER_LIKE_LIMIT}). Upgrade to Premium for more.`,
      { statusCode: 429 },
    );
  }

  return performDatingAction(
    actorUserId,
    targetUserId,
    "super_like",
    superLikeRateLimiter,
  );
}

// ─── Perform Dating Action (Shared Logic) ────────────────────────────────

/**
 * Core dating action execution.
 *
 * Validates the target and performs the action with proper
 * rate limiting and analytics tracking.
 */
async function performDatingAction(
  actorUserId: string,
  targetUserId: string,
  action: "like" | "pass" | "super_like",
  rateLimiter: RateLimiter,
): Promise<DatingActionResponse> {
  // ─── Self-target prevention ─────────────────────────────────────────
  if (actorUserId === targetUserId) {
    throw new AppError("VALIDATION_ERROR", "You cannot perform dating actions on yourself", {
      statusCode: 400,
    });
  }

  // ─── Rate limiting ──────────────────────────────────────────────────
  await rateLimiter.enforce(actorUserId);

  // ─── Target validation ──────────────────────────────────────────────
  const adminClient = createAdminClient();

  // Check target exists, is active, not banned
  const { data: targetUser } = await adminClient
    .from("users")
    .select("id, is_active, is_banned")
    .eq("id", targetUserId)
    .single();

  if (!targetUser) {
    throw notFoundError("User not found");
  }

  if (!targetUser.is_active || targetUser.is_banned) {
    throw new AppError("VALIDATION_ERROR", "Cannot interact with this user", {
      statusCode: 400,
    });
  }

  // ─── Check block (mutual) ───────────────────────────────────────────
  const { count: blockCount } = await adminClient
    .from("blocks")
    .select("*", { count: "exact", head: true })
    .or(
      `and(blocker_id.eq.${actorUserId},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${actorUserId})`,
    );

  if ((blockCount ?? 0) > 0) {
    throw authorizationError("Cannot perform this action due to block");
  }

  // ─── Actor eligibility check ────────────────────────────────────────
  const eligibility = await checkUserEligibility(actorUserId);

  if (!eligibility.eligible) {
    throw new AppError("VALIDATION_ERROR", "Your account is not eligible for dating actions", {
      statusCode: 400,
    });
  }

  // ─── Upsert the dating action ───────────────────────────────────────
  // The UNIQUE(actor_id, target_id) constraint ensures only one action per pair.
  // We use upsert to handle changes (e.g., pass → like).
  const { error: upsertError } = await adminClient.from("dating_actions").upsert(
    {
      actor_id: actorUserId,
      target_id: targetUserId,
      action,
    },
    { onConflict: "actor_id, target_id" },
  );

  if (upsertError) {
    logger.error("Failed to perform dating action", {
      error: upsertError.message,
      action,
    });
    throw new AppError("INTERNAL_ERROR", "Failed to perform action", {
      statusCode: 500,
    });
  }

  // ─── Track analytics ────────────────────────────────────────────────
  const eventName =
    action === "super_like" ? "candidate_super_liked" :
    action === "like" ? "candidate_liked" :
    "candidate_passed";

  await trackEvent(actorUserId, eventName, "user", targetUserId, {
    action,
  });

  return {
    success: true,
    action,
    targetUserId,
    isNew: true, // Upsert always "succeeds" — actual new/update detection is for future
  };
}

// ─── Daily Super Like Counter ───────────────────────────────────────────

/**
 * Count how many super likes the user has used today.
 */
async function getDailySuperLikeCount(userId: string): Promise<number> {
  const adminClient = createAdminClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count } = await adminClient
    .from("dating_actions")
    .select("*", { count: "exact", head: true })
    .eq("actor_id", userId)
    .eq("action", "super_like")
    .gte("created_at", today.toISOString());

  return count ?? 0;
}

// ─── Get Action Status ──────────────────────────────────────────────────

/**
 * Get the current dating action between two users, if any.
 */
export async function getDatingAction(
  actorUserId: string,
  targetUserId: string,
): Promise<{ action: string | null; createdAt: string | null }> {
  const adminClient = createAdminClient();

  const { data } = await adminClient
    .from("dating_actions")
    .select("action, created_at")
    .eq("actor_id", actorUserId)
    .eq("target_id", targetUserId)
    .single();

  return {
    action: data?.action ?? null,
    createdAt: data?.created_at ?? null,
  };
}
