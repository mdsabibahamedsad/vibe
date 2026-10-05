import { NextResponse } from "next/server";
import { validateTelegramInitData } from "@/lib/telegram/validate";
import { createAuthSession, checkOnboardingStatus } from "@/lib/auth/supabase-auth";
import { authRateLimiter } from "@/lib/rate-limiter";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * POST /api/auth/telegram
 *
 * Authenticate a user via Telegram Mini App initData.
 *
 * Request body:
 *   { "initData": "<raw Telegram WebApp initData query string>" }
 *
 * Response (200):
 *   {
 *     "authenticated": true,
 *     "user": { ... },
 *     "session": { accessToken, refreshToken, ... },
 *     "needsOnboarding": boolean
 *   }
 *
 * Error responses:
 *   400 — Missing or malformed initData
 *   401 — Invalid Telegram authentication data
 *   429 — Rate limited
 *   500 — Internal server error
 */
export async function POST(request: Request) {
  try {
    // Rate limiting by IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const allowed = await authRateLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        {
          authenticated: false,
          error: "Too many requests. Please try again later.",
        },
        { status: 429 },
      );
    }

    // Parse request body
    const body = await request.json().catch(() => null);

    if (!body || typeof body.initData !== "string" || !body.initData) {
      return NextResponse.json(
        {
          authenticated: false,
          error: "Missing or invalid initData in request body.",
        },
        { status: 400 },
      );
    }

    const { initData } = body as { initData: string };

    // Do NOT accept the user ID separately — extract from validated initData
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      logger.error("TELEGRAM_BOT_TOKEN is not configured");
      return NextResponse.json(
        {
          authenticated: false,
          error: "Authentication service is not configured properly.",
        },
        { status: 500 },
      );
    }

    // Step 1: Validate the Telegram initData
    const validatedData = validateTelegramInitData(initData, botToken);

    // Log successful validation (no secrets)
    logger.info("Telegram initData validation successful", {
      telegramUserId: validatedData.user.id,
      username: validatedData.user.username,
    });

    // Step 2: Create/retrieve auth session
    const authResult = await createAuthSession(validatedData);

    // Step 3: Check onboarding status
    const needsOnboarding = await checkOnboardingStatus(authResult.session.user.id);

    // Step 4: Return authenticated response + establish the server-readable
    // session cookie. Returning tokens in JSON alone does NOT authenticate
    // the next request — the browser must retain a session artifact the
    // server can read. We set BOTH paths:
    //   1. `sb-auth-token` cookie (standard browser session path; read by
    //      getCurrentUser() from the Cookie header / cookie store), and
    //   2. tokens in JSON (client stores via Supabase setSession and sends
    //      as Authorization: Bearer — works where WebView cookies are blocked).
    // SameSite=None requires Secure (production HTTPS, incl. Telegram
    // WebView); plain-HTTP local dev falls back to Lax without Secure.
    const isProduction = process.env.NODE_ENV === "production";
    const cookieValue = JSON.stringify({
      access_token: authResult.session.accessToken,
      refresh_token: authResult.session.refreshToken,
      expires_in: authResult.session.expiresIn,
      expires_at: authResult.session.expiresAt,
    });
    const response = NextResponse.json({
      authenticated: true,
      user: {
        id: authResult.session.user.id,
        telegramUserId: authResult.session.user.telegramUserId,
        username: authResult.session.user.username,
        displayName: authResult.session.user.displayName,
        role: authResult.session.user.role,
        needsOnboarding,
      },
      session: {
        accessToken: authResult.session.accessToken,
        refreshToken: authResult.session.refreshToken,
        expiresIn: authResult.session.expiresIn,
        expiresAt: authResult.session.expiresAt,
      },
    });
    response.cookies.set("sb-auth-token", cookieValue, {
      httpOnly: false,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
      maxAge: authResult.session.expiresIn ?? 3600,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof AppError) {
      // Log detailed error server-side (without secrets)
      logger.warn("Authentication failed", {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
      });

      return NextResponse.json(
        {
          authenticated: false,
          error: error.toSafeResponse().error,
        },
        { status: error.statusCode },
      );
    }

    // Unexpected error — log and return generic message
    logger.error("Unexpected authentication error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      {
        authenticated: false,
        error: "An unexpected error occurred. Please try again later.",
      },
      { status: 500 },
    );
  }
}
