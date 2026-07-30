/**
 * Supabase Storage Provider — stores media in Supabase Storage buckets.
 *
 * Supports:
 *  - Public bucket for public media (avatars, feed images)
 *  - Private bucket for private media (chat attachments)
 *  - Processing bucket for temporary processing artifacts
 *
 * All paths are server-generated — clients cannot choose storage keys.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  STORAGE_BUCKET_PUBLIC,
  STORAGE_BUCKET_PRIVATE,
} from "@/lib/media/constants";
import type { MediaStorageProvider, StorageUploadResult, StorageProviderConfig } from "./storage-provider.interface";

export class SupabaseStorageProvider implements MediaStorageProvider {
  private getBucket(config?: StorageProviderConfig): string {
    return config?.bucket ?? STORAGE_BUCKET_PUBLIC;
  }

  async upload(
    data: Buffer | Uint8Array | Blob,
    storageKey: string,
    mimeType: string,
    config?: StorageProviderConfig,
  ): Promise<StorageUploadResult> {
    const adminClient = createAdminClient();
    const bucket = this.getBucket(config);

    const { data: result, error } = await adminClient.storage
      .from(bucket)
      .upload(storageKey, data, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      logger.error("Supabase storage upload failed", {
        error: error.message,
        bucket,
        storageKey,
      });
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    // Generate the public URL
    const { data: publicUrl } = adminClient.storage
      .from(bucket)
      .getPublicUrl(storageKey);

    return {
      storageKey,
      url: publicUrl.publicUrl,
    };
  }

  async delete(storageKey: string): Promise<void> {
    const adminClient = createAdminClient();

    const { error } = await adminClient.storage
      .from(STORAGE_BUCKET_PUBLIC)
      .remove([storageKey]);

    // Also try private bucket
    const { error: privateError } = await adminClient.storage
      .from(STORAGE_BUCKET_PRIVATE)
      .remove([storageKey]);

    if (error && privateError) {
      logger.warn("Failed to delete from both storage buckets", {
        storageKey,
        publicError: error.message,
        privateError: privateError?.message,
      });
    }
  }

  async getSignedUrl(
    storageKey: string,
    expiresInSeconds: number = 3600,
  ): Promise<string> {
    const adminClient = createAdminClient();

    // Try public bucket first, then private
    const { data: publicUrl } = await adminClient.storage
      .from(STORAGE_BUCKET_PUBLIC)
      .createSignedUrl(storageKey, expiresInSeconds);

    if (publicUrl) {
      return publicUrl.signedUrl;
    }

    const { data: privateUrl } = await adminClient.storage
      .from(STORAGE_BUCKET_PRIVATE)
      .createSignedUrl(storageKey, expiresInSeconds);

    if (privateUrl) {
      return privateUrl.signedUrl;
    }

    throw new Error("Object not found in any storage bucket");
  }

  getPublicUrl(storageKey: string): string {
    const adminClient = createAdminClient();

    const { data: publicUrl } = adminClient.storage
      .from(STORAGE_BUCKET_PUBLIC)
      .getPublicUrl(storageKey);

    return publicUrl.publicUrl;
  }

  async exists(storageKey: string): Promise<boolean> {
    const adminClient = createAdminClient();

    try {
      const { data: publicObj } = await adminClient.storage
        .from(STORAGE_BUCKET_PUBLIC)
        .list("", { search: storageKey });

      if (publicObj && publicObj.length > 0) return true;

      const { data: privateObj } = await adminClient.storage
        .from(STORAGE_BUCKET_PRIVATE)
        .list("", { search: storageKey });

      return !!(privateObj && privateObj.length > 0);
    } catch {
      return false;
    }
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    const adminClient = createAdminClient();

    const { error } = await adminClient.storage
      .from(STORAGE_BUCKET_PUBLIC)
      .copy(fromKey, toKey);

    if (error) {
      logger.error("Storage copy failed", {
        error: error.message,
        fromKey,
        toKey,
      });
      throw new Error(`Storage copy failed: ${error.message}`);
    }
  }
}
