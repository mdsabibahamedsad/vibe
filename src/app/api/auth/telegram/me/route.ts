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

    return NextResponse.json({
      user: {
        id: user.id,
        telegramUserId: user.telegramUserId,
        username: user.telegramUsername,
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        needsOnboarding,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.toSafeResponse().error },
        { status: error.statusCode },
      );
    }

    return NextResponse.json({ error: "Failed to get user info" }, { status: 500 });
  }
}
