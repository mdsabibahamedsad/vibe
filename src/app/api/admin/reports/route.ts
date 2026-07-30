/**
 * GET /api/admin/reports — List reports with filters and pagination
 * GET /api/admin/reports/:id — Get single report details
 * POST /api/admin/reports/:id/assign — Assign report to moderator
 * POST /api/admin/reports/:id/resolve — Resolve/dismiss a report
 * POST /api/admin/reports/:id/escalate — Escalate a report
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError, adminResponse } from "@/lib/admin/admin-api";
import { Permissions } from "@/lib/admin/permissions";
import {
  listReports,
  getReport,
  assignReport,
  resolveReport,
  escalateReport,
} from "@/lib/admin/report.service";
import { z } from "zod";

/**
 * GET /api/admin/reports
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, Permissions.REPORTS_VIEW);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(request.url);
    const filters = {
      status: url.searchParams.get("status") ?? undefined,
      priority: url.searchParams.get("priority") ?? undefined,
      reason: url.searchParams.get("reason") ?? undefined,
      assignedTo: url.searchParams.get("assignedTo") ?? undefined,
      targetType: url.searchParams.get("targetType") ?? undefined,
      startDate: url.searchParams.get("startDate") ?? undefined,
      endDate: url.searchParams.get("endDate") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit")
        ? parseInt(url.searchParams.get("limit")!)
        : undefined,
    } as any;

    const result = await listReports(auth.role, filters);
    return adminResponse(result);
  } catch (err) {
    return handleAdminError(err);
  }
}

/**
 * POST /api/admin/reports — (placeholder for creating reports, handled by user-facing /api/reports)
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, Permissions.REPORTS_RESOLVE);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const { action, reportId } = body;

    if (!reportId) {
      return NextResponse.json({ error: "Report ID is required" }, { status: 400 });
    }

    switch (action) {
      case "assign": {
        const assignSchema = z.object({
          action: z.literal("assign"),
          reportId: z.string().uuid(),
          assignToUserId: z.string().uuid(),
        });
        const parsed = assignSchema.parse(body);
        await assignReport(auth.userId, auth.role, parsed.reportId, parsed.assignToUserId);
        return adminResponse({ message: "Report assigned successfully" });
      }

      case "resolve": {
        const resolveSchema = z.object({
          action: z.literal("resolve"),
          reportId: z.string().uuid(),
          status: z.enum(["resolved", "dismissed"]),
          note: z.string().optional(),
        });
        const parsed = resolveSchema.parse(body);
        await resolveReport(auth.userId, auth.role, parsed.reportId, {
          status: parsed.status,
          note: parsed.note,
        });
        return adminResponse({ message: "Report resolved successfully" });
      }

      case "escalate": {
        const escalateSchema = z.object({
          action: z.literal("escalate"),
          reportId: z.string().uuid(),
          escalateToUserId: z.string().uuid(),
          reason: z.string().min(1),
        });
        const parsed = escalateSchema.parse(body);
        await escalateReport(
          auth.userId,
          auth.role,
          parsed.reportId,
          parsed.escalateToUserId,
          parsed.reason,
        );
        return adminResponse({ message: "Report escalated successfully" });
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: err.errors }, { status: 400 });
    }
    return handleAdminError(err);
  }
}
