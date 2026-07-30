/**
 * Frequency Cap Service — Ad Frequency Management.
 *
 * Checks and enforces ad frequency caps at multiple levels:
 *   1. Per campaign (max impressions per user per time window)
 *   2. Per campaign + placement (placement-specific limits)
 *   3. Global user cap (total ads per user per time window — future)
 *
 * Frequency caps are enforced server-side in the delivery pipeline.
 * The get_eligible_ad database function already checks frequency caps
 * at the SQL level. This service provides additional programmatic checks.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export interface FrequencyCapResult {
  allowed: boolean;
  campaignCaps: Record<string, boolean>; // campaign_id → allowed
  globalAllowed: boolean;
}

const GLOBAL_CAP_WINDOW_SECONDS = 3600; // 1 hour
const GLOBAL_CAP_MAX_IMPRESSIONS = 20;  // Max 20 ads per hour per user

/**
 * Check all frequency caps for a user.
 */
export async function checkFrequencyCaps(
  userId: string,
  campaignIds: string[],
  placement?: string,
): Promise<FrequencyCapResult> {
  const adminClient = createAdminClient();

  // Check per-campaign caps (delegated to DB function)
  const campaignCaps: Record<string, boolean> = {};
  for (const campaignId of campaignIds) {
    campaignCaps[campaignId] = await checkCampaignCap(adminClient, userId, campaignId, placement);
  }

  // Check global user cap
  const globalAllowed = await checkGlobalCap(adminClient, userId);

  return {
    allowed: Object.values(campaignCaps).every(Boolean) && globalAllowed,
    campaignCaps,
    globalAllowed,
  };
}

/**
 * Check per-campaign frequency cap.
 */
async function checkCampaignCap(
  adminClient: any,
  userId: string,
  campaignId: string,
  placement?: string,
): Promise<boolean> {
  try {
    const { data: caps } = await adminClient
      .from("ad_frequency_caps")
      .select("window_seconds, max_impressions")
      .eq("campaign_id", campaignId);

    if (!caps || caps.length === 0) return true; // No cap = allowed

    for (const cap of caps) {
      let query = adminClient
        .from("ad_impressions")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("user_id", userId);

      if (placement) {
        query = query.eq("placement", placement);
      }

      const windowStart = new Date(Date.now() - cap.window_seconds * 1000).toISOString();
      query = query.gte("created_at", windowStart);

      const { count } = await query;
      if ((count ?? 0) >= cap.max_impressions) {
        return false;
      }
    }

    return true;
  } catch (err) {
    logger.error("Failed to check campaign frequency cap", {
      campaignId,
      error: String(err),
    });
    return true; // Fail open — allow if check fails
  }
}

/**
 * Check global user-level frequency cap.
 */
async function checkGlobalCap(
  adminClient: any,
  userId: string,
): Promise<boolean> {
  try {
    const windowStart = new Date(Date.now() - GLOBAL_CAP_WINDOW_SECONDS * 1000).toISOString();

    const { count } = await adminClient
      .from("ad_impressions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", windowStart);

    return (count ?? 0) < GLOBAL_CAP_MAX_IMPRESSIONS;
  } catch (err) {
    logger.error("Failed to check global frequency cap", { error: String(err) });
    return true;
  }
}
