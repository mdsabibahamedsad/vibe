/**
 * Unified Media Service — central media operations.
 *
 * This is the single entry point for all media operations:
 *   uploadMedia()    — Create media record + storage
 *   getMediaUrl()    — Get optimal URL for a media ID + variant
 *   getMediaAccess() — Full access check + URL resolution
 *   deleteMedia()    — Delete + cleanup
 *   cleanupOrphaned()— Remove unattached media
 *
 * All feature-specific upload code (profile, story, chat) should
 * migrate to use this service.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, validationError, authorizationError, notFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";
import { RateLimiter } from "@/lib/rate-limiter";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  ORPHAN_MEDIA_GRACE_PERIOD_HOURS,
  MEDIA_ERROR_CODES,
  DERIVATIVE_TYPES,
  DERIVATIVE_CONFIG,
  CACHE_CONTROL_IMMUTABLE,
  CACHE_CONTROL_PRIVATE,
  STORAGE_BUCKET_PRIVATE,
  STORAGE_BUCKET_PUBLIC,
  UPLOAD_RATE_LIMIT_PER_MINUTE,
} from "@/lib/media/constants";
import { getProvider, registerProvider } from "@/lib/media/providers/storage-provider.interface";
import { SupabaseStorageProvider } from "@/lib/media/providers/supabase-storage.provider";
import { TelegramMediaProvider } from "@/lib/media/providers/telegram-media.provider";
import type { MediaUploadResult, MediaAccessResult, MediaDerivativeResult, MediaRecord } from "@/lib/media/schemas";
import type { DerivativeType } from "@/lib/media/constants";

// ─── Register providers on first import ─────────────────────────────────

registerProvider("supabase", new SupabaseStorageProvider());
registerProvider("telegram", new TelegramMediaProvider());

// ─── Rate Limiter ────────────────────────────────────────────────────────

const uploadRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: UPLOAD_RATE_LIMIT_PER_MINUTE,
  name: "media_upload",
});

// ─── Upload Media ────────────────────────────────────────────────────────

export interface UploadMediaParams {
  ownerId: string;
  purpose: string;
  mediaType: "image" | "video";
  mimeType: string;
  fileSize?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  storageProvider?: string;
  providerFileId?: string;
  storagePath?: string;
  entityType?: string;
  entityId?: string;
  data?: Buffer | Uint8Array | Blob;
}

/**
 * Upload media through the storage provider and create a database record.
 *
 * Steps:
 *  1. Validate inputs (MIME, size, purpose)
 *  2. Rate limit
 *  3. Generate server-side storage key
 *  4. Upload binary data to storage provider (if provided)
 *  5. Create media record in database
 *  6. Create media_usage record (if entityType/entityId provided)
 *  7. Create processing job for derivatives
 *  8. Return upload result with URLs
 */
