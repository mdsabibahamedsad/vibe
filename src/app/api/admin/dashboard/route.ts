/**
 * GET /api/admin/dashboard — Admin dashboard overview metrics.
 */

import { NextRequest } from "next/server";
import { requireAdmin, handleAdminError, adminResponse } from "@/lib/admin/admin-api";
import { getDashboardMetrics } from "@/lib/admin/moderation.service";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;

  try {
    const metrics = await getDashboardMetrics();
    return adminResponse(metrics);
  } catch (err) {
    return handleAdminError(err);
  }
}
