import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { checkOnboardingStatus } from "@/lib/auth/supabase-auth";
import { AppError } from "@/lib/errors";

/**
 * GET /api/auth/telegram/me
 *
 * Get the currently authenticated user's profile info.
 * Requires a valid Authorization: Bearer <token> header.
 *
 * Response (200):
 *   {
 *     "user": {
 *       "id": "...",
 *       "telegramUserId": 12345,
 *       "username": "...",
 *       "displayName": "...",
 *       "needsOnboarding": false
 *     }
 *   }
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const needsOnboarding = await checkOnboardingStatus(user.id);

    const response = NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        telegramUserId: user.telegramUserId,
        username: user.telegramUsername,
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        needsOnboarding,
      },
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    // An absent/invalid session is an ordinary 401, never a 500.
    if (error instanceof AppError) {
      const status = error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
      return NextResponse.json(
        { authenticated: false, success: false, error: error.toSafeResponse().error },
        { status },
      );
    }

    return NextResponse.json(
      { authenticated: false, success: false, error: "Failed to get user info" },
      { status: 500 },
    );
  }
}
