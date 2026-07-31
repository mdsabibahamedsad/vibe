/**
 * Supabase Auth Bridge for Telegram Identity.
 *
 * Bridges Telegram identity (verified via initData) to Supabase Auth sessions.
 *
 * Architecture:
 *   Telegram identity → Server validates initData → Supabase Auth user created/looked up
 *   → Sign in with password → Return Supabase session (JWT) to client
 *   → Client stores session → Supabase RLS works via auth.uid()
 *
 * The key insight: our public.users.id is the SAME UUID as the Supabase Auth user ID.
 * This ensures that RLS policies using auth.uid() correctly identify the user.
 *
 * IMPORTANT: The Supabase service-role key is used ONLY on the server
 * for creating auth users. Never expose it to the client.
 *
 * Resiliency:
 *   - Existing users are authenticated via the deterministic password using ONLY
 *     the anon key — so even if the service-role key is temporarily unavailable,
 *     returning users can still sign in.
 *   - New users are created via the admin client (service role). If the service
 *     role is not configured, creation fails with a clear error.
 *   - The legacy `listUsers()` paginated lookup is NOT used (it only returns the
 *     first page of 50 users and throws when the service key is invalid). Instead
 *     we attempt sign-in, then createUser, then sign-in again.
 */

import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAuthEmail, generateAuthPassword } from "@/lib/telegram/validate";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { ValidatedTelegramData } from "@/lib/telegram/validate";

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: number;
  user: {
    id: string;
    telegramUserId: number;
    displayName: string;
    username?: string;
    role: string;
  };
}

export interface AuthResult {
  session: AuthSession;
  isNewUser: boolean;
}

/**
 * Create or retrieve a Supabase Auth user for a verified Telegram user.
 * Then sign in and return a Supabase session that the client can use.
 *
 * @param validatedData - The validated Telegram initData
 * @returns AuthResult with session and isNewUser flag
 */
