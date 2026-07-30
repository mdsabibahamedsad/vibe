import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
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

async function lookupUser(appUserId: string): Promise<CurrentUser> {
  const adminClient = createAdminClient();
  const { data: appUser, error: appUserError } = await adminClient
    .from("users")
    .select("*")
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
