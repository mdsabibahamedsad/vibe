import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getPreferences, upsertPreferences } from "@/lib/services/profile-service";
import { preferencesSchema } from "@/lib/validation/profile";
import { AppError } from "@/lib/errors";

/**
 * GET /api/profile/preferences — Get discovery preferences.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const preferences = await getPreferences(user.id);

    return NextResponse.json({ preferences });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.toSafeResponse().error },
        { status: error.statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to get preferences" }, { status: 500 });
  }
}

/**
 * PUT /api/profile/preferences — Create or update discovery preferences.
 */
export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const parsed = preferencesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const preferences = await upsertPreferences(user.id, parsed.data);
    return NextResponse.json({ preferences });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.toSafeResponse().error },
        { status: error.statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to save preferences" }, { status: 500 });
  }
}
