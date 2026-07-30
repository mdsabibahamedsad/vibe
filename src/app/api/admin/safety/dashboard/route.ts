/**
 * GET /api/admin/safety/dashboard
 * Returns aggregated safety metrics for the admin dashboard.
 * Requires admin/moderator permissions.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, Permissions } from "@/lib/admin/permissions";
import { logger } from "@/lib/logger";

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
    const now = new Date();
    const todayStart = now.toISOString().split("T")[0];
    const yesterdayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch all metrics in parallel
    const [
      { count: openEscalations },
      { count: pendingReports },
      { count: scamSignals24h },
      { count: harassmentReports24h },
      { count: impersonationReports },
      { count: pendingAppeals },
      { count: activeRestrictions },
      { count: safetyWarnings24h },
      { count: criticalEscalations },
      { data: recentEscalations },
      { data: dailyMetrics },
    ] = await Promise.all([
      adminClient
        .from("escalation_queue")
        .select("*", { count: "exact", head: true })
        .in("status", ["open", "in_review"]),
      adminClient
        .from("reports")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending", "reviewing"]),
      adminClient
        .from("safety_signals")
        .select("*", { count: "exact", head: true })
        .in("signal_type", [
          "romance_scam_pattern",
          "financial_scam_pattern",
          "phishing_link",
          "money_request_pattern",
          "investment_solicitation",
          "fake_giveaway",
        ])
        .gte("created_at", yesterdayStart),
      adminClient
        .from("reports")
        .select("*", { count: "exact", head: true })
        .eq("reason", "harassment")
        .gte("created_at", yesterdayStart),
      adminClient
        .from("reports")
        .select("*", { count: "exact", head: true })
        .eq("reason", "impersonation"),
      adminClient
        .from("appeals")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending", "in_review"]),
      adminClient
        .from("user_restrictions")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true),
      adminClient
        .from("chat_safety_warnings")
        .select("*", { count: "exact", head: true })
        .eq("dismissed", false)
        .gte("created_at", yesterdayStart),
      adminClient
        .from("escalation_queue")
        .select("*", { count: "exact", head: true })
        .eq("priority", "critical")
        .in("status", ["open", "in_review"]),
      adminClient
        .from("escalation_queue")
        .select("*")
        .in("status", ["open", "in_review"])
        .order("created_at", { ascending: false })
        .limit(10),
      adminClient
        .from("safety_metrics")
        .select("*")
        .order("metric_date", { ascending: false })
        .limit(30),
    ]);

    return NextResponse.json({
      overview: {
        open_escalations: openEscalations ?? 0,
        pending_reports: pendingReports ?? 0,
        scam_signals_24h: scamSignals24h ?? 0,
        harassment_reports_24h: harassmentReports24h ?? 0,
        impersonation_reports: impersonationReports ?? 0,
        pending_appeals: pendingAppeals ?? 0,
        active_restrictions: activeRestrictions ?? 0,
        safety_warnings_24h: safetyWarnings24h ?? 0,
        critical_escalations: criticalEscalations ?? 0,
      },
      recentEscalations: (recentEscalations ?? []).slice(0, 10),
      metrics: (dailyMetrics ?? []).slice(0, 30),
      lastRefreshed: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("Failed to load safety dashboard", { error: String(err) });
    return NextResponse.json(
      { error: "Failed to load safety dashboard" },
      { status: 500 },
    );
  }
}
