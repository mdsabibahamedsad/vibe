/**
 * Admin Ad API — Campaign Management.
 *
 * Protected endpoints for managing ad campaigns.
 *
 * Routes:
 *   GET   /api/admin/ads/campaigns — List campaigns (paginated, filtered)
 *   POST  /api/admin/ads/campaigns — Create a new campaign
 *   PATCH /api/admin/ads/campaigns — Update/adjust campaign status
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError, adminResponse } from "@/lib/admin/admin-api";
import { Permissions } from "@/lib/admin/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin(request, Permissions.ADS_VIEW);
    if (session instanceof NextResponse) return session;

    const adminClient = createAdminClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const advertiserId = searchParams.get("advertiserId");
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);

    let query = adminClient
      .from("ad_campaigns")
      .select("*, advertiser:advertisers(id, business_name, owner_user_id)")
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (status) query = query.eq("status", status);
    if (advertiserId) query = query.eq("advertiser_id", advertiserId);

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
      logger.error("Failed to list ad campaigns", { error: error.message });
      return NextResponse.json({ success: false, error: "Failed to load campaigns" }, { status: 500 });
    }

    const items = (data ?? []).slice(0, limit);
    const hasMore = (data ?? []).length > limit;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem
      ? `${lastItem.created_at}_${lastItem.id}`
      : null;

    return adminResponse({ campaigns: items, nextCursor, hasMore });
  } catch (err) {
    return handleAdminError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin(request, Permissions.ADS_MANAGE_CAMPAIGNS);
    if (session instanceof NextResponse) return session;

    const body = await request.json();
    const { action, campaignId, statusUpdate, reason } = body;

    const adminClient = createAdminClient();

    switch (action) {
      case "approve":
        await adminClient
          .from("ad_campaigns")
          .update({
            status: "approved",
            reviewed_by: session.userId,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", campaignId)
          .eq("status", "pending_review");
        break;

      case "reject":
        if (!reason) {
          return NextResponse.json({ success: false, error: "Rejection reason required" }, { status: 400 });
        }
        await adminClient
          .from("ad_campaigns")
          .update({
            status: "rejected",
            reviewed_by: session.userId,
            reviewed_at: new Date().toISOString(),
            rejection_reason: reason,
          })
          .eq("id", campaignId)
          .eq("status", "pending_review");
        break;

      case "pause":
        await adminClient
          .from("ad_campaigns")
          .update({ status: "paused" })
          .eq("id", campaignId)
          .in("status", ["active", "approved"]);
        break;

      case "resume":
        await adminClient
          .from("ad_campaigns")
          .update({ status: "active" })
          .eq("id", campaignId)
          .eq("status", "paused");
        break;

      case "activate":
        await adminClient
          .from("ad_campaigns")
          .update({ status: "active" })
          .eq("id", campaignId)
          .eq("status", "approved");
        break;

      case "update":
        if (statusUpdate) {
          await adminClient
            .from("ad_campaigns")
            .update(statusUpdate)
            .eq("id", campaignId);
        }
        break;

      default:
        return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    }

    return adminResponse({ message: `Campaign ${action}d successfully` });
  } catch (err) {
    return handleAdminError(err);
  }
}
