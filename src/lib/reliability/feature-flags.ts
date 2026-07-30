/**
 * Feature Flags Service
 *
 * Enables safe releases through:
 *  - Internal testing (user IDs/roles)
 *  - Percentage-based rollouts
 *  - Region-based rollouts
 *  - User cohort rollouts
 *  - Emergency kill switch
 *
 * Reuses the existing `feature_flags` database table.
 * Flags are cached in memory with TTL to avoid DB load on every check.
 *
 * NEVER cache feature flags that control authorization or access control
 * without strict invalidation. A stale cache must never allow unauthorized access.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export type FlagTargetType =
  | "percentage"
  | "user_ids"
  | "roles"
  | "regions"
  | "cohort";

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  targetType: FlagTargetType | null;
  targetValue: string | null;
  description: string | null;
}

interface CachedFlag {
  flag: FeatureFlag;
  loadedAt: number;
}

const CACHE_TTL_MS = 30 * 1000; // 30 seconds
const flagCache = new Map<string, CachedFlag>();

/**
 * Check if a feature flag is enabled for a specific user.
 * Returns false by default if the flag doesn't exist.
 */
export async function isFlagEnabled(
  flagKey: string,
  context?: {
    userId?: string;
    role?: string;
    region?: string;
    cohort?: string;
  },
): Promise<boolean> {
  const flag = await getFlag(flagKey);
  if (!flag) return false;
  if (!flag.enabled) return false;

  // No targeting — enabled for everyone
  if (!flag.targetType || !flag.targetValue) return true;

  return evaluateTargeting(flag, context);
}

/**
 * Get the raw feature flag, with caching.
 */
async function getFlag(flagKey: string): Promise<FeatureFlag | null> {
  const now = Date.now();
  const cached = flagCache.get(flagKey);

  if (cached && now - cached.loadedAt < CACHE_TTL_MS) {
    return cached.flag;
  }

  try {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("feature_flags")
      .select("key, enabled, target_type, target_value, description")
      .eq("key", flagKey)
      .maybeSingle();

    if (error || !data) {
      // Cache the miss briefly to avoid thundering herd
      flagCache.set(flagKey, {
        flag: { key: flagKey, enabled: false, targetType: null, targetValue: null, description: null },
        loadedAt: now,
      });
      return null;
    }

    const flag: FeatureFlag = {
      key: data.key,
      enabled: data.enabled,
      targetType: data.target_type as FlagTargetType | null,
      targetValue: data.target_value as string | null,
      description: data.description,
    };

    flagCache.set(flagKey, { flag, loadedAt: now });
    return flag;
  } catch (err) {
    logger.error("Failed to fetch feature flag", {
      flagKey,
      error: String(err),
    });
    // Don't crash — return false (safe default)
    return null;
  }
}

/**
 * Evaluate targeting logic for a flag.
 */
function evaluateTargeting(
  flag: FeatureFlag,
  context?: { userId?: string; role?: string; region?: string; cohort?: string },
): boolean {
  if (!flag.targetType || !flag.targetValue) return true;

  switch (flag.targetType) {
    case "percentage": {
      const pct = parseInt(flag.targetValue, 10);
      if (isNaN(pct) || !context?.userId) return false;
      // Deterministic hash of user ID for consistent percentage rollout
      // Use >>> 0 to guard against Math.abs(Integer.MIN_VALUE) overflow
      const hash = simpleHash(context.userId);
      const bucket = (Math.abs(hash) >>> 0) % 100;
      return bucket < pct;
    }

    case "user_ids": {
      if (!context?.userId) return false;
      const userIds = flag.targetValue.split(",").map((s) => s.trim());
      return userIds.includes(context.userId);
    }

    case "roles": {
      if (!context?.role) return false;
      const roles = flag.targetValue.split(",").map((s) => s.trim().toLowerCase());
      return roles.includes(context.role.toLowerCase());
    }

    case "regions": {
      if (!context?.region) return false;
      const regions = flag.targetValue.split(",").map((s) => s.trim().toLowerCase());
      return regions.includes(context.region.toLowerCase());
    }

    case "cohort": {
      if (!context?.cohort) return false;
      const cohorts = flag.targetValue.split(",").map((s) => s.trim().toLowerCase());
      return cohorts.includes(context.cohort.toLowerCase());
    }

    default:
      return false;
  }
}

/**
 * Emergency kill switch — immediately disables a feature.
 * Bypasses cache by invalidating before checking.
 */
export async function emergencyKill(flagKey: string): Promise<boolean> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("feature_flags")
    .upsert({
      key: flagKey,
      enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq("key", flagKey);

  if (error) {
    logger.error("Emergency kill switch failed", {
      flagKey,
      error: error.message,
    });
    return false;
  }

  // Invalidate cache
  flagCache.delete(flagKey);

  logger.warn("Emergency kill switch activated", { flagKey });
  return true;
}

/**
 * Set a feature flag value.
 */
export async function setFlag(params: {
  key: string;
  enabled: boolean;
  targetType?: FlagTargetType;
  targetValue?: string;
  description?: string;
}): Promise<boolean> {
  const adminClient = createAdminClient();

  const { error } = await adminClient.from("feature_flags").upsert(
    {
      key: params.key,
      enabled: params.enabled,
      target_type: params.targetType ?? null,
      target_value: params.targetValue ?? null,
      description: params.description ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) {
    logger.error("Failed to set feature flag", {
      key: params.key,
      error: error.message,
    });
    return false;
  }

  // Invalidate cache
  flagCache.delete(params.key);

  return true;
}

/**
 * Invalidate the entire flag cache.
 */
export function invalidateFlagCache(): void {
  flagCache.clear();
}

/**
 * List all feature flags.
 */
export async function listFlags(): Promise<FeatureFlag[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("feature_flags")
    .select("key, enabled, target_type, target_value, description")
    .order("key");

  if (error || !data) {
    logger.error("Failed to list feature flags", { error: error?.message });
    return [];
  }

  return data.map((row: any) => ({
    key: row.key,
    enabled: row.enabled,
    targetType: row.target_type as FlagTargetType | null,
    targetValue: row.target_value as string | null,
    description: row.description,
  }));
}

/** Deterministic hash of a string, returning a 32-bit integer */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
