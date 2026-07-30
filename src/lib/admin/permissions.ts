/**
 * Admin & Moderation Permission System.
 *
 * Centralized permission definitions and role-permission matrix.
 * All permission checks in the admin system must go through this module.
 *
 * NEVER scatter role checks like `user.role === 'admin'` throughout the codebase.
 * Use `can(user, 'permission.name')` instead.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// ============================================================================
// PERMISSION DEFINITIONS
// ============================================================================

export const Permissions = {
  // User moderation
  USERS_VIEW: "users.view",
  USERS_RESTRICT: "users.restrict",
  USERS_SUSPEND: "users.suspend",
  USERS_BAN: "users.ban",

  // Content moderation
  CONTENT_VIEW: "content.view",
  CONTENT_REMOVE: "content.remove",
  CONTENT_RESTORE: "content.restore",

  // Reports
  REPORTS_VIEW: "reports.view",
  REPORTS_RESOLVE: "reports.resolve",
  REPORTS_ASSIGN: "reports.assign",

  // Appeals
  APPEALS_VIEW: "appeals.view",
  APPEALS_RESOLVE: "appeals.resolve",

  // Analytics
  ANALYTICS_VIEW: "analytics.view",

  // Audit
  AUDIT_VIEW: "audit.view",

  // Admin management
  ADMIN_MANAGE: "admin.manage",

  // Notes
  ADMIN_NOTES: "admin.notes",

  // Billing
  BILLING_VIEW: "billing.view",
  BILLING_RECONCILE: "billing.reconcile",
  BILLING_MANAGE_PLANS: "billing.manage_plans",
  BILLING_GRANT_ENTITLEMENT: "billing.grant_entitlement",
  BILLING_REVOKE_ENTITLEMENT: "billing.revoke_entitlement",

  // Ads
  ADS_VIEW: "ads.view",
  ADS_REVIEW: "ads.review",
  ADS_MANAGE_CAMPAIGNS: "ads.manage_campaigns",
  ADS_MANAGE_ADVERTISERS: "ads.manage_advertisers",
  ADS_MANAGE_PLACEMENTS: "ads.manage_placements",
  ADS_VIEW_REPORTS: "ads.view_reports",
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

// ============================================================================
// ROLE-TO-PERMISSION MAPPING (fallback for when DB is unreachable)
// ============================================================================

/**
 * Static permission matrix used as fallback when the database
 * admin_permissions table cannot be queried.
 *
 * The source of truth is the database table (admin_permissions),
 * which can be modified by super admins at runtime.
 * This static map is the startup default.
 */
const DEFAULT_PERMISSIONS: Record<string, Permission[]> = {
  super_admin: Object.values(Permissions),
  admin: [
    Permissions.USERS_VIEW,
    Permissions.USERS_RESTRICT,
    Permissions.USERS_SUSPEND,
    Permissions.USERS_BAN,
    Permissions.CONTENT_VIEW,
    Permissions.CONTENT_REMOVE,
    Permissions.CONTENT_RESTORE,
    Permissions.REPORTS_VIEW,
    Permissions.REPORTS_RESOLVE,
    Permissions.REPORTS_ASSIGN,
    Permissions.APPEALS_VIEW,
    Permissions.APPEALS_RESOLVE,
    Permissions.ANALYTICS_VIEW,
    Permissions.AUDIT_VIEW,
    Permissions.ADMIN_NOTES,
    Permissions.BILLING_VIEW,
    Permissions.BILLING_RECONCILE,
    Permissions.ADS_VIEW,
    Permissions.ADS_REVIEW,
    Permissions.ADS_MANAGE_CAMPAIGNS,
    Permissions.ADS_VIEW_REPORTS,
  ],
  moderator: [
    Permissions.USERS_VIEW,
    Permissions.USERS_RESTRICT,
    Permissions.CONTENT_VIEW,
    Permissions.CONTENT_REMOVE,
    Permissions.CONTENT_RESTORE,
    Permissions.REPORTS_VIEW,
    Permissions.REPORTS_RESOLVE,
    Permissions.REPORTS_ASSIGN,
    Permissions.APPEALS_VIEW,
    Permissions.ADMIN_NOTES,
  ],
  support: [
    Permissions.USERS_VIEW,
    Permissions.REPORTS_VIEW,
    Permissions.APPEALS_VIEW,
  ],
  user: [],
};

// ============================================================================
// CACHED PERMISSIONS FROM DATABASE
// ============================================================================

