import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { deactivateAccount } from "@/lib/services/profile-service";
import { AppError } from "@/lib/errors";

/**
 * POST /api/profile/deactivate — Deactivate the current user's account.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    await deactivateAccount(user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.toSafeResponse().error },
        { status: error.statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to deactivate account" }, { status: 500 });
  }
}
