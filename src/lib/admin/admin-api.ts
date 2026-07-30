/**
 * Admin API Helper.
 *
 * Provides authentication and authorization for admin API routes.
 * Every admin endpoint must use these helpers to verify:
 *   1. The user is authenticated
 *   2. The user has an admin-level role
 *   3. The user has the required permission
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { canAccessAdmin, can, type Permission } from "./permissions";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export interface AdminSession {
  userId: string;
  role: string;
  displayName: string;
  telegramUserId: number;
}

/**
 * Authenticate and authorize an admin API request.
 *
 * @param request - The incoming Next.js Request
 * @param requiredPermission - Optional specific permission to check
 * @returns The admin session with user info
 * @throws Returns a 401/403 NextResponse if unauthorized
 */
export async function requireAdmin(
  request: NextRequest,
  requiredPermission?: Permission,
): Promise<AdminSession | NextResponse> {
  try {
    const user = await getCurrentUser(request);

    if (!canAccessAdmin(user.role)) {
      return NextResponse.json(
        { error: "Access denied. Admin privileges required." },
        { status: 403 },
      );
    }

    if (requiredPermission && !(await can(user.role, requiredPermission))) {
      return NextResponse.json(
        { error: "Insufficient permissions for this operation." },
        { status: 403 },
      );
    }

    return {
      userId: user.id,
      role: user.role,
      displayName: user.displayName,
      telegramUserId: user.telegramUserId,
    };
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode },
      );
    }

    logger.error("Admin authentication error", { error: String(err) });
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 401 },
    );
  }
}

/**
 * Handle errors in admin API routes consistently.
 */
export function handleAdminError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.statusCode },
    );
  }

  logger.error("Unhandled admin API error", { error: String(err) });
  return NextResponse.json(
    { error: "An unexpected error occurred" },
    { status: 500 },
  );
}

/**
 * Create a success response for admin APIs.
 */
export function adminResponse(data: unknown, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}