let cachedPermissions: Record<string, Permission[]> | null = null;
let lastFetchAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch permissions from the database, falling back to defaults.
 */
async function loadPermissionsFromDb(): Promise<Record<string, Permission[]>> {
  try {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("admin_permissions")
      .select("role, permissions");

    if (error || !data) {
      logger.warn("Failed to load permissions from DB, using defaults", {
        error: error?.message,
      });
      return DEFAULT_PERMISSIONS;
    }

    const result: Record<string, Permission[]> = {};
    for (const row of data) {
      result[row.role] = row.permissions as Permission[];
    }

    return result;
  } catch (err) {
    logger.warn("Error loading permissions from DB, using defaults", {
      error: String(err),
    });
    return DEFAULT_PERMISSIONS;
  }
}

/**
 * Get the current permission matrix, with caching.
 */
async function getPermissionMatrix(): Promise<Record<string, Permission[]>> {
  const now = Date.now();
  if (!cachedPermissions || now - lastFetchAt > CACHE_TTL_MS) {
    cachedPermissions = await loadPermissionsFromDb();
    lastFetchAt = now;
  }
  return cachedPermissions;
}

// ============================================================================
// PERMISSION CHECKING
// ============================================================================

/**
 * Check if a user role has a specific permission.
 *
 * This is the primary permission check function.
 * All admin UI components and API routes should use this.
 *
 * @param role - The user's role string (e.g., 'admin', 'moderator')
 * @param permission - The permission to check (e.g., 'users.ban')
 * @returns true if the role has the permission
 */
export async function can(role: string, permission: Permission): Promise<boolean> {
  const matrix = await getPermissionMatrix();
  const rolePermissions = matrix[role];
  if (!rolePermissions) return false;
  return rolePermissions.includes(permission);
}

/**
 * Synchronous permission check using the default matrix.
 * Use this when async DB lookup is not possible (e.g., in RSC).
 *
 * NOTE: This uses default permissions only. For the most up-to-date
 * permissions, use the async `can()` function instead.
 */
export function canSync(role: string, permission: Permission): boolean {
  const rolePermissions = DEFAULT_PERMISSIONS[role];
  if (!rolePermissions) return false;
  return rolePermissions.includes(permission);
}

/**
 * Check multiple permissions (ALL must be satisfied).
 */
export async function canAll(
  role: string,
  permissions: Permission[],
): Promise<boolean> {
  for (const p of permissions) {
    if (!(await can(role, p))) return false;
  }
  return true;
}

/**
 * Check multiple permissions (ANY must be satisfied).
 */
export async function canAny(
  role: string,
  permissions: Permission[],
): Promise<boolean> {
  for (const p of permissions) {
    if (await can(role, p)) return true;
  }
  return false;
}

/**
 * Get all permissions for a role.
 */
export async function getPermissionsForRole(role: string): Promise<Permission[]> {
  const matrix = await getPermissionMatrix();
  return matrix[role] ?? [];
}

/**
 * Invalidate the permission cache (e.g., after a role change).
 */
export function invalidatePermissionCache(): void {
  cachedPermissions = null;
  lastFetchAt = 0;
}

/**
 * Check if a role is an admin-level role (admin, super_admin).
 */
export function isAdminRole(role: string): boolean {
  return role === "admin" || role === "super_admin";
}

/**
 * Check if a role is a moderator-level role (moderator, admin, super_admin).
 */
export function isModeratorRole(role: string): boolean {
  return role === "moderator" || role === "admin" || role === "super_admin";
}

/**
 * Roles that can access the admin panel.
 */
export function canAccessAdmin(role: string): boolean {
  return isModeratorRole(role) || role === "support";
}

// ============================================================================
// TYPES
// ============================================================================

export interface AdminUser {
  id: string;
  telegramUserId: number;
  displayName: string;
  role: string;
  permissions: Permission[];
}

/**
 * Get admin user info with permissions.
 */
export async function getAdminUser(userId: string): Promise<AdminUser | null> {
  try {
    const adminClient = createAdminClient();
    const { data: user, error } = await adminClient
      .from("users")
      .select("id, telegram_user_id, display_name, role")
      .eq("id", userId)
      .single();

    if (error || !user) return null;

    return {
      id: user.id,
      telegramUserId: user.telegram_user_id,
      displayName: user.display_name,
      role: user.role,
      permissions: await getPermissionsForRole(user.role),
    };
  } catch (err) {
    logger.error("Failed to get admin user", { userId, error: String(err) });
    return null;
  }
}
