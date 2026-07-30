/**
 * POST /api/media/upload — Unified media upload endpoint.
 *
 * Accepts:
 *   multipart/form-data with:
 *     - file: File (image or video)
 *     - purpose: string (profile, post, story, message, avatar)
 *     - entityType: string (optional)
 *     - entityId: string (optional)
 *
 * Returns:
 *   { success: true, media: MediaUploadResult }
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { uploadMedia } from "@/lib/media/media.service";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { ALLOWED_MEDIA_PURPOSES } from "@/lib/media/constants";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const purpose = (formData.get("purpose") as string) || "post";
    const entityType = (formData.get("entityType") as string) || null;
    const entityId = (formData.get("entityId") as string) || null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 },
      );
    }

    // Validate purpose
    if (!ALLOWED_MEDIA_PURPOSES.includes(purpose as any)) {
      return NextResponse.json(
        { success: false, error: `Invalid purpose. Allowed: ${ALLOWED_MEDIA_PURPOSES.join(", ")}` },
        { status: 400 },
      );
    }

    // Determine media type from MIME
    const mimeType = file.type || "application/octet-stream";
    const isImage = mimeType.startsWith("image/");
    const isVideo = mimeType.startsWith("video/");

    if (!isImage && !isVideo) {
      return NextResponse.json(
        { success: false, error: "Unsupported file type. Only images and videos are allowed." },
        { status: 400 },
      );
    }

    const mediaType = isImage ? "image" : "video";

    // Read file bytes
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    const result = await uploadMedia({
      ownerId: user.id,
      purpose,
      mediaType: mediaType as "image" | "video",
      mimeType,
      fileSize: file.size,
      data,
      entityType: entityType ?? undefined,
      entityId: entityId ?? undefined,
    });

    return NextResponse.json({ success: true, media: result });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode || 400 },
      );
    }

    logger.error("Media upload failed", {
      error: err instanceof Error ? err.message : "Unknown",
    });

    return NextResponse.json(
      { success: false, error: "Upload failed" },
      { status: 500 },
    );
  }
}