export async function createAuthSession(validatedData: ValidatedTelegramData): Promise<AuthResult> {
  const { user: telegramUser } = validatedData;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new AppError("TELEGRAM_ERROR", "TELEGRAM_BOT_TOKEN is not configured on the server", {
      statusCode: 500,
    });
  }

  const email = generateAuthEmail(telegramUser.id);
  const password = generateAuthPassword(telegramUser.id, botToken);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    logger.error("createAuthSession: Supabase env vars missing", {
      hasUrl: !!supabaseUrl,
      hasAnonKey: !!supabaseAnonKey,
    });
    throw new AppError("INTERNAL_ERROR", "Supabase is not configured on the server", {
      statusCode: 500,
    });
  }

  // Sign-in client uses ONLY the public anon key (never the service role).
  const signInClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const userMetadata = {
    telegram_user_id: telegramUser.id,
    telegram_username: telegramUser.username || null,
    telegram_first_name: telegramUser.first_name,
    telegram_last_name: telegramUser.last_name || null,
  };

  // ==========================================================================
  // Step 1: Try to sign in with the deterministic password (existing user).
  // This path needs ONLY the anon key — it never touches the service role.
  // ==========================================================================
  const signInAttempt = await signInClient.auth.signInWithPassword({ email, password });

  if (!signInAttempt.error && signInAttempt.data.session && signInAttempt.data.user) {
    const session = signInAttempt.data.session;
    const authUserId = signInAttempt.data.user.id;

    // Best-effort: refresh auth metadata + public.users row + role.
    // If the service-role key is broken, we still return the session —
    // the user is already authenticated via the anon-key sign-in.
    let userRole = "user";
    try {
      const adminClient = createAdminClient();
      await adminClient.auth.admin.updateUserById(authUserId, {
        user_metadata: userMetadata,
      });
      await adminClient
        .from("users")
        .upsert(
          {
            id: authUserId, // Same UUID as Supabase Auth user
            telegram_user_id: telegramUser.id,
            telegram_username: telegramUser.username || null,
            display_name: telegramUser.first_name,
            first_name: telegramUser.first_name,
            last_name: telegramUser.last_name || null,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      const { data: appUser } = await adminClient
        .from("users")
        .select("role")
        .eq("id", authUserId)
        .single();
      if (appUser && typeof appUser.role === "string") {
        userRole = appUser.role;
      }
    } catch (err) {
      logger.warn("createAuthSession: admin refresh skipped (best-effort)", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }

    return {
      session: {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresIn: session.expires_in ?? 3600,
        expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: authUserId,
          telegramUserId: telegramUser.id,
          displayName: telegramUser.first_name,
          username: telegramUser.username,
          role: userRole,
        },
      },
      isNewUser: false,
    };
  }

  // ==========================================================================
  // Step 2: Sign-in failed. Only proceed to user creation if the failure means
  // the user does not exist yet. If it failed for another reason (e.g. invalid
  // anon key, network error), surface that instead of attempting to create a
  // user that may already exist.
  // ==========================================================================
  if (signInAttempt.error) {
    const signInErrorCode = signInAttempt.error.code ?? signInAttempt.error.status;
    const signInErrorMessage = signInAttempt.error.message ?? "";
    const isUserNotFound =
      signInErrorCode === "invalid_credentials" ||
      /invalid login credentials|user not found|email not confirmed/i.test(
        signInErrorMessage,
      );

    if (!isUserNotFound) {
      logger.error("createAuthSession: sign-in failed for a non-user-not-found reason", {
        code: signInErrorCode,
        message: signInErrorMessage,
      });
      throw new AppError("INTERNAL_ERROR", "Failed to authenticate with Supabase", {
        statusCode: 500,
      });
    }
  }

  let adminClient: ReturnType<typeof createAdminClient>;
  try {
    adminClient = createAdminClient();
  } catch (err) {
    logger.error("createAuthSession: admin client unavailable for new user", {
      error: err instanceof Error ? err.message : "Unknown error",
    });
    throw new AppError(
      "INTERNAL_ERROR",
      "Failed to create user account — Supabase service role is not configured",
      { statusCode: 500 },
    );
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  });

  if (createError || !created?.user) {
    // If the user was created concurrently, fall back to sign-in.
    const alreadyExists =
      createError?.status === 422 ||
      /already registered|already been registered|email.*exist|duplicate/i.test(
        createError?.message ?? "",
      );

    if (alreadyExists) {
      const retry = await signInClient.auth.signInWithPassword({ email, password });
      if (retry.error || !retry.data.session || !retry.data.user) {
        logger.error("createAuthSession: failed to sign in after concurrent create", {
          error: retry.error?.message,
        });
        throw new AppError("INTERNAL_ERROR", "Failed to create session", {
          statusCode: 500,
        });
      }
      const retrySession = retry.data.session;
      return {
        session: {
          accessToken: retrySession.access_token,
          refreshToken: retrySession.refresh_token,
          expiresIn: retrySession.expires_in ?? 3600,
          expiresAt: retrySession.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: retry.data.user.id,
            telegramUserId: telegramUser.id,
            displayName: telegramUser.first_name,
            username: telegramUser.username,
            role: "user",
          },
        },
        isNewUser: false,
      };
    }

    logger.error("createAuthSession: failed to create auth user", {
      error: createError?.message,
      status: createError?.status,
    });
    throw new AppError("INTERNAL_ERROR", "Failed to create user account", {
      statusCode: 500,
    });
  }

  const authUserId = created.user.id;

  // ==========================================================================
  // Step 3: Upsert the application user in public.users with matching ID.
  // ==========================================================================
  const { error: upsertError } = await adminClient
    .from("users")
    .upsert(
      {
        id: authUserId, // Same UUID as Supabase Auth user
        telegram_user_id: telegramUser.id,
        telegram_username: telegramUser.username || null,
        display_name: telegramUser.first_name,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name || null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (upsertError) {
    logger.error("createAuthSession: failed to upsert application user", {
      error: upsertError.message,
    });

    // If we created an auth user but failed to upsert, clean up
    await adminClient.auth.admin.deleteUser(authUserId).catch(() => {});
    throw new AppError("INTERNAL_ERROR", "Failed to create user profile", {
      statusCode: 500,
    });
  }

  // ==========================================================================
  // Step 4: Sign in with password to get a Supabase session.
  // ==========================================================================
  const { data: signInData, error: signInError } = await signInClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData.session) {
    logger.error("createAuthSession: failed to create Supabase session", {
      error: signInError?.message,
    });
    throw new AppError("INTERNAL_ERROR", "Failed to create session", {
      statusCode: 500,
    });
  }

  const session = signInData.session;

  return {
    session: {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in ?? 3600,
      expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: authUserId,
        telegramUserId: telegramUser.id,
        displayName: telegramUser.first_name,
        username: telegramUser.username,
        role: "user",
      },
    },
    isNewUser: true,
  };
}

/**
 * Check if a user needs onboarding (has no profile data).
 *
 * Best-effort: if the profile query fails (e.g. service-role key unavailable),
 * we return true (assume onboarding is needed) rather than throwing, so
 * authentication is never blocked by this secondary check.
 */
export async function checkOnboardingStatus(userId: string): Promise<boolean> {
  try {
    const adminClient = createAdminClient();

    // Check if the user has a profile with the basics
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, bio, date_of_birth, gender")
      .eq("user_id", userId)
      .single();

    if (!profile) return true;

    // If any of these are missing, onboarding is needed
    return !profile.bio || !profile.date_of_birth || !profile.gender;
  } catch (err) {
    logger.warn("checkOnboardingStatus: skipped (best-effort, assuming onboarding needed)", {
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return true;
  }
}
