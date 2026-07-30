import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, validationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  MAX_STORY_IMAGE_SIZE_BYTES,
  MAX_STORY_VIDEO_SIZE_BYTES,
  MAX_STORY_VIDEO_DURATION_SECONDS,
  ALLOWED_STORY_IMAGE_TYPES,
  ALLOWED_STORY_VIDEO_TYPES,
} from "@/lib/stories/constants";

/**
 * POST /api/stories/media — Upload media for a story
 *
 * Creates a media record in the database without storing the file itself.
 * In Phase 1, this expects a Telegram file_id or Supabase storage path.
 *
 * This route handles:
 *   - Multipart form upload (file + mediaType)
 *   - File validation (MIME, size)
 *   - Media record creation
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    // Parse the form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const mediaType = formData.get("mediaType") as string | null;

    if (!file || !mediaType) {
      return NextResponse.json(
        { error: "File and mediaType are required" },
        { status: 400 },
      );
    }

    if (mediaType !== "image" && mediaType !== "video") {
      return NextResponse.json(
        { error: "mediaType must be 'image' or 'video'" },
        { status: 400 },
      );
    }

    // Validate MIME type
    const allowedTypes =
      mediaType === "image"
        ? [...ALLOWED_STORY_IMAGE_TYPES]
        : [...ALLOWED_STORY_VIDEO_TYPES];

    if (!(allowedTypes as readonly string[]).includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type. Allowed: ${allowedTypes.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Validate file size
    const maxSize =
      mediaType === "image"
        ? MAX_STORY_IMAGE_SIZE_BYTES
        : MAX_STORY_VIDEO_SIZE_BYTES;

    if (file.size > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      return NextResponse.json(
        {
          error: `File too large. Maximum size: ${maxSizeMB}MB`,
        },
        { status: 400 },
      );
    }

    // For video, we'd need to check duration server-side
    // In Phase 1, we store the file reference and trust the client-reported type
    // Duration validation should happen via FFmpeg in Phase 2

    // Create a media record (Phase 1: using Telegram storage)
    // For Phase 1, we store as 'supabase' provider with a placeholder path
    // In production, this would upload to Supabase Storage or Telegram
    const adminClient = createAdminClient();

    // For now, we create a media record with processing status 'ready'
    // In production, this would involve uploading the file to storage
    const { data: mediaRecord, error: mediaError } = await adminClient
      .from("media")
      .insert({
        owner_id: user.id,
        media_type: mediaType,
        storage_provider: "telegram",
        provider_file_id: `story_${user.id}_${Date.now()}`,
        mime_type: file.type,
        file_size: file.size,
        processing_status: "ready",
      })
      .select()
      .single();

    if (mediaError || !mediaRecord) {
      logger.error("Failed to create story media record", {
        error: mediaError?.message,
      });
      throw new AppError("INTERNAL_ERROR", "Failed to save media", {
        statusCode: 500,
      });
    }

    return NextResponse.json({ media: mediaRecord }, { status: 201 });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to upload media" }, { status: 500 });
  }
}
