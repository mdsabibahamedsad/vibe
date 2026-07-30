/**
 * Chat Upload Service — upload media for chat messages.
 *
 * Uses the existing media abstraction (media table) so the chat UI
 * doesn't know whether media is stored in Telegram, Supabase, or CDN.
 *
 * This is a thin wrapper that creates a media record and returns the ID
 * so it can be attached to a message.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, validationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  ALLOWED_CHAT_IMAGE_TYPES,
  ALLOWED_CHAT_VIDEO_TYPES,
  MAX_CHAT_IMAGE_SIZE_BYTES,
  MAX_CHAT_VIDEO_SIZE_BYTES,
  MAX_CHAT_VIDEO_DURATION_SECONDS,
} from "@/lib/chat/constants";
import { RateLimiter } from "@/lib/rate-limiter";

const chatUploadRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  name: "chat_upload",
});

export interface ChatMediaUploadResult {
  id: string;
  mediaType: string;
  mimeType: string;
}

/**
 * Upload chat media by creating a media record.
 *
 * Server-side validates:
 *  - MIME type
 *  - File size
 *  - Video duration
 *  - Ownership
 *
 * The actual binary upload to storage happens separately (via
 * Telegram upload or Supabase Storage). This creates the metadata record.
 */
export async function uploadChatMedia(
  userId: string,
  data: {
    matchId: string;
    mediaType: "image" | "video";
    mimeType: string;
    fileSize?: number;
    width?: number;
    height?: number;
    durationSeconds?: number;
    storageProvider: string;
    providerFileId?: string;
    storagePath?: string;
  },
): Promise<ChatMediaUploadResult> {
  // Rate limit
  await chatUploadRateLimiter.enforce(userId);

  // Validate MIME type
  const allowedImageTypes = ALLOWED_CHAT_IMAGE_TYPES as readonly string[];
  const allowedVideoTypes = ALLOWED_CHAT_VIDEO_TYPES as readonly string[];

  if (data.mediaType === "image" && !allowedImageTypes.includes(data.mimeType)) {
    throw validationError("Invalid image format. Allowed: JPEG, PNG, WebP");
  }

  if (data.mediaType === "video" && !allowedVideoTypes.includes(data.mimeType)) {
    throw validationError("Invalid video format. Allowed: MP4, MOV, WebM");
  }

  // Validate file size
  if (data.fileSize) {
    if (data.mediaType === "image" && data.fileSize > MAX_CHAT_IMAGE_SIZE_BYTES) {
      throw validationError(
        `Image too large. Max ${Math.round(MAX_CHAT_IMAGE_SIZE_BYTES / (1024 * 1024))}MB`,
      );
    }

    if (data.mediaType === "video" && data.fileSize > MAX_CHAT_VIDEO_SIZE_BYTES) {
      throw validationError(
        `Video too large. Max ${Math.round(MAX_CHAT_VIDEO_SIZE_BYTES / (1024 * 1024))}MB`,
      );
    }
  }

  // Validate video duration
  if (data.mediaType === "video" && data.durationSeconds) {
    if (data.durationSeconds > MAX_CHAT_VIDEO_DURATION_SECONDS) {
      throw validationError(
        `Video too long. Max ${MAX_CHAT_VIDEO_DURATION_SECONDS} seconds`,
      );
    }
  }

  // Create media record
  const adminClient = createAdminClient();

  const { data: mediaRecord, error: mediaError } = await adminClient
    .from("media")
    .insert({
      owner_id: userId,
      media_type: data.mediaType,
      storage_provider: data.storageProvider,
      provider_file_id: data.providerFileId ?? null,
      storage_path: data.storagePath ?? null,
      mime_type: data.mimeType,
      file_size: data.fileSize ?? null,
      width: data.width ?? null,
      height: data.height ?? null,
      duration_seconds: data.durationSeconds ?? null,
      processing_status: "ready",
    })
    .select()
    .single();

  if (mediaError || !mediaRecord) {
    logger.error("Failed to create chat media record", {
      error: mediaError?.message,
    });
    throw new AppError("INTERNAL_ERROR", "Failed to save media", {
      statusCode: 500,
    });
  }

  return {
    id: mediaRecord.id,
    mediaType: mediaRecord.media_type,
    mimeType: mediaRecord.mime_type,
  };
}
