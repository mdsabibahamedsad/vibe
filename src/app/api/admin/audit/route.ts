/**
 * GET /api/admin/audit — List audit logs with filters and cursor pagination
 */

import { NextRequest } from "next/server";
import { requireAdmin, handleAdminError, adminResponse } from "@/lib/admin/admin-api";
import { Permissions } from "@/lib/admin/permissions";
import { listAuditLogs } from "@/lib/admin/audit.service";

/**
 * GET /api/admin/audit
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, Permissions.AUDIT_VIEW);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(request.url);
    const filters = {
      adminId: url.searchParams.get("adminId") ?? undefined,
      action: url.searchParams.get("action") ?? undefined,
      targetType: url.searchParams.get("targetType") ?? undefined,
      startDate: url.searchParams.get("startDate") ?? undefined,
      endDate: url.searchParams.get("endDate") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit")
        ? parseInt(url.searchParams.get("limit")!)
        : undefined,
    } as any;

    const result = await listAuditLogs(filters);
    return adminResponse(result);
  } catch (err) {
    return handleAdminError(err);
  }
}
