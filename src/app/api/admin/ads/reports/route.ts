/**
 * Admin Ad API — Reports & Analytics.
 *
 * Protected endpoints for ad performance reporting.
 *
 * Routes:
 *   GET /api/admin/ads/reports — Get global ad metrics
 *   GET /api/admin/ads/reports?campaignId=xxx — Get campaign-specific metrics
 *   GET /api/admin/ads/reports?advertiserId=xxx — Get advertiser metrics
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError, adminResponse } from "@/lib/admin/admin-api";
import { Permissions } from "@/lib/admin/permissions";
import { getCampaignMetrics, getAdvertiserMetrics, getGlobalMetrics } from "@/lib/ad/revenue.service";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin(request, Permissions.ADS_VIEW_REPORTS);
    if (session instanceof NextResponse) return session;

    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId");
    const advertiserId = searchParams.get("advertiserId");
    const startDate = searchParams.get("startDate") ?? undefined;
    const endDate = searchParams.get("endDate") ?? undefined;

    if (campaignId) {
      const metrics = await getCampaignMetrics(campaignId, startDate, endDate);
      return adminResponse({ campaign: metrics ?? null });
    }

    if (advertiserId) {
      const metrics = await getAdvertiserMetrics(advertiserId, startDate, endDate);
      return adminResponse(metrics);
    }

    const global = await getGlobalMetrics(startDate, endDate);
    return adminResponse(global);
  } catch (err) {
    return handleAdminError(err);
  }
}
