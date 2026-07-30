/**
 * Admin Billing API — Subscription Management.
 *
 * Protected endpoints for viewing and managing subscriptions.
 * Requires BILLING_VIEW permission.
 *
 * Routes:
 *   GET   /api/admin/billing/subscriptions — List subscriptions with cursor pagination
 *   GET   /api/admin/billing/subscriptions?userId=xxx — Search by user
 *   GET   /api/admin/billing/subscriptions?status=xxx — Filter by status
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError, adminResponse } from "@/lib/admin/admin-api";
import { Permissions } from "@/lib/admin/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin(request, Permissions.BILLING_VIEW);
    if (session instanceof NextResponse) return session;

    const adminClient = createAdminClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const status = searchParams.get("status");
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    let query = adminClient
      .from("subscriptions")
      .select("id, user_id, plan, status, provider, provider_subscription_id, starts_at, expires_at, cancel_at_period_end, cancelled_at, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (userId) query = query.eq("user_id", userId);
    if (status) query = query.eq("status", status);
    if (startDate) query = query.gte("created_at", startDate);
    if (endDate) query = query.lte("created_at", endDate);

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
      logger.error("Admin billing: failed to list subscriptions", { error: error.message });
      return NextResponse.json({ success: false, error: "Failed to load subscriptions" }, { status: 500 });
    }

    const items = (data ?? []).slice(0, limit);
    const hasMore = (data ?? []).length > limit;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem
      ? `${lastItem.created_at}_${lastItem.id}`
      : null;

    return adminResponse({ subscriptions: items, nextCursor, hasMore });
  } catch (err) {
    return handleAdminError(err);
  }
}