export async function uploadMedia(params: UploadMediaParams): Promise<MediaUploadResult> {
  // ─── Rate limit ─────────────────────────────────────────────────────
  await uploadRateLimiter.enforce(params.ownerId);

  // ─── Validate MIME type ────────────────────────────────────────────
  const allowedImageMimes = ALLOWED_IMAGE_MIME_TYPES as readonly string[];
  const allowedVideoMimes = ALLOWED_VIDEO_MIME_TYPES as readonly string[];

  if (params.mediaType === "image" && !allowedImageMimes.includes(params.mimeType as any)) {
    throw validationError(
      `Unsupported image type. Allowed: ${ALLOWED_IMAGE_MIME_TYPES.join(", ")}`,
    );
  }

  if (params.mediaType === "video" && !allowedVideoMimes.includes(params.mimeType as any)) {
    throw validationError(
      `Unsupported video type. Allowed: ${ALLOWED_VIDEO_MIME_TYPES.join(", ")}`,
    );
  }

  // ─── Validate file size ────────────────────────────────────────────
  const maxSize = params.mediaType === "image"
    ? MAX_IMAGE_UPLOAD_BYTES
    : MAX_VIDEO_UPLOAD_BYTES;

  if (params.fileSize && params.fileSize > maxSize) {
    throw validationError(
      `${params.mediaType === "image" ? "Image" : "Video"} too large. Max: ${Math.round(maxSize / (1024 * 1024))}MB`,
    );
  }

  // ─── Generate storage key ──────────────────────────────────────────
  const mediaId = crypto.randomUUID();
  const fileExtension = params.mimeType.split("/").pop() || "bin";
  const storageKey = `users/${params.ownerId}/${mediaId}/original.${fileExtension}`;

  // ─── Upload to storage provider ────────────────────────────────────
  const provider = params.storageProvider || "telegram";
  let uploadResult;

  try {
    const storageProvider = getProvider(provider);
    const bucket = params.purpose === "message" || params.purpose === "profile"
      ? STORAGE_BUCKET_PRIVATE
      : STORAGE_BUCKET_PUBLIC;

    if (params.data) {
      uploadResult = await storageProvider.upload(params.data, storageKey, params.mimeType, {
        bucket,
      });
    } else {
      // No binary data — reference-only upload (Telegram file_id)
      uploadResult = await storageProvider.upload(
        new Uint8Array(0),
        storageKey,
        params.mimeType,
        { bucket: params.providerFileId || storageKey },
      );
    }
  } catch (err) {
    logger.error("Storage upload failed", {
      provider,
      error: err instanceof Error ? err.message : "Unknown",
    });
    throw new AppError("INTERNAL_ERROR", "Failed to upload media to storage", {
      statusCode: 500,
    });
  }

  // ─── Create media record ───────────────────────────────────────────
  const adminClient = createAdminClient();

  const { data: mediaRecord, error: dbError } = await adminClient
    .from("media")
    .insert({
      id: mediaId,
      owner_id: params.ownerId,
      media_type: params.mediaType,
      storage_provider: provider,
      provider_file_id: uploadResult.providerFileId ?? params.providerFileId ?? null,
      storage_path: uploadResult.storageKey ?? params.storagePath ?? null,
      mime_type: params.mimeType,
      file_size: params.fileSize ?? null,
      width: params.width ?? null,
      height: params.height ?? null,
      duration_seconds: params.durationSeconds ?? null,
      processing_status: "pending",
      visibility: params.purpose === "message" ? "private" : "public",
    })
    .select()
    .single();

  if (dbError || !mediaRecord) {
    logger.error("Failed to create media record", { error: dbError?.message });
    throw new AppError("INTERNAL_ERROR", "Failed to save media metadata", {
      statusCode: 500,
    });
  }

  // ─── Create media_usage record ─────────────────────────────────────
  if (params.entityType && params.entityId) {
    try {
      await adminClient.rpc("record_media_usage", {
        p_media_id: mediaId,
        p_owner_id: params.ownerId,
        p_entity_type: params.entityType,
        p_entity_id: params.entityId,
        p_purpose: params.purpose,
      });
    } catch {
      // Non-critical — media record already exists
    }
  }

  // ─── Create processing job ─────────────────────────────────────────
  if (params.mediaType === "image") {
    try {
      await adminClient.from("media_processing_jobs").insert({
        media_id: mediaId,
        job_type: "image_optimize",
        max_attempts: 3,
      });
    } catch {
      // Non-critical — job creation is best-effort
    }
  }

  // ─── Track analytics ───────────────────────────────────────────────
  await trackEvent(params.ownerId, "media_upload_completed", "media", mediaId, {
    mediaType: params.mediaType,
    purpose: params.purpose,
    storageProvider: provider,
  }).catch(() => {});

  return {
    id: mediaId,
    mediaType: mediaRecord.media_type,
    mimeType: mediaRecord.mime_type,
    processingStatus: mediaRecord.processing_status,
    url: getProvider(provider).getPublicUrl(storageKey),
    thumbnailUrl: null,
    derivatives: [],
  };
}

// ─── Get Media URL ───────────────────────────────────────────────────────

/**
 * Get the best URL for a media object.
 *
 * @param mediaId - The media record ID
 * @param derivative - Optional derivative type (thumbnail, small, medium, large)
 * @param currentUserId - Optional: for private media access check
 * @returns The resolved URL and metadata
 */
