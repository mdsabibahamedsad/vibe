/**
 * Admin Ad API — Advertiser Management.
 *
 * Protected endpoints for managing advertiser accounts.
 *
 * Routes:
 *   GET   /api/admin/ads/advertisers — List advertisers (paginated)
 *   POST  /api/admin/ads/advertisers — Update advertiser status
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
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);

    let query = adminClient
      .from("advertisers")
      .select("*, owner:owner_user_id(id, display_name, telegram_user_id)")
      .order("created_at", { ascending: false })
      .limit(limit + 1);

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
      logger.error("Failed to list advertisers", { error: error.message });
      return NextResponse.json({ success: false, error: "Failed to load advertisers" }, { status: 500 });
    }

    const items = (data ?? []).slice(0, limit);
    const hasMore = (data ?? []).length > limit;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem
      ? `${lastItem.created_at}_${lastItem.id}`
      : null;

    return adminResponse({ advertisers: items, nextCursor, hasMore });
  } catch (err) {
    return handleAdminError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin(request, Permissions.ADS_MANAGE_ADVERTISERS);
    if (session instanceof NextResponse) return session;

    const body = await request.json();
    const { advertiserId, action } = body;

    const adminClient = createAdminClient();

    const statusMap: Record<string, string> = {
      activate: "active",
      suspend: "suspended",
      reject: "rejected",
      approve: "active",
    };

    const newStatus = statusMap[action];
    if (!newStatus) {
      return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    }

    await adminClient
      .from("advertisers")
      .update({ status: newStatus })
      .eq("id", advertiserId);

    return adminResponse({ message: `Advertiser ${action}d successfully` });
  } catch (err) {
    return handleAdminError(err);
  }
}
