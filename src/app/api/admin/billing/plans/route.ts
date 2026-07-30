/**
 * Admin Billing API — Plan Management.
 *
 * Protected endpoints for managing subscription plans.
 * Requires BILLING_MANAGE_PLANS permission.
 *
 * Routes:
 *   GET   /api/admin/billing/plans — List all plans
 *   PUT   /api/admin/billing/plans/:id — Update a plan
 *   PATCH /api/admin/billing/plans/:id/toggle — Activate/deactivate a plan
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError, adminResponse } from "@/lib/admin/admin-api";
import { Permissions } from "@/lib/admin/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/admin/audit.service";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin(request, Permissions.BILLING_VIEW);
    if (session instanceof NextResponse) return session;

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("subscription_plans")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      logger.error("Admin billing: failed to list plans", { error: error.message });
      return NextResponse.json({ success: false, error: "Failed to load plans" }, { status: 500 });
    }

    return adminResponse({ plans: data ?? [] });
  } catch (err) {
    return handleAdminError(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAdmin(request, Permissions.BILLING_MANAGE_PLANS);
    if (session instanceof NextResponse) return session;

    const body = await request.json();
    const { id, name, description, stars_price, duration_days, is_active, sort_order, features } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Plan ID is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Only update provided fields
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (stars_price !== undefined) updates.stars_price = stars_price;
    if (duration_days !== undefined) updates.duration_days = duration_days;
    if (is_active !== undefined) updates.is_active = is_active;
    if (sort_order !== undefined) updates.sort_order = sort_order;
    if (features !== undefined) updates.features = features;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    const { data: oldPlan } = await adminClient
      .from("subscription_plans")
      .select("slug, stars_price, is_active")
      .eq("id", id)
      .single();

    const { error } = await adminClient
      .from("subscription_plans")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      logger.error("Admin billing: failed to update plan", { id, error: error.message });
      return NextResponse.json({ success: false, error: "Failed to update plan" }, { status: 500 });
    }

    // Audit the change
    await recordAuditEvent({
      adminId: session.userId,
      action: "manual_entitlement_granted",
      targetType: "subscription",
      targetId: id,
      metadata: {
        action: "plan_updated",
        planSlug: oldPlan?.slug,
        changes: Object.keys(updates),
      },
    });

    return adminResponse({ message: "Plan updated successfully" });
  } catch (err) {
    return handleAdminError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAdmin(request, Permissions.BILLING_MANAGE_PLANS);
    if (session instanceof NextResponse) return session;

    const body = await request.json();
    const { id, is_active } = body;

    if (!id || is_active === undefined) {
      return NextResponse.json({ success: false, error: "Plan ID and is_active are required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: plan, error: fetchError } = await adminClient
      .from("subscription_plans")
      .select("slug, name")
      .eq("id", id)
      .single();

    if (fetchError || !plan) {
      return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });
    }

    const { error } = await adminClient
      .from("subscription_plans")
      .update({ is_active })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ success: false, error: "Failed to update plan" }, { status: 500 });
    }

    await recordAuditEvent({
      adminId: session.userId,
      action: "manual_entitlement_granted",
      targetType: "subscription",
      targetId: id,
      metadata: {
        action: is_active ? "plan_activated" : "plan_deactivated",
        planSlug: plan.slug,
      },
    });

    return adminResponse({
      message: `Plan ${plan.name} ${is_active ? "activated" : "deactivated"} successfully`,
    });
  } catch (err) {
    return handleAdminError(err);
  }
}
