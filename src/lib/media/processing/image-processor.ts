/**
 * Image Processor — server-side image processing using Sharp.
 *
 * Handles:
 *  - Derivative generation (thumbnail, small, medium, large)
 *  - EXIF orientation correction
 *  - EXIF metadata stripping (GPS removal)
 *  - Format conversion (JPEG, PNG, WebP)
 *  - Quality optimization
 *  - Dimension validation
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  DERIVATIVE_TYPES,
  DERIVATIVE_CONFIG,
  JPEG_QUALITY,
  WEBP_QUALITY,
  MAX_IMAGE_WIDTH,
  MAX_IMAGE_HEIGHT,
} from "@/lib/media/constants";
import type { DerivativeType } from "@/lib/media/constants";

// ─── Derivative Generation ──────────────────────────────────────────────

export interface ImageDerivativeResult {
  derivativeType: string;
  storageKey: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}

/**
 * Load sharp dynamically (avoids crash when not installed).
 */
async function getSharp() {
  try {
    const mod = await import("sharp");
    return mod.default;
  } catch {
    return null;
  }
}

/**
 * Generate all required derivatives for an image.
 * Stores them in the storage bucket and creates DB records.
 *
 * If Sharp is not installed, the image is marked as ready
 * without derivative generation — the original is served directly.
 */
export async function generateImageDerivatives(
  mediaId: string,
  buffer: Buffer,
): Promise<ImageDerivativeResult[]> {
  const results: ImageDerivativeResult[] = [];
  const sharp = await getSharp();

  if (!sharp) {
    logger.warn("Sharp not installed — skipping image derivative generation", {
      mediaId,
    });
    // Mark media as ready without processing
    const adminClient = createAdminClient();
    await adminClient
      .from("media")
      .update({ processing_status: "ready", version: 1 })
      .eq("id", mediaId);
    return results;
  }

  try {
    // Get original metadata
    const metadata = await sharp(buffer).metadata();

    // Validate dimensions
    if (metadata.width && metadata.width > MAX_IMAGE_WIDTH) {
      throw new Error(`Image width ${metadata.width} exceeds maximum ${MAX_IMAGE_WIDTH}`);
    }
    if (metadata.height && metadata.height > MAX_IMAGE_HEIGHT) {
      throw new Error(`Image height ${metadata.height} exceeds maximum ${MAX_IMAGE_HEIGHT}`);
    }

    // Correct EXIF orientation first
    const orientedBuffer = await sharp(buffer)
      .rotate() // Auto-orient based on EXIF
      .toBuffer();

    // Strip EXIF metadata (privacy: remove GPS, camera info)
    const cleanBuffer = await sharp(orientedBuffer)
      .withMetadata({ exif: undefined, icc: undefined })
      .toBuffer();

    // Generate derivatives
    const derivativeTypes: DerivativeType[] = [
      DERIVATIVE_TYPES.THUMBNAIL,
      DERIVATIVE_TYPES.SMALL,
      DERIVATIVE_TYPES.MEDIUM,
      DERIVATIVE_TYPES.LARGE,
    ];

    for (const derivType of derivativeTypes) {
      const config = DERIVATIVE_CONFIG[derivType];

      const derivativeBuffer = await sharp(cleanBuffer)
        .resize(config.width, config.height, {
          fit: config.fit,
          withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

      const storageKey = `users/${mediaId}/${derivType}.webp`;
      const { width, height } = await sharp(derivativeBuffer).metadata();

      // Upload derivative to storage
      try {
        const { SupabaseStorageProvider } = await import("@/lib/media/providers/supabase-storage.provider");
        const storageProvider = new SupabaseStorageProvider();
        await storageProvider.upload(
          derivativeBuffer,
          storageKey,
          "image/webp",
          { bucket: "media" },
        );
      } catch (err) {
        logger.warn("Failed to upload derivative to storage", {
          derivType,
          error: err instanceof Error ? err.message : "Unknown",
        });
        // Continue — we'll still record the metadata but it won't be accessible
      }

      // Record derivative in database
      try {
        const adminClient = createAdminClient();
        await adminClient.from("media_derivatives").upsert(
          {
            media_id: mediaId,
            derivative_type: derivType,
            storage_key: storageKey,
            mime_type: "image/webp",
            size_bytes: derivativeBuffer.length,
            width: width ?? config.width,
            height: height ?? config.height,
          },
          { onConflict: "media_id, derivative_type" },
        );
      } catch (err) {
        logger.warn("Failed to store derivative record", {
          derivType,
          error: err instanceof Error ? err.message : "Unknown",
        });
      }

      results.push({
        derivativeType: derivType,
        storageKey,
        width: width ?? config.width,
        height: height ?? config.height,
        sizeBytes: derivativeBuffer.length,
        mimeType: "image/webp",
      });
    }

    // Update media record with processed dimensions
    const adminClient = createAdminClient();
    await adminClient
      .from("media")
      .update({
        processing_status: "ready",
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        version: 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", mediaId);

    logger.info("Image derivatives generated", {
      mediaId,
      count: results.length,
    });

    return results;
  } catch (err) {
    logger.error("Image processing failed", {
      mediaId,
      error: err instanceof Error ? err.message : "Unknown",
    });

    // Mark media as failed
    const adminClient = createAdminClient();
    await adminClient
      .from("media")
      .update({ processing_status: "failed" })
      .eq("id", mediaId);

    throw err;
  }
}

// ─── Single Derivative Generation ───────────────────────────────────────

/**
 * Generate a single derivative for an image.
 * Returns null if Sharp is not available.
 */
export async function generateSingleDerivative(
  buffer: Buffer,
  derivType: DerivativeType,
): Promise<Buffer | null> {
  const sharp = await getSharp();
  if (!sharp) return null;

  const config = DERIVATIVE_CONFIG[derivType];

  const oriented = await sharp(buffer).rotate().jpeg({ quality: JPEG_QUALITY }).toBuffer();

  return sharp(oriented)
    .resize(config.width, config.height, {
      fit: config.fit,
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}
