/**
 * Trust Profile Service
 *
 * Manages the internal trust profile for each user account.
 * The raw trust score and internal tier are NEVER exposed to users.
 * Only derived, explainable trust indicators are shown (e.g., "Verified", "Recently active").
 *
 * Reuses existing infrastructure:
 *   - trust-profile.ts for existing trust levels
 *   - Moderation service for action recording
 *   - Report service for reporting history
 *   - Audit service for logging
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

export type VerificationLevel = "unverified" | "basic" | "verified" | "enhanced";
export type InternalTrustTier = "unknown" | "low" | "medium" | "high" | "trusted";
export type TrustBadge =
  | "verified_profile"
  | "verified_creator"
  | "established_account"
  | "recently_active"
  | "trusted_member"
  | "moderator";

export interface TrustProfileData {
  userId: string;
  accountAgeDays: number;
  accountAgeTier: string;
  verificationLevel: VerificationLevel;
  badges: TrustBadge[];
  internalTrustTier: InternalTrustTier;
  lastRecalculatedAt: string;
}

// ─── User-Facing Trust Indicators (safe to expose) ───────────────────────

export interface UserTrustIndicators {
  isVerified: boolean;
  isCreator: boolean;
  accountAgeTier: "new" | "established" | "trusted" | "senior";
  badges: TrustBadge[];
  verificationLevel: VerificationLevel;
  // Only include this when viewing one's own profile
  hasCompletedSafetyCheck?: boolean;
}

/**
 * Get user-facing trust indicators for a profile.
 * Internal trust score is NEVER exposed.
 */
export async function getUserTrustIndicators(
  userId: string,
  viewerId?: string,
): Promise<UserTrustIndicators> {
  const adminClient = createAdminClient();

  const { data: tp } = await adminClient
    .from("trust_profiles")
    .select("verification_level, account_age_tier, badges")
    .eq("user_id", userId)
    .single();

  if (!tp) {
    return {
      isVerified: false,
      isCreator: false,
      accountAgeTier: "new",
      badges: [],
      verificationLevel: "unverified",
    };
  }

  const badges: TrustBadge[] = tp.badges ?? [];

  return {
    isVerified: tp.verification_level === "verified" || tp.verification_level === "enhanced",
    isCreator: badges.includes("verified_creator"),
    accountAgeTier: tp.account_age_tier as UserTrustIndicators["accountAgeTier"],
    badges,
    verificationLevel: tp.verification_level as VerificationLevel,
    hasCompletedSafetyCheck: viewerId === userId ? true : undefined,
  };
}

// ─── Trust Profile Management (admin/system only) ─────────────────────────

/**
 * Initialize a trust profile for a new user.
 * Called during onboarding completion.
 */
