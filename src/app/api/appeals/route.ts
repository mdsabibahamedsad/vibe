/**
 * POST /api/appeals — Submit an appeal (user-facing)
 * GET /api/appeals — Get user's appeals
 *
 * This is the user-facing endpoint for appeals.
 * Users can submit appeals against moderation actions that apply to them.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createAppeal, getUserAppeals } from "@/lib/admin/appeal.service";
import { AppError, authorizationError } from "@/lib/errors";
import { z } from "zod";

const createAppealSchema = z.object({
  moderationActionId: z.string().uuid("Invalid moderation action ID"),
  reason: z
    .string()
    .min(10, "Appeal reason must be at least 10 characters")
    .max(2000, "Appeal reason must be under 2000 characters"),
});

/**
 * POST /api/appeals — Submit a new appeal
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    const body = await request.json();
    const parsed = createAppealSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid input",
        },
        { status: 400 },
      );
    }

    await createAppeal(user.id, parsed.data.moderationActionId, parsed.data.reason);

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode },
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to submit appeal" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/appeals — Get current user's appeals
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const appeals = await getUserAppeals(user.id);

    return NextResponse.json({ success: true, data: { items: appeals } });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode },
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to fetch appeals" },
      { status: 500 },
    );
  }
}
