/**
 * Delivery Service — Ad Selection and Delivery.
 *
 * Determines which ad to show to which user at which placement.
 * Considers: premium (remove_ads), campaign status, schedule,
 * budget, targeting, frequency caps, and rotation.
 *
 * All ad delivery decisions happen server-side.
 * React components only render what the server provides.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";

/**
 * Simple UUID v4 generator (no external dependency needed).
 */
function generateId(): string {
  const hex = "0123456789abcdef";
  let id = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      id += "-";
    } else if (i === 14) {
      id += "4"; // Version 4
    } else if (i === 19) {
      id += hex[(Math.random() * 4) | 8]; // Variant
    } else {
      id += hex[(Math.random() * 16) | 0];
    }
  }
  return id;
}

export interface AdDeliveryResult {
  found: boolean;
  ad?: {
    requestId: string;
    campaignId: string;
    advertiserId: string;
    creativeId: string;
    creativeType: string;
    headline: string;
    body: string | null;
    mediaId: string | null;
    thumbnailMediaId: string | null;
    destinationType: string;
    destinationUrl: string | null;
    destinationPage: string | null;
    cta: string;
    sponsoredLabel: string;
    isHouseCampaign: boolean;
    impressionEventId: string;
  };
  reason?: string;
}

export interface AdServeInput {
  userId: string;
  placement: string;
  context?: {
    countries?: string[];
    languages?: string[];
    age?: number;
    gender?: string;
    interestIds?: string[];
  };
}

/**
 * Get an eligible ad for a user at a given placement.
 * This is the main entry point for ad delivery.
 */
export async function getEligibleAd(input: AdServeInput): Promise<AdDeliveryResult> {
  const { userId, placement, context } = input;

  try {
    // Note: remove_ads is checked server-side by the get_eligible_ad DB function.
    // The DB function queries premium_entitlements for the 'remove_ads' feature key.
    // This TypeScript service delegates entirely to the database for authorization.

    // Step 1: Call the database function
    const adminClient = createAdminClient();
    const { data, error } = await adminClient.rpc("get_eligible_ad", {
      p_user_id: userId,
      p_placement_key: placement,
      p_countries: context?.countries ?? null,
      p_languages: context?.languages ?? null,
      p_interest_ids: context?.interestIds ?? null,
      p_gender: context?.gender ?? null,
      p_age: context?.age ?? null,
      p_exclude_campaign_ids: [],
    });

    if (error) {
      logger.error("Ad delivery RPC failed", { error: error.message });
      return { found: false, reason: "delivery_error" };
    }

    const result = data as any;
    if (!result || !result.eligible) {
      return { found: false, reason: result?.reason ?? "no_inventory" };
    }

    const ad = result.ad;

    // Step 3: Generate impression tracking ID
    const requestId = generateId();
    const impressionEventId = generateId();

    // Step 4: Track the ad request event
    await trackEvent(userId, "ad_served", "ad", ad.creative_id, {
      placement,
      campaignId: ad.campaign_id,
      creativeId: ad.creative_id,
      isHouseCampaign: ad.is_house_campaign,
      requestId,
    });

    return {
      found: true,
      ad: {
        requestId,
        campaignId: ad.campaign_id,
        advertiserId: ad.advertiser_id,
        creativeId: ad.creative_id,
        creativeType: ad.creative_type,
        headline: ad.headline,
        body: ad.body,
        mediaId: ad.media_id,
        thumbnailMediaId: ad.thumbnail_media_id,
        destinationType: ad.destination_type,
        destinationUrl: ad.destination_url,
        destinationPage: ad.destination_page,
        cta: ad.cta ?? "Learn More",
        sponsoredLabel: ad.sponsored_label ?? "Sponsored",
        isHouseCampaign: ad.is_house_campaign ?? false,
        impressionEventId,
      },
    };
  } catch (err) {
    logger.error("Ad delivery error", { userId, placement, error: String(err) });
    return { found: false, reason: "delivery_error" };
  }
}

/**
 * Serve ad with context — wraps getEligibleAd with session tracking.
 * Returns the ad data for the frontend to render.
 */
export async function serveAd(
  input: AdServeInput,
): Promise<AdDeliveryResult> {
  // Call the eligibility function
  const result = await getEligibleAd(input);

  if (!result.found) {
    await trackEvent(input.userId, "ad_no_inventory", "ad", undefined, {
      placement: input.placement,
      reason: result.reason,
    });
  }

  return result;
}
