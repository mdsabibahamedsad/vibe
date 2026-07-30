/**
 * Storage Provider Interface — abstraction over storage backends.
 *
 * The rest of the application calls these methods and never needs
 * to know whether media is stored in Telegram, Supabase Storage,
 * or a future CDN provider.
 *
 * Each provider implements this interface.
 */

export interface StorageUploadResult {
  storageKey: string;
  url: string;
  providerFileId?: string;
}

export interface StorageProviderConfig {
  bucket?: string;
  region?: string;
}

export interface MediaStorageProvider {
  /** Upload raw binary data to storage */
  upload(
    data: Buffer | Uint8Array | Blob,
    storageKey: string,
    mimeType: string,
    config?: StorageProviderConfig,
  ): Promise<StorageUploadResult>;

  /** Delete an object from storage */
  delete(storageKey: string): Promise<void>;

  /** Get a signed/secure URL for temporary access */
  getSignedUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;

  /** Get a public (CDN) URL for publicly accessible media */
  getPublicUrl(storageKey: string): string;

  /** Check if an object exists */
  exists(storageKey: string): Promise<boolean>;

  /** Copy an object within storage */
  copy(fromKey: string, toKey: string): Promise<void>;
}

// ─── Provider Registry ─────────────────────────────────────────────────

const providers = new Map<string, MediaStorageProvider>();

export function registerProvider(name: string, provider: MediaStorageProvider): void {
  providers.set(name, provider);
}

export function getProvider(name: string): MediaStorageProvider {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`Storage provider "${name}" is not registered`);
  }
  return provider;
}

export function getRegisteredProviders(): string[] {
  return Array.from(providers.keys());
}
