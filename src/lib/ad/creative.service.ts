/**
 * Creative Service — Ad Creative Lifecycle Management.
 *
 * Handles creation, approval, rejection, and listing of ad creatives.
 * All creatives are validated for safety before being set active.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { AppError, validationError, notFoundError } from "@/lib/errors";

const ALLOWED_CTA_VALUES = [
  "Learn More",
  "View Profile",
  "Visit",
  "Shop Now",
  "Join",
  "Install",
  "Get Premium",
  "Discover",
  "Follow",
];

export interface CreativeInput {
  campaignId: string;
  type: string;
  headline: string;
  body?: string;
  mediaId?: string;
  thumbnailMediaId?: string;
  destinationType: string;
  destinationUrl?: string;
  destinationPage?: string;
  destinationProfileId?: string;
  destinationPostId?: string;
  cta?: string;
}

/**
 * Create a new creative for a campaign.
 */
export async function createCreative(
  input: CreativeInput,
): Promise<any> {
  const adminClient = createAdminClient();

  // Validate campaign exists
  const { data: campaign } = await adminClient
    .from("ad_campaigns")
    .select("id, status")
    .eq("id", input.campaignId)
    .single();

  if (!campaign) throw notFoundError("Campaign not found");

  // Validate destination URL safety
  if (input.destinationType === "external_url" && input.destinationUrl) {
    validateDestinationUrl(input.destinationUrl);
  }

  // Validate CTA
  if (input.cta && !ALLOWED_CTA_VALUES.includes(input.cta)) {
    // Allow custom CTA but log it
    logger.info("Non-standard CTA used", { cta: input.cta, campaignId: input.campaignId });
  }

  // Validate headline
  if (!input.headline || input.headline.trim().length === 0) {
    throw validationError("Headline is required");
  }
  if (input.headline.length > 120) {
    throw validationError("Headline must be 120 characters or less");
  }

  const { data: creative, error } = await adminClient
    .from("ad_creatives")
    .insert({
      campaign_id: input.campaignId,
      type: input.type,
      headline: input.headline.trim(),
      body: input.body?.trim() ?? null,
      media_id: input.mediaId ?? null,
      thumbnail_media_id: input.thumbnailMediaId ?? null,
      destination_type: input.destinationType,
      destination_url: input.destinationUrl ?? null,
      destination_page: input.destinationPage ?? null,
      destination_profile_id: input.destinationProfileId ?? null,
      destination_post_id: input.destinationPostId ?? null,
      cta: input.cta ?? "Learn More",
      status: "pending", // Needs moderation review
    })
    .select()
    .single();

  if (error) {
    logger.error("Failed to create creative", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to create creative");
  }

  return creative;
}

/**
 * Update creative status (approve/reject).
 */
export async function updateCreativeStatus(
  adminId: string,
  creativeId: string,
  status: string,
  reason?: string,
): Promise<void> {
  const adminClient = createAdminClient();

  const updates: Record<string, unknown> = {
    status,
    reviewed_by: adminId,
    reviewed_at: new Date().toISOString(),
  };

  if (status === "rejected" && reason) {
    updates.rejection_reason = reason;
  }

  const { error } = await adminClient
    .from("ad_creatives")
    .update(updates)
    .eq("id", creativeId);

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to update creative status");
  }
}

/**
 * Get creatives for a campaign.
 */
export async function getCreativesForCampaign(
  campaignId: string,
): Promise<any[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("ad_creatives")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Failed to get creatives", { error: error.message });
    return [];
  }

  return data ?? [];
}

/**
 * Validate destination URL for safety.
 */
function validateDestinationUrl(url: string): void {
  try {
    const parsed = new URL(url);

    // Must be HTTPS
    if (parsed.protocol !== "https:") {
      throw validationError("Only HTTPS URLs are allowed for ad destinations");
    }

    // Block javascript: and other unsafe schemes
    if (parsed.protocol.startsWith("javascript")) {
      throw validationError("Invalid URL scheme");
    }

    // Basic hostname validation
    if (!parsed.hostname || parsed.hostname.includes("..")) {
      throw validationError("Invalid destination URL");
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw validationError("Invalid destination URL format");
  }
}
