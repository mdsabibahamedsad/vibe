import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getAllInterests, setProfileInterests } from "@/lib/services/profile-service";
import { interestSelectionSchema } from "@/lib/validation/profile";
import { AppError } from "@/lib/errors";

/**
 * GET /api/interests — Get all available interests.
 */
export async function GET() {
  try {
    const interests = await getAllInterests();
    return NextResponse.json({ interests });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.toSafeResponse().error },
        { status: error.statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to load interests" }, { status: 500 });
  }
}

/**
 * PUT /api/interests — Set profile interests for the current user.
 */
export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const parsed = interestSelectionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const interests = await setProfileInterests(user.id, parsed.data);
    return NextResponse.json({ interests });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.toSafeResponse().error },
        { status: error.statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to save interests" }, { status: 500 });
  }
}
