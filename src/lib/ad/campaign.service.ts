/**
 * Campaign Service — Ad Campaign Lifecycle Management.
 *
 * Handles creation, approval, pausing, and reporting of ad campaigns.
 * All state changes are permission-protected and audited.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { AppError, validationError, notFoundError, authorizationError } from "@/lib/errors";
import { recordAuditEvent } from "@/lib/admin/audit.service";
import { trackEvent } from "@/lib/analytics";

export interface AdPlacement {
  id: string;
  key: string;
  name: string;
  location: string;
  format: string;
  isActive: boolean;
  maxFrequency: number | null;
  frequencyWindowSeconds: number;
  allowedCreativeTypes: string[];
}

export interface CampaignInput {
  advertiserId: string;
  name: string;
  objective: string;
  pricingModel: string;
  budgetType: string;
  budgetAmount: number;
  currency?: string;
  startAt: string;
  endAt: string;
  cpmRate?: number;
  cpcRate?: number;
  priority?: number;
  isHouseCampaign?: boolean;
  // Placements
  placements: string[];
  // Targeting
  targeting?: {
    countries?: string[];
    languages?: string[];
    ageMin?: number;
    ageMax?: number;
    genders?: string[];
    interestIds?: string[];
    datingIntents?: string[];
  };
  // Frequency caps
  frequencyCaps?: {
    placementKey?: string;
    windowSeconds: number;
    maxImpressions: number;
  }[];
}

/**
 * Get all active ad placements.
 */
export async function getActivePlacements(): Promise<AdPlacement[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("ad_placements")
    .select("*")
    .eq("is_active", true)
    .order("key");

  if (error) {
    logger.error("Failed to fetch ad placements", { error: error.message });
    return [];
  }

  return (data ?? []).map((p: Record<string, unknown>) => ({
    id: p.id as string,
    key: p.key as string,
    name: p.name as string,
    location: p.location as string,
    format: p.format as string,
    isActive: p.is_active as boolean,
    maxFrequency: p.max_frequency as number | null,
    frequencyWindowSeconds: p.frequency_window_seconds as number,
    allowedCreativeTypes: (p.allowed_creative_types as string[]) ?? [],
  }));
}

/**
 * List campaigns with optional filters.
 */
