/**
 * Media service — server-side operations for profile photos and media.
 *
 * The service abstracts the storage provider (Telegram, Supabase, CDN)
 * from the UI components. The UI never needs to know where media is stored.
 *
 * Supported providers:
 *   - telegram: Store Telegram file_id references (Phase 1)
 *   - supabase: Upload to Supabase Storage (Phase 2)
 *   - external_cdn: Future CDN usage (Phase 3)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { MediaUploadInput } from "@/lib/validation/profile";

export interface MediaResult {
  id: string;
  mediaId: string | null;
  telegramFileId: string | null;
  sortOrder: number;
  isPrimary: boolean;
  mediaType?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

// ─── Upload / Add Profile Media ──────────────────────────────────────────

/**
 * Add a media file reference to the user's profile photos.
 *
 * Creates a record in the `media` table and links it in `profile_photos`.
 */
export async function addProfileMedia(
  userId: string,
  data: MediaUploadInput,
): Promise<MediaResult> {
  const adminClient = createAdminClient();

  // Count existing photos to enforce limits
  const { count: photoCount } = await adminClient
    .from("profile_photos")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (photoCount !== null && photoCount >= 10) {
    throw new AppError("VALIDATION_ERROR", "Maximum of 10 profile photos allowed", {
      statusCode: 400,
    });
  }

  // Create media record
  const { data: mediaRecord, error: mediaError } = await adminClient
    .from("media")
    .insert({
      owner_id: userId,
      media_type: data.mediaType,
      storage_provider: data.storageProvider,
      provider_file_id: data.providerFileId ?? null,
      storage_path: data.storagePath ?? null,
      mime_type: data.mimeType,
      file_size: data.fileSize,
      width: data.width ?? null,
      height: data.height ?? null,
      duration_seconds: data.durationSeconds ?? null,
      processing_status: "ready",
    })
    .select()
    .single();

  if (mediaError || !mediaRecord) {
    logger.error("Failed to create media record", { error: mediaError?.message });
    throw new AppError("INTERNAL_ERROR", "Failed to save media", {
      statusCode: 500,
    });
  }

  // Link to profile_photos
  const nextSortOrder = photoCount ?? 0;
  const isPrimary = photoCount === 0; // First photo is primary by default

  const { data: photoRecord, error: photoError } = await adminClient
    .from("profile_photos")
    .insert({
      user_id: userId,
      media_id: mediaRecord.id,
      telegram_file_id: data.providerFileId ?? null,
      sort_order: nextSortOrder,
      is_primary: isPrimary,
    })
    .select()
    .single();

  if (photoError || !photoRecord) {
    // Clean up the media record if photo link fails
    await adminClient.from("media").delete().eq("id", mediaRecord.id);
    logger.error("Failed to link profile photo", { error: photoError?.message });
    throw new AppError("INTERNAL_ERROR", "Failed to add profile photo", {
      statusCode: 500,
    });
  }

  return {
    id: photoRecord.id,
    mediaId: mediaRecord.id,
    telegramFileId: photoRecord.telegram_file_id,
    sortOrder: photoRecord.sort_order,
    isPrimary: photoRecord.is_primary,
    mediaType: mediaRecord.media_type,
    mimeType: mediaRecord.mime_type,
    width: mediaRecord.width,
    height: mediaRecord.height,
  };
}

// ─── Delete Profile Media ────────────────────────────────────────────────

/**
 * Remove a profile photo and its associated media record.
 */
export async function deleteProfileMedia(userId: string, photoId: string): Promise<void> {
  const adminClient = createAdminClient();

  // Verify ownership
  const { data: photo, error: findError } = await adminClient
    .from("profile_photos")
    .select("id, media_id, is_primary")
    .eq("id", photoId)
    .eq("user_id", userId)
    .single();

  if (findError || !photo) {
    throw new AppError("NOT_FOUND", "Photo not found", { statusCode: 404 });
  }

  // Delete the profile_photo record
  const { error: deletePhotoError } = await adminClient
    .from("profile_photos")
    .delete()
    .eq("id", photoId);

  if (deletePhotoError) {
    throw new AppError("INTERNAL_ERROR", "Failed to delete photo", {
      statusCode: 500,
    });
  } // Delete the media record
  if (photo.media_id) {
    try {
      await adminClient.from("media").delete().eq("id", photo.media_id);
    } catch {
      // Media record cleanup is best-effort
    }
  }

  // If the deleted photo was primary, set the first remaining photo as primary
  if (photo.is_primary) {
    const { data: remaining } = await adminClient
      .from("profile_photos")
      .select("id")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .limit(1);

    if (remaining && remaining.length > 0) {
      await adminClient
        .from("profile_photos")
        .update({ is_primary: true })
        .eq("id", remaining[0].id);
    }
  }

  // Re-index sort order
  await reindexSortOrder(userId);
}

// ─── Reorder Profile Media ───────────────────────────────────────────────

/**
 * Reorder profile photos and optionally set one as primary.
 */
export async function reorderProfileMedia(
  userId: string,
  items: { id: string; sortOrder: number }[],
): Promise<MediaResult[]> {
  const adminClient = createAdminClient();

  // Verify all items belong to the user
  for (const item of items) {
    const { error } = await adminClient
      .from("profile_photos")
      .update({ sort_order: item.sortOrder })
      .eq("id", item.id)
      .eq("user_id", userId);

    if (error) {
      throw new AppError("AUTHORIZATION_ERROR", "Cannot modify this photo", {
        statusCode: 403,
      });
    }
  }

  return getProfileMedia(userId);
}

// ─── Set Primary Photo ───────────────────────────────────────────────────

/**
 * Set a specific profile photo as the primary photo.
 */
export async function setPrimaryPhoto(userId: string, photoId: string): Promise<MediaResult[]> {
  const adminClient = createAdminClient();

  // Verify ownership
  const { data: photo } = await adminClient
    .from("profile_photos")
    .select("id")
    .eq("id", photoId)
    .eq("user_id", userId)
    .single();

  if (!photo) {
    throw new AppError("NOT_FOUND", "Photo not found", { statusCode: 404 });
  }

  // Remove primary from all photos
  await adminClient.from("profile_photos").update({ is_primary: false }).eq("user_id", userId);

  // Set the chosen photo as primary
  const { error } = await adminClient
    .from("profile_photos")
    .update({ is_primary: true })
    .eq("id", photoId);

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to set primary photo", {
      statusCode: 500,
    });
  }

  return getProfileMedia(userId);
}

// ─── Get Profile Media ───────────────────────────────────────────────────

/**
 * Get all profile photos for a user.
 */
export async function getProfileMedia(userId: string): Promise<MediaResult[]> {
  const adminClient = createAdminClient();

  const { data: photos } = await adminClient
    .from("profile_photos")
    .select("*, media:media_id(*)")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  return (photos ?? []).map((p) => ({
    id: p.id,
    mediaId: p.media_id,
    telegramFileId: p.telegram_file_id,
    sortOrder: p.sort_order,
    isPrimary: p.is_primary,
    mediaType: p.media?.media_type,
    mimeType: p.media?.mime_type,
    width: p.media?.width,
    height: p.media?.height,
  }));
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Re-index sort_order for all profile photos of a user
 * (ensures sequential ordering after deletions).
 */
async function reindexSortOrder(userId: string): Promise<void> {
  const adminClient = createAdminClient();
  const { data: photos } = await adminClient
    .from("profile_photos")
    .select("id")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (photos) {
    for (let i = 0; i < photos.length; i++) {
      await adminClient.from("profile_photos").update({ sort_order: i }).eq("id", photos[i].id);
    }
  }
}