export async function initializeTrustProfile(userId: string): Promise<void> {
  const adminClient = createAdminClient();

  const { error } = await adminClient.from("trust_profiles").upsert(
    {
      user_id: userId,
      account_age_days: 0,
      account_age_tier: "new",
      verification_level: "unverified",
      internal_trust_tier: "unknown",
      last_recalculated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    logger.error("Failed to initialize trust profile", { userId, error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to initialize trust profile");
  }
}

/**
 * Recalculate the internal trust tier for a user based on current signals.
 */
export async function recalculateTrustTier(userId: string): Promise<InternalTrustTier> {
  const adminClient = createAdminClient();

  // Get current signals
  const [
    trustProfile,
    { count: reportCount },
    { count: warningCount },
    { count: restrictionCount },
    { count: safetySignalCount },
    { count: scamSignalCount },
    { count: matchCount },
  ] = await Promise.all([
    adminClient.from("trust_profiles").select("*").eq("user_id", userId).single(),
    adminClient
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("reported_user_id", userId),
    adminClient
      .from("user_warnings")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_active", true),
    adminClient
      .from("user_restrictions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_active", true),
    adminClient
      .from("safety_signals")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId),
    adminClient
      .from("safety_signals")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("signal_type", [
        "romance_scam_pattern",
        "financial_scam_pattern",
        "phishing_link",
        "money_request_pattern",
      ]),
    adminClient
      .from("matches")
      .select("*", { count: "exact", head: true })
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .eq("status", "active"),
  ]);

  if (!trustProfile.data) {
    await initializeTrustProfile(userId);
    return "unknown";
  }

  const u = trustProfile.data;
  const totalReports = reportCount ?? 0;
  const activeWarnings = warningCount ?? 0;
  const activeRestrictions = restrictionCount ?? 0;
  const totalSignals = safetySignalCount ?? 0;
  const scamSignals = scamSignalCount ?? 0;
  const matches = matchCount ?? 0;

  // Compute score
  let score = 0;

  // Account age (up to 25 points)
  const accountAgeDays = u.account_age_days ?? 0;
  score += Math.min(accountAgeDays * 0.5, 25);

  // Account age tier
  const ageTier = accountAgeDays >= 365 ? "senior" : accountAgeDays >= 90 ? "trusted" : accountAgeDays >= 30 ? "established" : "new";

  // Verification (20 points)
  if (u.verification_level === "verified" || u.verification_level === "enhanced") {
    score += 20;
  }

  // Positive interactions (up to 15 points)
  score += Math.min(matches * 1.5, 15);

  // Reports received penalty
  score -= Math.min(totalReports * 5, 30);

  // Active warnings penalty
  score -= Math.min(activeWarnings * 10, 20);

  // Active restrictions penalty
  score -= Math.min(activeRestrictions * 15, 30);

  // Safety signals penalty
  score -= Math.min(totalSignals * 5, 25);

  // Strong scam signal penalty
  score -= Math.min(scamSignals * 10, 30);

  // Has been suspended/banned
  if (u.has_been_suspended) score -= 15;
  if (u.has_been_banned) score -= 25;

  // Determine tier
  const tier: InternalTrustTier = score >= 60 ? "trusted" : score >= 40 ? "high" : score >= 20 ? "medium" : "low";

  // Determine badges
  const badges: TrustBadge[] = [];
  if (u.verification_level === "verified" || u.verification_level === "enhanced") {
    badges.push("verified_profile");
  }
  if (accountAgeDays >= 365) {
    badges.push("established_account");
  }
  if (tier === "trusted" || tier === "high") {
    badges.push("recently_active");
  }

  // Update trust profile
  const { error } = await adminClient
    .from("trust_profiles")
    .update({
      account_age_tier: ageTier,
      internal_trust_tier: tier,
      badges,
      total_reports_received: totalReports,
      total_warnings: activeWarnings,
      total_restrictions: activeRestrictions,
      suspicious_flag_count: totalSignals,
      scam_signal_count: scamSignals,
      successful_matches: matches,
      last_recalculated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) {
    logger.error("Failed to update trust profile", { userId, error: error.message });
  }

  return tier;
}

// ─── Signal Recording ─────────────────────────────────────────────────────

export interface SafetySignalInput {
  userId: string;
  signalType: string;
  source: "ai_analysis" | "auto_detector" | "user_report" | "admin_review" | "system";
  confidence: number;
  severity: "low" | "medium" | "high" | "critical";
  metadata?: Record<string, unknown>;
}

/**
 * Record a safety signal for a user.
 * This is the primary way to log suspicious activity.
 * Signals contribute to the trust profile recalculation.
 */
export async function recordSafetySignal(input: SafetySignalInput): Promise<string> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("safety_signals")
    .insert({
      user_id: input.userId,
      signal_type: input.signalType,
      source: input.source,
      confidence: Math.min(Math.max(input.confidence, 0), 1),
      severity: input.severity,
      metadata: input.metadata ?? {},
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    logger.error("Failed to record safety signal", {
      userId: input.userId,
      signalType: input.signalType,
      error: error.message,
    });
    throw new AppError("INTERNAL_ERROR", "Failed to record safety signal");
  }

  // Update trust profile counters (fire-and-forget)
  try {
    await adminClient.rpc("recalculate_trust_tier", { p_user_id: input.userId });
  } catch {
    // Non-critical — trust recalculation will happen on next scheduled run
  }

  return data.id;
}

// ─── Admin: Get Trust Profile (full detail) ───────────────────────────────

export async function getFullTrustProfile(userId: string): Promise<TrustProfileData | null> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("trust_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  return {
    userId: data.user_id,
    accountAgeDays: data.account_age_days,
    accountAgeTier: data.account_age_tier,
    verificationLevel: data.verification_level,
    badges: data.badges ?? [],
    internalTrustTier: data.internal_trust_tier,
    lastRecalculatedAt: data.last_recalculated_at,
  };
}

// ─── Batch Recalculation (scheduled job) ──────────────────────────────────

/**
 * Recalculate trust tiers for all users.
 * This is an expensive operation and should be run as a scheduled job.
 */
export async function recalculateAllTrustTiers(): Promise<{ processed: number; errors: number }> {
  const adminClient = createAdminClient();

  const { data: userIds, error } = await adminClient
    .from("trust_profiles")
    .select("user_id");

  if (error || !userIds) {
    logger.error("Failed to fetch trust profiles for batch recalc", { error: error?.message });
    return { processed: 0, errors: 0 };
  }

  let processed = 0;
  let errors = 0;

  for (const row of userIds) {
    try {
      await recalculateTrustTier(row.user_id);
      processed++;
    } catch (err) {
      logger.error("Batch trust recalculation error", {
        userId: row.user_id,
        error: String(err),
      });
      errors++;
    }

    // Small delay to avoid overwhelming the database
    if (processed % 50 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  logger.info("Batch trust recalculation complete", { processed, errors });
  return { processed, errors };
}

// ─── Trust Signals for Recommendations ────────────────────────────────────

/**
 * Get trust-adjusted score for recommendation ranking.
 * Returns a multiplier (0.0–1.0) applied to recommendation scores.
 *
 * - Trusted users get 1.0 (no adjustment)
 * - High trust gets 1.0
 * - Medium trust gets 0.9
 * - Low trust gets 0.5
 * - Unknown gets 0.7
 */
export async function getTrustMultiplierForRecommendation(userId: string): Promise<number> {
  const adminClient = createAdminClient();

  const { data } = await adminClient
    .from("trust_profiles")
    .select("internal_trust_tier")
    .eq("user_id", userId)
    .single();

  if (!data) return 0.7;

  switch (data.internal_trust_tier) {
    case "trusted":
      return 1.0;
    case "high":
      return 1.0;
    case "medium":
      return 0.9;
    case "low":
      return 0.5;
    default:
      return 0.7;
  }
}
