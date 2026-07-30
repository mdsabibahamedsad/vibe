/**
 * Entitlement Service — Premium Feature Gating.
 *
 * Centralized service for checking premium entitlements.
 * ALL premium feature gates MUST use this service.
 *
 * Never scatter `if (isPremium)` checks through the codebase.
 * Use `hasEntitlement(userId, 'feature_key')` instead.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, authorizationError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Centralized premium feature registry.
 * All premium features are defined here.
 */
export const PremiumFeatures = {
  PREMIUM_BADGE: "premium_badge",
  ADVANCED_DISCOVERY: "advanced_discovery",
  UNLIMITED_LIKES: "unlimited_likes",
  ADVANCED_FILTERS: "advanced_filters",
  PROFILE_BOOST: "profile_boost",
  REWIND: "rewind",
  WHO_LIKED_YOU: "who_liked_you",
  PRIORITY_DISCOVERY: "priority_discovery",
  READ_RECEIPTS: "read_receipts",
  INCOGNITO_MODE: "incognito_mode",
  PREMIUM_STICKERS: "premium_stickers",
  REMOVE_ADS: "remove_ads",
} as const;

export type PremiumFeatureKey = (typeof PremiumFeatures)[keyof typeof PremiumFeatures];

/**
 * Feature configuration — limits and behavior for each feature.
 */
interface FeatureConfig {
  key: PremiumFeatureKey;
  name: string;
  description: string;
  isActive: boolean;
}

const FEATURE_REGISTRY: Record<string, FeatureConfig> = {
  [PremiumFeatures.PREMIUM_BADGE]: {
    key: PremiumFeatures.PREMIUM_BADGE,
    name: "Premium Badge",
    description: "Show an exclusive premium badge on your profile",
    isActive: true,
  },
  [PremiumFeatures.ADVANCED_DISCOVERY]: {
    key: PremiumFeatures.ADVANCED_DISCOVERY,
    name: "Advanced Discovery",
    description: "Access additional discovery filters and sorting options",
    isActive: true,
  },
  [PremiumFeatures.UNLIMITED_LIKES]: {
    key: PremiumFeatures.UNLIMITED_LIKES,
    name: "Unlimited Likes",
    description: "No daily limit on likes in discovery",
    isActive: true,
  },
  [PremiumFeatures.ADVANCED_FILTERS]: {
    key: PremiumFeatures.ADVANCED_FILTERS,
    name: "Advanced Filters",
    description: "Filter by height, education, interests, and more",
    isActive: true,
  },
  [PremiumFeatures.PROFILE_BOOST]: {
    key: PremiumFeatures.PROFILE_BOOST,
    name: "Profile Boost",
    description: "Get your profile seen by more people",
    isActive: true,
  },
  [PremiumFeatures.REWIND]: {
    key: PremiumFeatures.REWIND,
    name: "Rewind",
    description: "Go back to a profile you passed on",
    isActive: true,
  },
  [PremiumFeatures.WHO_LIKED_YOU]: {
    key: PremiumFeatures.WHO_LIKED_YOU,
    name: "Who Liked You",
    description: "See who liked you before you swipe",
    isActive: true,
  },
  [PremiumFeatures.READ_RECEIPTS]: {
    key: PremiumFeatures.READ_RECEIPTS,
    name: "Read Receipts",
    description: "See when your messages are read",
    isActive: true,
  },
  [PremiumFeatures.INCOGNITO_MODE]: {
    key: PremiumFeatures.INCOGNITO_MODE,
    name: "Incognito Mode",
    description: "Browse profiles without being seen",
    isActive: true,
  },
};

/**
 * Check if a user has a specific premium entitlement.
 * This is the PRIMARY entitlement check — all premium features use this.
 *
 * @param userId - The user's UUID
 * @param featureKey - The premium feature key
 * @returns true if the user has an active entitlement
 */
export async function hasEntitlement(
  userId: string,
  featureKey: PremiumFeatureKey,
): Promise<boolean> {
  try {
    const adminClient = createAdminClient();

    const { data, error } = await adminClient.rpc("has_entitlement", {
      p_user_id: userId,
      p_feature_key: featureKey,
    });

    if (error) {
      logger.error("Failed to check entitlement", {
        userId,
        featureKey,
        error: error.message,
      });
      return false; // Fail securely — deny access
    }

    return data ?? false;
  } catch (err) {
    logger.error("Entitlement check error", { userId, featureKey, error: String(err) });
    return false; // Fail securely
  }
}

/**
 * Require a premium entitlement — throws if not entitled.
 */
export async function requireEntitlement(
  userId: string,
  featureKey: PremiumFeatureKey,
): Promise<void> {
  const entitled = await hasEntitlement(userId, featureKey);
  if (!entitled) {
    throw authorizationError("Premium subscription required for this feature");
  }
}

/**
 * Get all active entitlements for a user.
 */
export async function getUserEntitlements(userId: string): Promise<string[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("premium_entitlements")
    .select("feature_key")
    .eq("user_id", userId)
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.now()`);

  if (error) {
    logger.error("Failed to get user entitlements", { userId, error: error.message });
    return [];
  }

  return (data ?? []).map((e) => e.feature_key);
}

/**
 * Get all available premium features with their config.
 */
export function getAllFeatures(): FeatureConfig[] {
  return Object.values(FEATURE_REGISTRY).filter((f) => f.isActive);
}

/**
 * Check if a user is a premium subscriber (has any premium entitlement).
 */
export async function isPremiumUser(userId: string): Promise<boolean> {
  return hasEntitlement(userId, PremiumFeatures.PREMIUM_BADGE);
}

/**
 * Get the daily like limit for a user (free vs premium).
 */
export async function getDailyLikeLimit(userId: string): Promise<number> {
  const hasUnlimited = await hasEntitlement(userId, PremiumFeatures.UNLIMITED_LIKES);
  // Premium = no limit (return a very high number)
  // Free = 50 likes per day
  return hasUnlimited ? 999999 : 50;
}
