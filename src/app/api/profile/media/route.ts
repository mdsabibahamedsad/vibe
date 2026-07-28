import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  addProfileMedia,
  deleteProfileMedia,
  getProfileMedia,
  reorderProfileMedia,
  setPrimaryPhoto,
} from "@/lib/services/media-service";
import { mediaUploadSchema, mediaReorderSchema } from "@/lib/validation/profile";
import { AppError } from "@/lib/errors";

/**
 * GET /api/profile/media — Get all profile photos for the current user.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const media = await getProfileMedia(user.id);
    return NextResponse.json({ media });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.toSafeResponse().error },
        { status: error.statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to get media" }, { status: 500 });
  }
}

/**
 * POST /api/profile/media — Add a new profile photo.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const parsed = mediaUploadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const media = await addProfileMedia(user.id, parsed.data);
    return NextResponse.json({ media }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.toSafeResponse().error },
        { status: error.statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to add media" }, { status: 500 });
  }
}

/**
 * PUT /api/profile/media — Reorder profile photos.
 */
export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const parsed = mediaReorderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const media = await reorderProfileMedia(user.id, parsed.data.items);
    return NextResponse.json({ media });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.toSafeResponse().error },
        { status: error.statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to reorder media" }, { status: 500 });
  }
}

/**
 * DELETE /api/profile/media — Delete a profile photo.
 * Query param: ?id=<photoId>
 */
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const photoId = searchParams.get("id");

    if (!photoId) {
      return NextResponse.json({ error: "Missing photo ID" }, { status: 400 });
    }

    await deleteProfileMedia(user.id, photoId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.toSafeResponse().error },
        { status: error.statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to delete media" }, { status: 500 });
  }
}

/**
 * PATCH /api/profile/media — Set primary photo.
 * Body: { "photoId": "..." }
 */
export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    if (!body.photoId) {
      return NextResponse.json({ error: "Missing photoId" }, { status: 400 });
    }

    const media = await setPrimaryPhoto(user.id, body.photoId);
    return NextResponse.json({ media });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.toSafeResponse().error },
        { status: error.statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to set primary photo" }, { status: 500 });
  }
}
