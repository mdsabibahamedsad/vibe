/**
 * GET /api/admin/users — Search users
 * GET /api/admin/users/:id — Get user moderation details
 * POST /api/admin/users/:id/warn — Warn a user
 * POST /api/admin/users/:id/restrict — Restrict a user
 * POST /api/admin/users/:id/suspend — Suspend a user
 * POST /api/admin/users/:id/ban — Ban a user
 * POST /api/admin/users/:id/unban — Unban a user
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError, adminResponse } from "@/lib/admin/admin-api";
import { Permissions } from "@/lib/admin/permissions";
import {
  searchUsers,
  getUserModerationStatus,
  warnUser,
  restrictUser,
  suspendUser,
  banUser,
  unbanUser,
  unsuspendUser,
  liftRestriction,
  type RestrictionType,
} from "@/lib/admin/account-restriction.service";
import { z } from "zod";

/**
 * GET /api/admin/users — Search users
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, Permissions.USERS_VIEW);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? "";
    const userId = url.searchParams.get("userId");

    // If userId is provided, get full moderation details
    if (userId) {
      const details = await getUserModerationStatus(auth.role, userId);
      return adminResponse(details);
    }

    const limit = url.searchParams.get("limit")
      ? parseInt(url.searchParams.get("limit")!)
      : 20;

    const results = query ? await searchUsers(auth.role, query, limit) : [];
    return adminResponse({ items: results, total: results.length });
  } catch (err) {
    return handleAdminError(err);
  }
}

/**
 * POST /api/admin/users — Perform actions on users
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, userId } = body;

    if (!action || !userId) {
      return NextResponse.json({ error: "Action and userId are required" }, { status: 400 });
    }

    switch (action) {
      case "warn": {
        const auth = await requireAdmin(request, Permissions.USERS_VIEW);
        if (auth instanceof Response) return auth;

        const schema = z.object({
          action: z.literal("warn"),
          userId: z.string().uuid(),
          reasonCode: z.string().min(1),
          reason: z.string().min(1),
        });
        const parsed = schema.parse(body);
        await warnUser(auth.userId, auth.role, {
          userId: parsed.userId,
          reasonCode: parsed.reasonCode,
          reason: parsed.reason,
        });
        return adminResponse({ message: "Warning issued" });
      }

      case "restrict": {
        const auth = await requireAdmin(request, Permissions.USERS_RESTRICT);
        if (auth instanceof Response) return auth;

        const schema = z.object({
          action: z.literal("restrict"),
          userId: z.string().uuid(),
          restrictionType: z.enum([
            "posting_disabled",
            "messaging_disabled",
            "commenting_disabled",
            "following_disabled",
            "dating_disabled",
          ]),
          reasonCode: z.string().min(1),
          reason: z.string().optional(),
          expiresAt: z.string().optional(),
        });
        const parsed = schema.parse(body);
        await restrictUser(auth.userId, auth.role, {
          userId: parsed.userId,
          restrictionType: parsed.restrictionType as RestrictionType,
          reasonCode: parsed.reasonCode,
          reason: parsed.reason,
          expiresAt: parsed.expiresAt,
        });
        return adminResponse({ message: "Restriction applied" });
      }

      case "lift_restriction": {
        const auth = await requireAdmin(request, Permissions.USERS_RESTRICT);
        if (auth instanceof Response) return auth;

        const schema = z.object({
          action: z.literal("lift_restriction"),
          restrictionId: z.string().uuid(),
        });
        const parsed = schema.parse(body);
        await liftRestriction(auth.userId, auth.role, parsed.restrictionId);
        return adminResponse({ message: "Restriction lifted" });
      }

      case "suspend": {
        const auth = await requireAdmin(request, Permissions.USERS_SUSPEND);
        if (auth instanceof Response) return auth;

        const schema = z.object({
          action: z.literal("suspend"),
          userId: z.string().uuid(),
          reason: z.string().min(1),
          suspendedUntil: z.string().min(1),
        });
        const parsed = schema.parse(body);
        await suspendUser(auth.userId, auth.role, {
          userId: parsed.userId,
          reason: parsed.reason,
          suspendedUntil: parsed.suspendedUntil,
        });
        return adminResponse({ message: "User suspended" });
      }

      case "unsuspend": {
        const auth = await requireAdmin(request, Permissions.USERS_SUSPEND);
        if (auth instanceof Response) return auth;

        const schema = z.object({
          action: z.literal("unsuspend"),
          userId: z.string().uuid(),
        });
        const parsed = schema.parse(body);
        await unsuspendUser(auth.userId, auth.role, parsed.userId);
        return adminResponse({ message: "User unsuspended" });
      }

      case "ban": {
        const auth = await requireAdmin(request, Permissions.USERS_BAN);
        if (auth instanceof Response) return auth;

        const schema = z.object({
          action: z.literal("ban"),
          userId: z.string().uuid(),
          reason: z.string().min(1),
        });
        const parsed = schema.parse(body);
        await banUser(auth.userId, auth.role, {
          userId: parsed.userId,
          reason: parsed.reason,
        });
        return adminResponse({ message: "User banned" });
      }

      case "unban": {
        const auth = await requireAdmin(request, Permissions.USERS_BAN);
        if (auth instanceof Response) return auth;

        const schema = z.object({
          action: z.literal("unban"),
          userId: z.string().uuid(),
          reason: z.string().optional(),
        });
        const parsed = schema.parse(body);
        await unbanUser(auth.userId, auth.role, parsed.userId, parsed.reason);
        return adminResponse({ message: "User unbanned" });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: err.errors }, { status: 400 });
    }
    return handleAdminError(err);
  }
}
