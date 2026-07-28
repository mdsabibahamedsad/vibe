import { NextResponse } from "next/server";
import { isDevAuthEnabled, devAuthenticate } from "@/lib/auth/dev-auth";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * POST /api/auth/dev
 *
 * Development-only authentication endpoint.
 * NEVER accessible in production — returns 403 if VIBE_DEV_AUTH_ENABLED is not set.
 * Uses a configured development Telegram user from environment variables.
 */
export async function POST() {
  try {
    if (!isDevAuthEnabled()) {
      return NextResponse.json(
        {
          authenticated: false,
          error: "Development authentication is not enabled.",
        },
        { status: 403 },
      );
    }

    logger.info("Development auth endpoint called", {
      note: "This should only appear in development",
    });

    const result = await devAuthenticate();

    return NextResponse.json({
      authenticated: true,
      user: {
        id: result.user.id,
        telegramUserId: result.user.telegramUserId,
        username: result.user.username,
        displayName: result.user.displayName,
        needsOnboarding: result.needsOnboarding,
      },
      session: {
        accessToken: result.session.accessToken,
        refreshToken: result.session.refreshToken,
        expiresIn: result.session.expiresIn,
        expiresAt: result.session.expiresAt,
      },
      devMode: true,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        {
          authenticated: false,
          error: error.toSafeResponse().error,
        },
        { status: error.statusCode },
      );
    }

    logger.error("Unexpected dev auth error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      {
        authenticated: false,
        error: "An unexpected error occurred.",
      },
      { status: 500 },
    );
  }
}
