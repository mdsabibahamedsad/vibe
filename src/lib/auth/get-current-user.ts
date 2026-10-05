import { createServerClient, createAuthenticatedServerClient } from "@/lib/supabase";
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

/**
 * Extract an access token from an `sb-*-auth-token` cookie value.
 *
 * The client stores the session as a JSON blob (`{ access_token, ... }`)
 * encoded with `encodeURIComponent`. Depending on the Next.js version, the
 * cookie value we receive may already be percent-decoded or still encoded,
 * so both forms are attempted. Returns null when the value is not ours.
 */
function tokenFromAuthCookieValue(value: string | undefined): string | null {
  if (!value) return null;
  const candidates = [value];
  try {
    const decoded = decodeURIComponent(value);
    if (decoded !== value) candidates.push(decoded);
  } catch {
    // Not percent-encoded — parse the raw value only.
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { access_token?: unknown };
      if (typeof parsed.access_token === "string" && parsed.access_token) {
        return parsed.access_token;
      }
    } catch {
      // Try the next candidate form.
    }
  }
  return null;
}

function tokenFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  // Split on ";" — cookie values never contain a raw ";" (they are encoded).
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name.startsWith("sb-") && name.endsWith("-auth-token")) {
      const token = tokenFromAuthCookieValue(part.slice(eq + 1).trim());
      if (token) return token;
    }
  }
  return null;
}

async function getAccessToken(request?: Request): Promise<string | null> {
  // 1) Authorization header (explicit Bearer token — most reliable, works
  // even where cookies are blocked, e.g. some Telegram WebViews).
  if (request) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
    // NOTE: no early `return null` here — fall through to cookies below.
    // A previous early-return meant cookie auth NEVER worked for routes
    // that pass `request` (i.e. every protected route), so /api/feed
    // returned "Authentication required" despite a valid session.

    // 2) Cookie header on the incoming request (same-origin browser fetch
    // sends the `sb-auth-token` cookie set at login automatically).
    const fromHeader = tokenFromCookieHeader(request.headers.get("cookie"));
    if (fromHeader) return fromHeader;
  }

  try {
    // 3) next/headers cookie store (covers runtimes where the raw Cookie
    // header is not directly visible).
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    for (const cookie of allCookies) {
      if (cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token")) {
        const token = tokenFromAuthCookieValue(cookie.value);
        if (token) return token;
      }
    }
  } catch {}

  return null;
}

/**
 * Look up the application user row for the authenticated Supabase user.
 *
 * Uses the server (anon) client acting AS the user (JWT attached via the
 * Authorization header), NOT the admin (service-role) client, so that user
 * lookup works in production regardless of whether the service-role key
 * (SUPABASE_SERVICE_ROLE_KEY) is configured.
 *
 * The users table has RLS, and the policy "Users can read own data" permits
 * `id = auth.uid()`. The JWT makes auth.uid() resolve to the verified user
 * id returned by supabase.auth.getUser(). Because the query is filtered to
 * that exact id, the read is both secure (RLS enforced) and correct.
 *
 * NOTE: querying with a plain anon client (no JWT) leaves auth.uid() NULL,
 * so RLS denies the read and every protected route returns 401. Always use
 * the authenticated client here.
 *
 * Missing environment variables are surfaced as proper AppErrors (500) so the
 * caller (API route) returns a safe, consistent response instead of leaking a
 * raw Node.js Error to the client.
 */
async function lookupUser(appUserId: string, accessToken: string): Promise<CurrentUser> {
  try {
    const serverClient = createAuthenticatedServerClient(accessToken);

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

  // Verify the authenticated user via the server (anon) client.
  // The server client reads the `sb-*-auth-token` cookie that is set when
  // the frontend calls /api/auth/telegram (the session is established there)
  // and when the session is refreshed in the browser. Because the client
  // runs on the server, it verifies the JWT against Supabase's public JWT
  // verification endpoints using the anon key, with `auth: { persistSession: false }`
  // so no browser session is implied.
  //
  // Both NEXT_PUBLIC_SUPABASE_URL and SUPABASE_URL naming conventions are
  // supported to match different deployment conventions.
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Authentication service is not configured properly. Please try again later.",
      { statusCode: 500 },
    );
  }

  const serverClient = createServerClient();

  const { data: userData, error: userError } = await serverClient.auth.getUser(accessToken);

  if (userError || !userData.user) {
    throw new AppError("AUTHENTICATION_ERROR", "Invalid or expired session", {
      statusCode: 401,
    });
  }

  return lookupUser(userData.user.id, accessToken);
}

export async function getOptionalCurrentUser(request?: Request): Promise<CurrentUser | null> {
  try {
    return await getCurrentUser(request);
  } catch {
    return null;
  }
}