export async function listCampaigns(options: {
  advertiserId?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ campaigns: any[]; nextCursor: string | null; hasMore: boolean }> {
  const adminClient = createAdminClient();
  const limit = Math.min(options.limit ?? 20, 100);
  const { advertiserId, status, cursor } = options;

  let query = adminClient
    .from("ad_campaigns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (advertiserId) query = query.eq("advertiser_id", advertiserId);
  if (status) query = query.eq("status", status);

  if (cursor) {
    const [cursorTime, cursorId] = cursor.split("_");
    if (cursorTime && cursorId) {
      query = query.or(
        `created_at.lt.${cursorTime},and(created_at.eq.${cursorTime},id.lt.${cursorId})`,
      );
    }
  }

  const { data, error } = await query;

  if (error) {
    logger.error("Failed to list campaigns", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to list campaigns");
  }

  const items = (data ?? []).slice(0, limit);
  const hasMore = (data ?? []).length > limit;
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem
    ? `${lastItem.created_at}_${lastItem.id}`
    : null;

  return { campaigns: items, nextCursor, hasMore };
}

/**
 * Get a single campaign with metrics.
 */
export async function getCampaign(campaignId: string): Promise<any | null> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("ad_campaigns")
    .select("*, advertiser:advertisers(id, business_name, status)")
    .eq("id", campaignId)
    .single();

  if (error) return null;

  return data;
}

/**
 * Create a new campaign.
 */
export async function createCampaign(
  adminId: string,
  input: CampaignInput,
): Promise<any> {
  const adminClient = createAdminClient();

  // Validate dates
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (endAt <= startAt) {
    throw validationError("End date must be after start date");
  }

  // Validate advertiser
  const { data: advertiser } = await adminClient
    .from("advertisers")
    .select("id, status")
    .eq("id", input.advertiserId)
    .single();

  if (!advertiser) throw notFoundError("Advertiser not found");
  if (advertiser.status !== "active") {
    throw validationError("Advertiser account is not active");
  }

  // Validate budget
  if (input.budgetAmount <= 0) {
    throw validationError("Budget must be greater than 0");
  }

  // Create campaign
  const { data: campaign, error } = await adminClient
    .from("ad_campaigns")
    .insert({
      advertiser_id: input.advertiserId,
      name: input.name,
      objective: input.objective,
      status: "draft",
      pricing_model: input.pricingModel,
      budget_type: input.budgetType,
      budget_amount: input.budgetAmount,
      currency: input.currency ?? "XTR",
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      cpm_rate: input.cpmRate ?? null,
      cpc_rate: input.cpcRate ?? null,
      priority: input.priority ?? 0,
      is_house_campaign: input.isHouseCampaign ?? false,
    })
    .select()
    .single();

  if (error) {
    logger.error("Failed to create campaign", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to create campaign");
  }

  // Create targeting
  if (input.targeting) {
    await adminClient.from("ad_campaign_targeting").insert({
      campaign_id: campaign.id,
      countries: input.targeting.countries ?? [],
      languages: input.targeting.languages ?? [],
      age_min: input.targeting.ageMin ?? null,
      age_max: input.targeting.ageMax ?? null,
      genders: input.targeting.genders ?? [],
      interest_ids: input.targeting.interestIds ?? [],
      dating_intents: input.targeting.datingIntents ?? [],
    });
  }

  // Link placements
  if (input.placements.length > 0) {
    const { data: placements } = await adminClient
      .from("ad_placements")
      .select("id, key")
      .in("key", input.placements);

    if (placements) {
      await adminClient.from("ad_campaign_placements").insert(
        placements.map((p: any) => ({
          campaign_id: campaign.id,
          placement_id: p.id,
        })),
      );
    }
  }

  // Create frequency caps
  if (input.frequencyCaps && input.frequencyCaps.length > 0) {
    await adminClient.from("ad_frequency_caps").insert(
      input.frequencyCaps.map((fc) => ({
        campaign_id: campaign.id,
        placement_key: fc.placementKey ?? null,
        window_seconds: fc.windowSeconds,
        max_impressions: fc.maxImpressions,
      })),
    );
  }

  // Create default placement rules
  if (input.placements.length > 0) {
    await adminClient.from("ad_placement_rules").insert(
      input.placements.map((key) => ({
        campaign_id: campaign.id,
        placement_key: key,
        min_organic_count: 5,
        spacing_min: 8,
        max_per_session: 2,
      })),
    );
  }

  await recordAuditEvent({
    adminId,
    action: "manual_entitlement_granted",
    targetType: "subscription",
    targetId: campaign.id,
    metadata: { action: "campaign_created", campaignName: input.name },
  });

  logger.info("Campaign created", { campaignId: campaign.id, name: input.name });

  return campaign;
}

/**
 * Update a campaign.
 */
export async function updateCampaign(
  adminId: string,
  campaignId: string,
  updates: Partial<CampaignInput>,
): Promise<void> {
  const adminClient = createAdminClient();

  const dbUpdates: Record<string, unknown> = {};
  if (updates.name) dbUpdates.name = updates.name;
  if (updates.objective) dbUpdates.objective = updates.objective;
  if (updates.pricingModel) dbUpdates.pricing_model = updates.pricingModel;
  if (updates.budgetType) dbUpdates.budget_type = updates.budgetType;
  if (updates.budgetAmount) dbUpdates.budget_amount = updates.budgetAmount;
  if (updates.startAt) dbUpdates.start_at = new Date(updates.startAt).toISOString();
  if (updates.endAt) dbUpdates.end_at = new Date(updates.endAt).toISOString();
  if (updates.cpmRate !== undefined) dbUpdates.cpm_rate = updates.cpmRate;
  if (updates.cpcRate !== undefined) dbUpdates.cpc_rate = updates.cpcRate;
  if (updates.priority !== undefined) dbUpdates.priority = updates.priority;

  if (Object.keys(dbUpdates).length > 0) {
    const { error } = await adminClient
      .from("ad_campaigns")
      .update(dbUpdates)
      .eq("id", campaignId);

    if (error) {
      throw new AppError("INTERNAL_ERROR", "Failed to update campaign");
    }
  }

  await recordAuditEvent({
    adminId,
    action: "manual_entitlement_granted",
    targetType: "subscription",
    targetId: campaignId,
    metadata: { action: "campaign_updated", changes: Object.keys(dbUpdates) },
  });
}

/**
 * Approve a campaign (move to approved status).
 */
export async function approveCampaign(
  adminId: string,
  campaignId: string,
): Promise<void> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("ad_campaigns")
    .update({
      status: "approved",
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .eq("status", "pending_review");

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to approve campaign");
  }

  await recordAuditEvent({
    adminId,
    action: "manual_entitlement_granted",
    targetType: "subscription",
    targetId: campaignId,
    metadata: { action: "campaign_approved" },
  });
}

/**
 * Reject a campaign.
 */
export async function rejectCampaign(
  adminId: string,
  campaignId: string,
  reason: string,
): Promise<void> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("ad_campaigns")
    .update({
      status: "rejected",
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq("id", campaignId)
    .eq("status", "pending_review");

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to reject campaign");
  }

  await recordAuditEvent({
    adminId,
    action: "manual_entitlement_granted",
    targetType: "subscription",
    targetId: campaignId,
    metadata: { action: "campaign_rejected", reason },
  });
}

/**
 * Pause a campaign.
 */
export async function pauseCampaign(
  adminId: string,
  campaignId: string,
): Promise<void> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("ad_campaigns")
    .update({ status: "paused" })
    .eq("id", campaignId)
    .in("status", ["active", "approved"]);

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to pause campaign");
  }

  await recordAuditEvent({
    adminId,
    action: "manual_entitlement_granted",
    targetType: "subscription",
    targetId: campaignId,
    metadata: { action: "campaign_paused" },
  });
}

/**
 * Resume a paused campaign.
 */
export async function resumeCampaign(
  adminId: string,
  campaignId: string,
): Promise<void> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("ad_campaigns")
    .update({ status: "active" })
    .eq("id", campaignId)
    .eq("status", "paused");

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to resume campaign");
  }

  await recordAuditEvent({
    adminId,
    action: "manual_entitlement_granted",
    targetType: "subscription",
    targetId: campaignId,
    metadata: { action: "campaign_resumed" },
  });
}

/**
 * Archive a campaign.
 */
export async function archiveCampaign(
  adminId: string,
  campaignId: string,
): Promise<void> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("ad_campaigns")
    .update({ status: "archived" })
    .eq("id", campaignId);

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to archive campaign");
  }

  await recordAuditEvent({
    adminId,
    action: "manual_entitlement_granted",
    targetType: "subscription",
    targetId: campaignId,
    metadata: { action: "campaign_archived" },
  });
}
