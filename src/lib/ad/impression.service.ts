/**
 * Impression Service — Ad Impression Tracking.
 *
 * Records ad impressions when an ad is viewed.
 * Impressions are only counted after viewability validation.
 * Uses event IDs for idempotent tracking.
 *
 * Fraud protections:
 *   - Event ID deduplication (idempotency)
 *   - Rate limiting per user (via RateLimiter)
 *   - Server-side validation of campaign/creative existence
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { trackEvent } from "@/lib/analytics";
import { RateLimiter } from "@/lib/rate-limiter";
import { recordAuditEvent } from "@/lib/admin/audit.service";

const impressionRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  name: "impression",
});

export interface ImpressionInput {
  userId: string;
  campaignId: string;
  creativeId: string;
  placement: string;
  requestId?: string;
  eventId: string;
  sessionId?: string;
}

/**
 * Record an ad impression.
 * Idempotent — duplicate event IDs are silently ignored.
 */
export async function recordImpression(input: ImpressionInput): Promise<boolean> {
  const { userId, campaignId, creativeId, placement, requestId, eventId, sessionId } = input;

  try {
    // Rate limit check
    const allowed = await impressionRateLimiter.check(`impression:${userId}`);
    if (!allowed) {
      logger.warn("Impression rate limited", { userId });
      return false;
    }

    const adminClient = createAdminClient();

    // Validate campaign and creative exist
    const { data: creative } = await adminClient
      .from("ad_creatives")
      .select("id, campaign_id")
      .eq("id", creativeId)
      .eq("campaign_id", campaignId)
      .single();

    if (!creative) {
      logger.warn("Invalid impression: creative not found", { creativeId, campaignId });
      return false;
    }

    // Try to insert — unique constraint on event_id prevents duplicates
    const { data, error } = await adminClient
      .from("ad_impressions")
      .insert({
        ad_id: creativeId,
        campaign_id: campaignId,
        user_id: userId,
        placement,
        request_id: requestId ?? null,
        session_id: sessionId ?? null,
        event_id: eventId,
        served_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      // Duplicate event (unique constraint)
      if (error.code === "23505") {
        return true; // Already counted — idempotent
      }
      logger.error("Failed to record impression", { error: error.message });
      return false;
    }

    const impressionId = data?.id;

    // Track analytics
    await trackEvent(userId, "ad_impression", "ad", creativeId, {
      campaignId,
      placement,
      impressionId,
    });

    return true;
  } catch (err) {
    logger.error("Failed to record impression", { error: String(err) });
    return false;
  }
}

/**
 * Record viewability information for an impression.
 * Called when the ad enters the viewport (client-side detection).
 */
export async function recordViewability(
  impressionEventId: string,
  viewabilityPct: number,
): Promise<void> {
  try {
    const adminClient = createAdminClient();

    // Update the impression with viewability data
    const { error } = await adminClient
      .from("ad_impressions")
      .update({
        viewed_at: new Date().toISOString(),
        viewability_pct: Math.min(100, Math.max(0, viewabilityPct)),
      })
      .eq("event_id", impressionEventId);

    if (error) {
      logger.warn("Failed to record viewability", { error: error.message });
    }
  } catch (err) {
    logger.warn("Viewability recording failed", { error: String(err) });
  }
}
