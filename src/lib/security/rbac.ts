/**
 * RBAC — Role-Based Access Control definitions.
 *
 * Defines all roles, their hierarchy, and permission checks.
 * Permissions are checked server-side — never rely on the frontend alone.
 *
 * Role hierarchy: viewer < moderator < admin < super_admin
 * Each higher role inherits all permissions of lower roles.
 */

import { AppError, authorizationError } from "@/lib/errors";

/** Available roles in the system */
export type Role = "user" | "viewer" | "moderator" | "admin" | "super_admin";

/** Permission categories */
export type Permission =
  // User management
  | "users:read"
  | "users:write"
  | "users:delete"
  | "users:roles"
  // Content moderation
  | "content:read"
  | "content:moderate"
  | "content:delete"
  // Reports
  | "reports:read"
  | "reports:resolve"
  // Payments & finance
  | "payments:read"
  | "payments:write"
  | "payouts:process"
  // Verification
  | "verification:read"
  | "verification:write"
  // Support
  | "support:read"
  | "support:write"
  // Analytics
  | "analytics:read"
  | "analytics:export"
  // System configuration
  | "system:read"
  | "system:write"
  | "system:feature_flags"
  // Safety & moderation
  | "safety:read"
  | "safety:escalate"
  | "safety:resolve"
  // Admin specific
  | "admin:dashboard"
  | "admin:audit_log"
  | "admin:admins"
  // Security sensitive
  | "security:audit_log"
  | "security:settings";

/** Role hierarchy — higher index = more privileges */
const ROLE_HIERARCHY: Role[] = ["user", "viewer", "moderator", "admin", "super_admin"];

/** Mapping of roles to their granted permissions */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  user: [],
  viewer: [
    "content:read",
    "reports:read",
    "analytics:read",
  ],
  moderator: [
    "content:read",
    "content:moderate",
    "content:delete",
    "reports:read",
    "reports:resolve",
    "users:read",
    "safety:read",
    "safety:escalate",
    "safety:resolve",
    "verification:read",
    "support:read",
    "support:write",
    "analytics:read",
  ],
  admin: [
    "users:read",
    "users:write",
    "users:delete",
    "content:read",
    "content:moderate",
    "content:delete",
    "reports:read",
    "reports:resolve",
    "payments:read",
    "payments:write",
    "payouts:process",
    "verification:read",
    "verification:write",
    "support:read",
    "support:write",
    "analytics:read",
    "analytics:export",
    "system:read",
    "system:write",
    "system:feature_flags",
    "safety:read",
    "safety:escalate",
    "safety:resolve",
    "admin:dashboard",
    "admin:audit_log",
    "security:audit_log",
    "security:settings",
  ],
  super_admin: [
    "users:read",
    "users:write",
    "users:delete",
    "users:roles",
    "content:read",
    "content:moderate",
    "content:delete",
    "reports:read",
    "reports:resolve",
    "payments:read",
    "payments:write",
    "payouts:process",
    "verification:read",
    "verification:write",
    "support:read",
    "support:write",
    "analytics:read",
    "analytics:export",
    "system:read",
    "system:write",
    "system:feature_flags",
    "safety:read",
    "safety:escalate",
    "safety:resolve",
    "admin:dashboard",
    "admin:audit_log",
    "admin:admins",
    "security:audit_log",
    "security:settings",
  ],
};

/**
 * Check if a role has a specific permission.
 * Higher roles inherit all permissions of lower roles.
 */
export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.includes(permission);
}

/**
 * Check if a role has at least the given role level.
 */
export function hasRoleAtLeast(userRole: Role | null | undefined, minimumRole: Role): boolean {
  if (!userRole) return false;
  const userLevel = ROLE_HIERARCHY.indexOf(userRole);
  const minLevel = ROLE_HIERARCHY.indexOf(minimumRole);
  if (userLevel === -1 || minLevel === -1) return false;
  return userLevel >= minLevel;
}

/**
 * Assert that a user has the required permission.
 * Throws AppError (403) if not authorized.
 */
export function requirePermission(
  role: Role | null | undefined,
  permission: Permission,
): void {
  if (!hasPermission(role, permission)) {
    throw authorizationError(
      `Required permission: ${permission}. Current role does not have this permission.`,
    );
  }
}

/**
 * Assert that a user has at least the specified role.
 * Throws AppError (403) if not authorized.
 */
export function requireRoleAtLeast(
  userRole: Role | null | undefined,
  minimumRole: Role,
): void {
  if (!hasRoleAtLeast(userRole, minimumRole)) {
    throw authorizationError(
      `Required role: ${minimumRole} or higher. Current role does not meet this requirement.`,
    );
  }
}

/**
 * Get all permissions for a given role.
 */
export function getPermissionsForRole(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

/**
 * Get the role hierarchy level (0 = lowest).
 */
export function getRoleLevel(role: Role): number {
  return ROLE_HIERARCHY.indexOf(role);
}

/**
 * Check if one role outranks another.
 */
export function outranks(roleA: Role, roleB: Role): boolean {
  return getRoleLevel(roleA) > getRoleLevel(roleB);
}