export async function getMediaUrl(
  mediaId: string,
  derivative?: DerivativeType,
  currentUserId?: string,
): Promise<MediaAccessResult> {
  const adminClient = createAdminClient();

  const { data: media } = await adminClient
    .from("media")
    .select("*")
    .eq("id", mediaId)
    .single();

  if (!media || media.deleted_at) {
    throw notFoundError("Media not found");
  }

  // ─── Access check for private media ─────────────────────────────────
  if (media.visibility === "private" && currentUserId) {
    const isOwner = media.owner_id === currentUserId;
    const isModerator = await checkIsModerator(currentUserId);

    if (!isOwner && !isModerator) {
      // Resolve conversation IDs the user has access to
      let accessCount = 0;

      try {
        const { data: memberConversations } = await adminClient
          .from("conversation_members")
          .select("conversation_id")
          .eq("user_id", currentUserId);

        if (memberConversations && memberConversations.length > 0) {
          const conversationIds = memberConversations.map((r) => r.conversation_id);

          const { data: matchingMessages } = await adminClient
            .from("messages")
            .select("id")
            .in("conversation_id", conversationIds);

          if (matchingMessages && matchingMessages.length > 0) {
            const messageIds = matchingMessages.map((m) => m.id);

            const { count } = await adminClient
              .from("message_attachments")
              .select("*", { count: "exact", head: true })
              .eq("media_id", mediaId)
              .in("message_id", messageIds);

            accessCount = count ?? 0;
          }
        }
      } catch {
        // If query fails, deny access
      }

      if (accessCount === 0) {
        throw authorizationError("You do not have access to this media");
      }
    }
  }

  // ─── Check processing status ────────────────────────────────────────
  if (media.processing_status !== "ready" && media.processing_status !== "uploaded") {
    throw new AppError("VALIDATION_ERROR", MEDIA_ERROR_CODES.NOT_READY, {
      statusCode: 425, // Too Early
    });
  }

  const provider = getProvider(media.storage_provider);

  // ─── If derivative requested, try to find it ─────────────────────────
  if (derivative) {
    const { data: derivRecord } = await adminClient
      .from("media_derivatives")
      .select("*")
      .eq("media_id", mediaId)
      .eq("derivative_type", derivative)
      .single();

    if (derivRecord) {
      const url = await provider.getSignedUrl(derivRecord.storage_key, 3600);
      return {
        url,
        derivative,
        mimeType: derivRecord.mime_type,
        width: derivRecord.width,
        height: derivRecord.height,
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      };
    }

    // Fallback: try the public URL of the original
    const publicUrl = provider.getPublicUrl(media.storage_path ?? "");
    return {
      url: publicUrl || `/api/media/${mediaId}`,
      derivative,
      mimeType: media.mime_type,
      width: media.width,
      height: media.height,
      expiresAt: null,
    };
  }

  // ─── No derivative — return original URL ────────────────────────────
  if (media.storage_path) {
    const url = await provider.getSignedUrl(media.storage_path, 3600);
    return {
      url,
      derivative: null,
      mimeType: media.mime_type,
      width: media.width,
      height: media.height,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
  }

  // Fallback
  return {
    url: `/api/media/${mediaId}`,
    derivative: null,
    mimeType: media.mime_type,
    width: media.width,
    height: media.height,
    expiresAt: null,
  };
}

// ─── Delete Media ───────────────────────────────────────────────────────

/**
 * Delete a media object (soft-delete DB record + try to remove from storage).
 * Only the owner or a moderator can delete.
 */
export async function deleteMedia(mediaId: string, userId: string): Promise<void> {
  const adminClient = createAdminClient();

  const { data: media } = await adminClient
    .from("media")
    .select("*")
    .eq("id", mediaId)
    .single();

  if (!media) throw notFoundError("Media not found");
  if (media.owner_id !== userId) {
    const isModerator = await checkIsModerator(userId);
    if (!isModerator) {
      throw authorizationError("You can only delete your own media");
    }
  }

  // Soft-delete in database
  const { error } = await adminClient
    .from("media")
    .update({
      deleted_at: new Date().toISOString(),
      processing_status: "deleted",
    })
    .eq("id", mediaId);

  if (error) {
    logger.error("Failed to soft-delete media", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to delete media", { statusCode: 500 });
  }

  // Try to remove from storage
  if (media.storage_path) {
    try {
      const provider = getProvider(media.storage_provider);
      await provider.delete(media.storage_path);
    } catch {
      // Non-critical — storage cleanup is best-effort
    }
  }

  await trackEvent(userId, "media_deleted", "media", mediaId).catch(() => {});
}

// ─── Cleanup Orphaned Media ─────────────────────────────────────────────

/**
 * Remove media that has no usage references and is past the grace period.
 * Returns the count of cleaned media records.
 */
export async function cleanupOrphanedMedia(): Promise<{
  deleted: number;
}> {
  const adminClient = createAdminClient();

  const { data: count } = await adminClient.rpc("cleanup_orphaned_media", {
    p_grace_period_hours: ORPHAN_MEDIA_GRACE_PERIOD_HOURS,
  });

  const deletedCount = (count ?? 0) as number;

  if (deletedCount > 0) {
    logger.info("Orphaned media cleanup completed", { deleted: deletedCount });
  }

  return { deleted: deletedCount };
}

// ─── Get Cache Headers ──────────────────────────────────────────────────

/**
 * Get appropriate Cache-Control headers for a media file.
 */
export function getMediaCacheHeaders(
  visibility: string,
  version: number = 1,
): Record<string, string> {
  if (visibility === "private") {
    return { "Cache-Control": CACHE_CONTROL_PRIVATE };
  }

  // Public media with versioning can use immutable caching
  return {
    "Cache-Control": `public, max-age=31536000, immutable`,
    "ETag": `"v${version}"`,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────

async function checkIsModerator(userId: string): Promise<boolean> {
  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  return profile?.role === "moderator" || profile?.role === "admin" || profile?.role === "super_admin";
}
