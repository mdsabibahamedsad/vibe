/**
 * GET /api/admin/appeals — List appeals with filters
 * POST /api/admin/appeals — Resolve an appeal
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError, adminResponse } from "@/lib/admin/admin-api";
import { Permissions } from "@/lib/admin/permissions";
import {
  listAppeals,
  getAppeal,
  resolveAppeal,
} from "@/lib/admin/appeal.service";
import { z } from "zod";

/**
 * GET /api/admin/appeals
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, Permissions.APPEALS_VIEW);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(request.url);
    const appealId = url.searchParams.get("appealId");

    // If appealId is provided, get full details
    if (appealId) {
      const details = await getAppeal(auth.role, appealId);
      return adminResponse(details);
    }

    const filters = {
      status: url.searchParams.get("status") ?? undefined,
      userId: url.searchParams.get("userId") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit")
        ? parseInt(url.searchParams.get("limit")!)
        : undefined,
    } as any;

    const result = await listAppeals(auth.role, filters);
    return adminResponse(result);
  } catch (err) {
    return handleAdminError(err);
  }
}

/**
 * POST /api/admin/appeals — Resolve an appeal
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, Permissions.APPEALS_RESOLVE);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const schema = z.object({
      appealId: z.string().uuid(),
      status: z.enum(["approved", "denied"]),
      note: z.string().optional(),
    });

    const parsed = schema.parse(body);

    await resolveAppeal(auth.userId, auth.role, parsed.appealId, {
      status: parsed.status,
      note: parsed.note,
    });

    return adminResponse({ message: `Appeal ${parsed.status}` });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: err.errors }, { status: 400 });
    }
    return handleAdminError(err);
  }
}
