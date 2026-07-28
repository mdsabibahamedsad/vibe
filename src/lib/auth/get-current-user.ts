/**
 * Server-side authenticated user helper.
 *
 * Retrieves the verified application user from a request's Authorization header
 * containing a Supabase JWT access token.
 *
 * IMPORTANT: This function uses the Supabase Auth user JWT to identify the user,
 * NOT client-provided user IDs from request body or query params.
 *
 * The flow:
 *   1. Extract Bearer token from Authorization header
 *   2. Verify the token with Supabase Auth
 *   3. Look up the application user in public.users
 *   4. Return the user (or null if not authenticated)
 */

import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";

/** Application user returned by getCurrentUser */
export interface CurrentUser {
  id: string;
  telegramUserId: number;
  telegramUsername: string | null;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
  isBanned: boolean;
  avatarMediaId: string | null;
  lastSeenAt: string | null;
}

/**
 * Get the current authenticated user from a Next.js Request object.
 *
 * Extracts the Supabase JWT from the Authorization header,
 * verifies it, and returns the application user.
 *
 * @param request - The incoming Next.js Request
 * @returns The authenticated CurrentUser
 * @throws AppError if not authenticated (401)
 */
export async function getCurrentUser(request: Request): Promise<CurrentUser> {
  const authHeader = request.headers.get("Authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!accessToken) {
    throw new AppError("AUTHENTICATION_ERROR", "Authentication required", {
      statusCode: 401,
    });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Verify the access token with Supabase Auth
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await client.auth.getUser(accessToken);

  if (userError || !userData.user) {
    throw new AppError("AUTHENTICATION_ERROR", "Invalid or expired session", {
      statusCode: 401,
    });
  }

  const authUserId = userData.user.id;

  // Look up the application user
  const adminClient = createAdminClient();
  const { data: appUser, error: appUserError } = await adminClient
    .from("users")
    .select("*")
    .eq("id", authUserId)
    .single();

  if (appUserError || !appUser) {
    throw new AppError("AUTHENTICATION_ERROR", "User not found", {
      statusCode: 401,
    });
  }

  // Check if user is banned
  if (appUser.is_banned) {
    throw new AppError("AUTHORIZATION_ERROR", "Your account has been suspended", {
      statusCode: 403,
    });
  }

  return {
    id: appUser.id,
    telegramUserId: appUser.telegram_user_id,
    telegramUsername: appUser.telegram_username,
    displayName: appUser.display_name,
    firstName: appUser.first_name,
    lastName: appUser.last_name,
    role: appUser.role,
    isActive: appUser.is_active,
    isBanned: appUser.is_banned,
    avatarMediaId: appUser.avatar_media_id,
    lastSeenAt: appUser.last_seen_at,
  };
}

/**
 * Get the current authenticated user without throwing if not authenticated.
 * Returns null instead.
 */
export async function getOptionalCurrentUser(request: Request): Promise<CurrentUser | null> {
  try {
    return await getCurrentUser(request);
  } catch {
    return null;
  }
}
