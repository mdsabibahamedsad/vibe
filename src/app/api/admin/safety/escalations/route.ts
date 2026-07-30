/**
 * GET /api/admin/safety/escalations — List escalations
 * POST /api/admin/safety/escalations — Create escalation
 * PATCH /api/admin/safety/escalations — Update escalation status
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, Permissions } from "@/lib/admin/permissions";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const createEscalationSchema = z.object({
  category: z.enum([
    "severe_harassment",
    "credible_threat",
    "financial_fraud",
    "account_takeover",
    "impersonation",
    "child_safety",
    "coordinated_abuse",
    "romance_scam",
    "extreme_spam",
    "other_critical",
  ]),
  reportedUserId: z.string().uuid(),
  description: z.string().min(10).max(5000),
  reportId: z.string().uuid().optional(),
  priority: z.enum(["medium", "high", "critical"]).default("high"),
});

const updateEscalationSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "in_review", "resolved", "dismissed"]),
  resolvedBy: z.string().uuid().optional(),
  resolutionNote: z.string().max(2000).optional(),
});

/**
 * GET /api/admin/safety/escalations
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasPermission = await can(user.role, Permissions.REPORTS_VIEW);
    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") || "open";
    const category = searchParams.get("category");
    const limit = Math.min(parseInt(searchParams.get("limit") || "25"), 100);

    let query = adminClient
      .from("escalation_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status !== "all") {
      query = query.eq("status", status);
    }
    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Failed to fetch escalations", { error: error.message });
      return NextResponse.json({ error: "Failed to fetch escalations" }, { status: 500 });
    }

    return NextResponse.json({ escalations: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch escalations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/safety/escalations
 * Creates a new escalation from a report or safety signal.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasPermission = await can(user.role, Permissions.REPORTS_RESOLVE);
    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createEscalationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("escalation_queue")
      .insert({
        category: parsed.data.category,
        reported_user_id: parsed.data.reportedUserId,
        reporter_id: user.id,
        report_id: parsed.data.reportId ?? null,
        description: parsed.data.description,
        priority: parsed.data.priority,
      })
      .select("id")
      .single();

    if (error) {
      logger.error("Failed to create escalation", { error: error.message });
      return NextResponse.json({ error: "Failed to create escalation" }, { status: 500 });
    }

    return NextResponse.json({ escalationId: data.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create escalation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/safety/escalations
 * Update escalation status (resolve/dismiss/assign).
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const hasPermission = await can(user.role, Permissions.REPORTS_RESOLVE);
    if (!hasPermission) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateEscalationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from("escalation_queue")
      .update({
        status: parsed.data.status,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
        resolution_note: parsed.data.resolutionNote ?? null,
      })
      .eq("id", parsed.data.id)
      .in("status", ["open", "in_review"]);

    if (error) {
      logger.error("Failed to update escalation", { error: error.message });
      return NextResponse.json({ error: "Failed to update escalation" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update escalation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
