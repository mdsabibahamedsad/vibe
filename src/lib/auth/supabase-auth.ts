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

  let isNewUser = false;

  // Use admin client for auth user management (service role)
  const adminClient = createAdminClient();

  // Step 1: Try to find existing auth user by email
  const { data: existingUsers, error: listError } = await adminClient.auth.admin.listUsers();

  if (listError) {
    logger.error("Failed to list Supabase Auth users", {
      error: listError.message,
    });
    throw new AppError("INTERNAL_ERROR", "Authentication service unavailable", {
      statusCode: 500,
    });
  }

  const existingUser = existingUsers.users.find((u) => u.email === email);

  let authUserId: string;

  if (existingUser) {
    // User exists — update metadata if needed
    authUserId = existingUser.id;

    await adminClient.auth.admin.updateUserById(authUserId, {
      user_metadata: {
        telegram_user_id: telegramUser.id,
        telegram_username: telegramUser.username || null,
        telegram_first_name: telegramUser.first_name,
        telegram_last_name: telegramUser.last_name || null,
      },
    });
  } else {
    // Create new auth user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        telegram_user_id: telegramUser.id,
        telegram_username: telegramUser.username || null,
        telegram_first_name: telegramUser.first_name,
        telegram_last_name: telegramUser.last_name || null,
      },
    });

    if (createError || !newUser.user) {
      logger.error("Failed to create Supabase Auth user", {
        error: createError?.message,
      });
      throw new AppError("INTERNAL_ERROR", "Failed to create user account", {
        statusCode: 500,
      });
    }

    authUserId = newUser.user.id;
    isNewUser = true;
  }

  // Step 2: Upsert application user in public.users with matching ID
  const { error: upsertError } = await adminClient.from("users").upsert(
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
    logger.error("Failed to upsert application user", {
      error: upsertError.message,
    });

    // If we created an auth user but failed to upsert, clean up
    if (isNewUser) {
      await adminClient.auth.admin.deleteUser(authUserId).catch(() => {});
    }

    throw new AppError("INTERNAL_ERROR", "Failed to create user profile", {
      statusCode: 500,
    });
  }

  // Step 3: Sign in with password to get a Supabase session
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const signInClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  const { data: signInData, error: signInError } = await signInClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData.session) {
    logger.error("Failed to create Supabase session", {
      error: signInError?.message,
    });
    throw new AppError("INTERNAL_ERROR", "Failed to create session", {
      statusCode: 500,
    });
  }

  const session = signInData.session;

  // Step 4: Look up user role
  let userRole = "user";
  const { data: appUser } = await adminClient
    .from("users")
    .select("role")
    .eq("id", authUserId)
    .single();

  if (appUser) {
    userRole = appUser.role;
  }

  // Step 5: Return session info to client
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
    isNewUser,
  };
}

/**
 * Check if a user needs onboarding (has no profile data).
 */
export async function checkOnboardingStatus(userId: string): Promise<boolean> {
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
}
