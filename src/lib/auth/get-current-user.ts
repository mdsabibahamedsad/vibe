import { createClient } from "@supabase/supabase-js";
import { createServerClient, createAdminClient } from "@/lib/supabase";
import { AppError } from "@/lib/errors";

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

async function getAccessToken(request?: Request): Promise<string | null> {
  if (request) {
    const authHeader = request.headers.get("Authorization");
    return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  }

  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    for (const cookie of allCookies) {
      if (cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token")) {
        try {
          const parsed = JSON.parse(cookie.value);
          if (parsed.access_token) return parsed.access_token;
        } catch {}
      }
    }
  } catch {}

  return null;
}

/**
 * Look up the application user row for the authenticated Supabase user.
 *
 * Uses the server (anon) client, NOT the admin (service-role) client, so that
 * user lookup works in production regardless of whether the service-role key
 * (SUPABASE_SERVICE_ROLE_KEY) is configured.
 *
 * The users table has RLS, and the policy "Users can read own data" permits
 * `id = auth.uid()`. Here auth.uid() resolves to the verified JWT user id
 * returned by supabase.auth.getUser(). Because the query is filtered to that
 * exact id, the read is both secure (RLS enforced) and correct.
 *
 * Missing environment variables are surfaced as proper AppErrors (500) so the
 * caller (API route) returns a safe, consistent response instead of leaking a
 * raw Node.js Error to the client.
 */
async function lookupUser(appUserId: string): Promise<CurrentUser> {
  try {
    const serverClient = createServerClient();

    // Single-row query filtered to the authenticated user id. The RLS policy
    // "Users can read own data" (id = auth.uid()) guarantees this is only
    // ever readable by the user it belongs to.
    const { data: appUser, error: appUserError } = await serverClient
      .from("users")
      .select(
        "id, telegram_user_id, telegram_username, display_name, first_name, last_name, role, is_active, is_banned, avatar_media_id, last_seen_at",
      )
      .eq("id", appUserId)
      .single();

    if (appUserError || !appUser) {
      throw new AppError("AUTHENTICATION_ERROR", "User not found", {
        statusCode: 401,
      });
    }

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
  } catch (err) {
    // Surface missing env vars as safe AppErrors instead of raw Errors.
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("Missing environment variable") ||
      message.includes("SUPABASE_SERVICE_ROLE_KEY") ||
      message.includes("NEXT_PUBLIC_SUPABASE")
    ) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Authentication service is not configured properly. Please try again later.",
        { statusCode: 500 },
      );
    }
    throw err;
  }
}

export async function getCurrentUser(request?: Request): Promise<CurrentUser> {
  const accessToken = await getAccessToken(request);

  if (!accessToken) {
    throw new AppError("AUTHENTICATION_ERROR", "Authentication required", {
      statusCode: 401,
    });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await client.auth.getUser(accessToken);

  if (userError || !userData.user) {
    throw new AppError("AUTHENTICATION_ERROR", "Invalid or expired session", {
      statusCode: 401,
    });
  }

  return lookupUser(userData.user.id);
}

export async function getOptionalCurrentUser(request?: Request): Promise<CurrentUser | null> {
  try {
    return await getCurrentUser(request);
  } catch {
    return null;
  }
}
