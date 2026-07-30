/**
 * Telegram Media Provider — adapter for Telegram-hosted media.
 *
 * Stores Telegram file_id references rather than actual binary data.
 * The Bot API token is never exposed to the client.
 *
 * IMPORTANT:
 *  - Telegram file IDs are temporary and may expire for some file types
 *  - This provider is best-effort — application ownership and metadata
 *    remain controlled by Vibe's database
 *  - Do NOT treat Telegram file IDs as permanent CDN URLs
 */

import { logger } from "@/lib/logger";
import type { MediaStorageProvider, StorageUploadResult, StorageProviderConfig } from "./storage-provider.interface";

export class TelegramMediaProvider implements MediaStorageProvider {
  async upload(
    data: Buffer | Uint8Array | Blob,
    storageKey: string,
    mimeType: string,
    config?: StorageProviderConfig,
  ): Promise<StorageUploadResult> {
    // Telegram provider stores file_id references, not binary data.
    // The actual upload happens on the client side to Telegram.
    // This method creates the metadata reference.
    const providerFileId = config?.bucket;
    const telegramFileId = providerFileId || `telegram_${storageKey}`;

    return {
      storageKey,
      url: `/api/media/file/${storageKey.split("/").pop()}`,
      providerFileId: telegramFileId,
    };
  }

  async delete(storageKey: string): Promise<void> {
    // Telegram file IDs cannot be deleted via Bot API for files
    // sent through the Web App. We clean up our database reference only.
    logger.debug("Telegram media reference deleted (storage not affected)", {
      storageKey,
    });
  }

  async getSignedUrl(
    storageKey: string,
    expiresInSeconds: number = 3600,
  ): Promise<string> {
    // For Telegram media, we return the API route that resolves the file
    // server-side using the Bot API. The Bot token is never exposed.
    const mediaId = storageKey.split("/").pop();
    return `/api/media/${mediaId}`;
  }

  getPublicUrl(storageKey: string): string {
    // Telegram media doesn't have permanent public URLs
    const mediaId = storageKey.split("/").pop();
    return `/api/media/${mediaId}`;
  }

  async exists(storageKey: string): Promise<boolean> {
    // For Telegram media, we can't check existence without Bot API call.
    // Return true — the access check happens when the URL is resolved.
    return true;
  }

  async copy(fromKey: string, toKey: string): Promise<void> {
    // Copy is not supported for Telegram media references
    logger.debug("Telegram media copy not supported — skipping", { fromKey, toKey });
  }
}
