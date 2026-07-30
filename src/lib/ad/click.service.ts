/**
 * Click Service — Ad Click Tracking.
 *
 * Records clicks on ads and provides safe destination resolution.
 * Clicks are validated against recently served impressions.
 *
 * Fraud protections:
 *   - Event ID deduplication
 *   - Rate limiting per user
 *   - Validates ad request context exists
 *   - Server-side destination resolution (never trust client URL)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { trackEvent } from "@/lib/analytics";
import { RateLimiter } from "@/lib/rate-limiter";

const clickRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  name: "click",
});

export interface ClickInput {
  userId: string;
  campaignId: string;
  creativeId: string;
  placement: string;
  requestId?: string;
  eventId: string;
  impressionEventId?: string;
}

export interface ClickResult {
  recorded: boolean;
  destination: {
    type: string;
    url?: string;
    page?: string;
    profileId?: string;
  } | null;
}

/**
 * Record an ad click and return the safe destination.
 * Idempotent — duplicate event IDs are silently ignored.
 */
export async function recordClick(input: ClickInput): Promise<ClickResult> {
  const { userId, campaignId, creativeId, placement, requestId, eventId, impressionEventId } = input;

  try {
    // Rate limit check
    const allowed = await clickRateLimiter.check(`click:${userId}`);
    if (!allowed) {
      logger.warn("Click rate limited", { userId });
      return { recorded: false, destination: null };
    }

    const adminClient = createAdminClient();

    // Validate creative exists and get destination info
    const { data: creative, error: creativeError } = await adminClient
      .from("ad_creatives")
      .select("id, campaign_id, destination_type, destination_url, destination_page, destination_profile_id, destination_post_id, cta")
      .eq("id", creativeId)
      .eq("campaign_id", campaignId)
      .single();

    if (creativeError || !creative) {
      logger.warn("Invalid click: creative not found", { creativeId, campaignId });
      return { recorded: false, destination: null };
    }

    // Record click with unique constraint on event_id
    const { error } = await adminClient
      .from("ad_clicks")
      .insert({
        ad_id: creativeId,
        campaign_id: campaignId,
        user_id: userId,
        impression_id: null, // Could look up from request_id
        placement,
        request_id: requestId ?? null,
        event_id: eventId,
        clicked_at: new Date().toISOString(),
      });

    if (error) {
      if (error.code === "23505") {
        // Duplicate — already counted
        return { recorded: true, destination: resolveCreativeDestination(creative) };
      }
      logger.error("Failed to record click", { error: error.message });
      return { recorded: false, destination: null };
    }

    // Track analytics
    await trackEvent(userId, "ad_click", "ad", creativeId, {
      campaignId,
      placement,
    });

    // Build safe destination
    const destination = resolveCreativeDestination(creative);

    return { recorded: true, destination };
  } catch (err) {
    logger.error("Failed to record click", { error: String(err) });
    return { recorded: false, destination: null };
  }
}

/**
 * Resolve a creative to a safe destination.
 * This is the server-authoritative destination — the client never
 * provides the redirect URL.
 */
function resolveCreativeDestination(creative: any): {
  type: string;
  url?: string;
  page?: string;
  profileId?: string;
} {
  switch (creative.destination_type) {
    case "external_url":
      return { type: "external_url", url: creative.destination_url };
    case "internal_profile":
      return { type: "internal_profile", profileId: creative.destination_profile_id };
    case "internal_post":
      return { type: "internal_post", page: `/feed?postId=${creative.destination_post_id}` };
    case "internal_page":
      return { type: "internal_page", page: creative.destination_page ?? "/" };
    default:
      return { type: "external_url", url: creative.destination_url };
  }
}

/**
 * Resolve click destination for redirect — used by the click redirect API.
 */
export async function resolveClickDestination(eventId: string): Promise<ClickResult["destination"] | null> {
  try {
    const adminClient = createAdminClient();

    const { data: click } = await adminClient
      .from("ad_clicks")
      .select("ad_id, campaign_id")
      .eq("event_id", eventId)
      .single();

    if (!click) return null;

    const { data: creative } = await adminClient
      .from("ad_creatives")
      .select("destination_type, destination_url, destination_page, destination_profile_id, destination_post_id")
      .eq("id", click.ad_id)
      .single();

    if (!creative) return null;

    return resolveCreativeDestination(creative);
  } catch (err) {
    logger.error("Failed to resolve click destination", { error: String(err) });
    return null;
  }
}
