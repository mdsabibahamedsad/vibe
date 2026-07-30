/**
 * Revenue Service — Ad Revenue Accounting & Reporting.
 *
 * Tracks and reports ad revenue events.
 * All monetary values use integer minor units (never floating point).
 *
 * Revenue is calculated server-side from actual impression/click events.
 * Never claims revenue that has not actually occurred.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

export interface CampaignMetrics {
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  ctr: number | null;
  conversions: number;
  conversionRate: number | null;
  spend: number;
  budget: number;
  remainingBudget: number;
  status: string;
}

export interface GlobalMetrics {
  totalImpressions: number;
  totalClicks: number;
  overallCtr: number | null;
  totalSpend: number;
  activeCampaigns: number;
  activeAdvertisers: number;
}

/**
 * Get metrics for a specific campaign.
 */
export async function getCampaignMetrics(
  campaignId: string,
  startDate?: string,
  endDate?: string,
): Promise<CampaignMetrics | null> {
  const adminClient = createAdminClient();

  // Get campaign info
  const { data: campaign } = await adminClient
    .from("ad_campaigns")
    .select("id, name, budget_amount, spent_amount, status")
    .eq("id", campaignId)
    .single();

  if (!campaign) return null;

  // Build date filter
  const startDateStr = startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const endDateStr = endDate ?? new Date().toISOString();

  // Count impressions
  const { count: impressions } = await adminClient
    .from("ad_impressions")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .gte("created_at", startDateStr)
    .lte("created_at", endDateStr);

  // Count clicks
  const { count: clicks } = await adminClient
    .from("ad_clicks")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .gte("clicked_at", startDateStr)
    .lte("clicked_at", endDateStr);

  // Count conversions
  const { count: conversions } = await adminClient
    .from("ad_conversions")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .gte("created_at", startDateStr)
    .lte("created_at", endDateStr);

  const impCount = impressions ?? 0;
  const clickCount = clicks ?? 0;
  const convCount = conversions ?? 0;

  const ctr = impCount > 0 ? (clickCount / impCount) * 100 : null;
  const conversionRate = clickCount > 0 ? (convCount / clickCount) * 100 : null;

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    impressions: impCount,
    clicks: clickCount,
    ctr: ctr !== null ? Math.round(ctr * 100) / 100 : null,
    conversions: convCount,
    conversionRate: conversionRate !== null ? Math.round(conversionRate * 100) / 100 : null,
    spend: campaign.spent_amount,
    budget: campaign.budget_amount,
    remainingBudget: campaign.budget_amount - campaign.spent_amount,
    status: campaign.status,
  };
}

/**
 * Get metrics for an advertiser across all campaigns.
 */
export async function getAdvertiserMetrics(
  advertiserId: string,
  startDate?: string,
  endDate?: string,
): Promise<{ campaigns: CampaignMetrics[]; total: { impressions: number; clicks: number; spend: number } }> {
  const adminClient = createAdminClient();

  const { data: campaigns } = await adminClient
    .from("ad_campaigns")
    .select("id")
    .eq("advertiser_id", advertiserId);

  if (!campaigns || campaigns.length === 0) {
    return { campaigns: [], total: { impressions: 0, clicks: 0, spend: 0 } };
  }

  const metrics = await Promise.all(
    campaigns.map((c: any) => getCampaignMetrics(c.id, startDate, endDate)),
  );

  const valid = metrics.filter(Boolean) as CampaignMetrics[];

  return {
    campaigns: valid,
    total: {
      impressions: valid.reduce((sum, m) => sum + m.impressions, 0),
      clicks: valid.reduce((sum, m) => sum + m.clicks, 0),
      spend: valid.reduce((sum, m) => sum + m.spend, 0),
    },
  };
}

/**
 * Get global ad metrics for admin dashboard.
 */
export async function getGlobalMetrics(
  startDate?: string,
  endDate?: string,
): Promise<GlobalMetrics> {
  const adminClient = createAdminClient();

  const startDateStr = startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const endDateStr = endDate ?? new Date().toISOString();

  // Total impressions
  const { count: totalImpressions } = await adminClient
    .from("ad_impressions")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startDateStr)
    .lte("created_at", endDateStr);

  // Total clicks
  const { count: totalClicks } = await adminClient
    .from("ad_clicks")
    .select("*", { count: "exact", head: true })
    .gte("clicked_at", startDateStr)
    .lte("clicked_at", endDateStr);

  // Total spend
  const { data: spendData } = await adminClient
    .from("ad_revenue_events")
    .select("amount_minor")
    .gte("created_at", startDateStr)
    .lte("created_at", endDateStr);

  const totalSpend = (spendData ?? []).reduce(
    (sum: number, e: any) => sum + (e.amount_minor ?? 0),
    0,
  );

  // Active campaigns
  const { count: activeCampaigns } = await adminClient
    .from("ad_campaigns")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  // Active advertisers
  const { count: activeAdvertisers } = await adminClient
    .from("advertisers")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  const impCount = totalImpressions ?? 0;
  const clickCount = totalClicks ?? 0;

  return {
    totalImpressions: impCount,
    totalClicks: clickCount,
    overallCtr: impCount > 0 ? Math.round((clickCount / impCount) * 10000) / 100 : null,
    totalSpend,
    activeCampaigns: activeCampaigns ?? 0,
    activeAdvertisers: activeAdvertisers ?? 0,
  };
}
