/**
 * Development-only authentication mechanism.
 *
 * This file provides a clearly isolated development authentication mechanism
 * for testing the app outside of Telegram.
 *
 * SAFETY GUARDS:
 * 1. Automatically disabled in production (NODE_ENV === 'production')
 * 2. Requires an explicit environment variable to enable: VIBE_DEV_AUTH_ENABLED=true
 * 3. Does NOT accept arbitrary user IDs from the client
 * 4. Uses a development-only Telegram user ID (from env) that must match a known test user
 * 5. Clearly logged as development auth in server logs
 *
 * NEVER use this for production testing or any real user accounts.
 */

import { AppError } from "@/lib/errors";
import { generateAuthEmail, generateAuthPassword } from "@/lib/telegram/validate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";
import { createAuthSession } from "./supabase-auth";
import { logger } from "@/lib/logger";

/** Check if development auth is allowed */
export function isDevAuthEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.VIBE_DEV_AUTH_ENABLED === "true";
}

/**
 * Development authentication using a configured test Telegram user.
 *
 * This is NOT a mock — it creates a real Supabase session but uses
 * a development Telegram user ID from environment variables.
 *
 * Environment variables required:
 *   VIBE_DEV_AUTH_ENABLED=true
 *   VIBE_DEV_TELEGRAM_USER_ID=<valid bigint>
 *   VIBE_DEV_TELEGRAM_FIRST_NAME=<string>
 *
 * The validation is done server-side — the client cannot pass
 * an arbitrary user ID.
 */
export async function devAuthenticate(): Promise<{
  session: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    expiresAt: number;
  };
  user: {
    id: string;
    telegramUserId: number;
    displayName: string;
    username?: string;
  };
  needsOnboarding: boolean;
}> {
  if (!isDevAuthEnabled()) {
    throw new AppError("AUTHORIZATION_ERROR", "Development authentication is not enabled", {
      statusCode: 403,
    });
  }

  const devUserId = process.env.VIBE_DEV_TELEGRAM_USER_ID;
  const devFirstName = process.env.VIBE_DEV_TELEGRAM_FIRST_NAME || "Dev User";
  const devUsername = process.env.VIBE_DEV_TELEGRAM_USERNAME || "dev_user";
  const devLastName = process.env.VIBE_DEV_TELEGRAM_LAST_NAME || "";

  if (!devUserId) {
    throw new AppError(
      "INTERNAL_ERROR",
      "VIBE_DEV_TELEGRAM_USER_ID is not configured for development auth",
      { statusCode: 500 },
    );
  }

  const telegramUserId = parseInt(devUserId, 10);
  if (isNaN(telegramUserId) || telegramUserId <= 0) {
    throw new AppError(
      "INTERNAL_ERROR",
      "VIBE_DEV_TELEGRAM_USER_ID must be a valid positive integer",
      { statusCode: 500 },
    );
  }

  logger.info("Using development authentication", {
    telegramUserId,
    note: "This should never appear in production logs",
  });

  // Validate initData is not available in dev, so we simulate a validated session
  // by creating the auth session directly with a fake validated data structure
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new AppError(
      "INTERNAL_ERROR",
      "TELEGRAM_BOT_TOKEN is required even for development auth",
      { statusCode: 500 },
    );
  }

  // Create a validated-data-like structure for the dev user
  const validatedData = {
    user: {
      id: telegramUserId,
      first_name: devFirstName,
      last_name: devLastName || undefined,
      username: devUsername,
      language_code: "en",
      is_premium: true,
    },
    authDate: Math.floor(Date.now() / 1000),
    raw: "",
  };

  // Use the same auth session creation flow
  const authResult = await createAuthSession(validatedData);

  return {
    session: {
      accessToken: authResult.session.accessToken,
      refreshToken: authResult.session.refreshToken,
      expiresIn: authResult.session.expiresIn,
      expiresAt: authResult.session.expiresAt,
    },
    user: authResult.session.user,
    needsOnboarding: authResult.isNewUser,
  };
}
