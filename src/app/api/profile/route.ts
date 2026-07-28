import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getProfile, upsertProfile, updateProfile } from "@/lib/services/profile-service";
import { profileSchema, profileUpdateSchema } from "@/lib/validation/profile";
import { AppError } from "@/lib/errors";

/**
 * GET /api/profile — Get the current user's profile.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const profile = await getProfile(user.id);

    if (!profile) {
      return NextResponse.json({ profile: null }, { status: 200 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.toSafeResponse().error },
        { status: error.statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to get profile" }, { status: 500 });
  }
}

/**
 * PUT /api/profile — Create or update the current user's profile.
 */
export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const profile = await upsertProfile(user.id, parsed.data);
    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.toSafeResponse().error },
        { status: error.statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }
}

/**
 * PATCH /api/profile — Partially update the current user's profile.
 */
export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const parsed = profileUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const profile = await updateProfile(user.id, parsed.data);
    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.toSafeResponse().error },
        { status: error.statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
