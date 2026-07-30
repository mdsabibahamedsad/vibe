/**
 * GET /api/admin/roles — List all roles and their permissions
 * POST /api/admin/roles — Assign a role to a user or update permissions
 *
 * Only super_admins can manage roles.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError, adminResponse } from "@/lib/admin/admin-api";
import { Permissions } from "@/lib/admin/permissions";
import { recordAuditEvent } from "@/lib/admin/audit.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidatePermissionCache } from "@/lib/admin/permissions";
import { AppError, notFoundError } from "@/lib/errors";
import { z } from "zod";

/**
 * GET /api/admin/roles — List all roles and their permissions
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin.manage" as any);
  if (auth instanceof Response) return auth;

  try {
    const adminClient = createAdminClient();

    const { data: roles } = await adminClient
      .from("admin_permissions")
      .select("*")
      .order("role", { ascending: true });

    const { data: adminUsers } = await adminClient
      .from("users")
      .select("id, display_name, telegram_username, role")
      .neq("role", "user")
      .order("display_name", { ascending: true });

    return adminResponse({
      roles: roles ?? [],
      adminUsers: adminUsers ?? [],
    });
  } catch (err) {
    return handleAdminError(err);
  }
}

/**
 * POST /api/admin/roles — Perform role admin actions
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, "admin.manage" as any);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "assign_role": {
        const schema = z.object({
          action: z.literal("assign_role"),
          userId: z.string().uuid(),
          role: z.enum(["user", "moderator", "admin", "super_admin"]),
        });
        const parsed = schema.parse(body);

        // Prevent removing the last super admin
        if (parsed.role !== "super_admin") {
          const adminClient = createAdminClient();
          const { count } = await adminClient
            .from("users")
            .select("*", { count: "exact", head: true })
            .eq("role", "super_admin");

          if (count === 1) {
            // Check if we're about to demote the only super admin
            const { data: targetUser } = await adminClient
              .from("users")
              .select("role")
              .eq("id", parsed.userId)
              .single();

            if (targetUser?.role === "super_admin") {
              return NextResponse.json(
                { error: "Cannot remove the last super admin" },
                { status: 400 },
              );
            }
          }
        }

        const adminClient = createAdminClient();
        const { error } = await adminClient
          .from("users")
          .update({ role: parsed.role })
          .eq("id", parsed.userId);

        if (error) {
          throw new AppError("INTERNAL_ERROR", "Failed to assign role");
        }

        // Invalidate permission cache
        invalidatePermissionCache();

        await recordAuditEvent({
          adminId: auth.userId,
          action: "role_changed",
          targetType: "user",
          targetId: parsed.userId,
          metadata: { newRole: parsed.role },
        });

        return adminResponse({ message: `Role updated to ${parsed.role}` });
      }

      case "update_permissions": {
        const schema = z.object({
          action: z.literal("update_permissions"),
          role: z.enum(["super_admin", "admin", "moderator", "support"]),
          permissions: z.array(z.string()),
        });
        const parsed = schema.parse(body);

        const adminClient = createAdminClient();
        const { error } = await adminClient
          .from("admin_permissions")
          .update({
            permissions: parsed.permissions,
            updated_by: auth.userId,
          })
          .eq("role", parsed.role);

        if (error) {
          throw new AppError("INTERNAL_ERROR", "Failed to update permissions");
        }

        // Invalidate permission cache
        invalidatePermissionCache();

        await recordAuditEvent({
          adminId: auth.userId,
          action: "permission_changed",
          targetType: "permission",
          targetId: parsed.role,
          metadata: { permissions: parsed.permissions },
        });

        return adminResponse({ message: "Permissions updated" });
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
