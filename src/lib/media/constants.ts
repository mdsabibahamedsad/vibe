/**
 * Media Pipeline constants — all configurable limits centralized here.
 */

// ─── Image Limits ───────────────────────────────────────────────────────

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMAGE_WIDTH = 4096;
export const MAX_IMAGE_HEIGHT = 4096;

// ─── Video Limits ───────────────────────────────────────────────────────

export const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_VIDEO_DURATION_MS = 60_000; // 60 seconds
export const MAX_VIDEO_WIDTH = 1920;
export const MAX_VIDEO_HEIGHT = 1920;

// ─── Processing ─────────────────────────────────────────────────────────

export const THUMBNAIL_WIDTH = 150;
export const THUMBNAIL_HEIGHT = 150;
export const SMALL_WIDTH = 320;
export const MEDIUM_WIDTH = 640;
export const LARGE_WIDTH = 1280;

export const JPEG_QUALITY = 82;
export const WEBP_QUALITY = 80;

// ─── Purposes ───────────────────────────────────────────────────────────

export const MEDIA_PURPOSE_PROFILE = "profile";
export const MEDIA_PURPOSE_POST = "post";
export const MEDIA_PURPOSE_STORY = "story";
export const MEDIA_PURPOSE_CHAT = "message";
export const MEDIA_PURPOSE_AVATAR = "avatar";
export const MEDIA_PURPOSE_THUMBNAIL = "thumbnail";

export const ALLOWED_PURPOSE_TYPES: Record<string, string[]> = {
  [MEDIA_PURPOSE_PROFILE]: ["image"],
  [MEDIA_PURPOSE_POST]: ["image", "video"],
  [MEDIA_PURPOSE_STORY]: ["image", "video"],
  [MEDIA_PURPOSE_CHAT]: ["image", "video"],
  [MEDIA_PURPOSE_AVATAR]: ["image"],
  [MEDIA_PURPOSE_THUMBNAIL]: ["image"],
};

export const PURPOSE_MAX_SIZES: Record<string, number> = {
  [MEDIA_PURPOSE_PROFILE]: MAX_IMAGE_UPLOAD_BYTES,
  [MEDIA_PURPOSE_POST]: MAX_IMAGE_UPLOAD_BYTES,
  [MEDIA_PURPOSE_STORY]: MAX_VIDEO_UPLOAD_BYTES,
  [MEDIA_PURPOSE_CHAT]: MAX_IMAGE_UPLOAD_BYTES,
  [MEDIA_PURPOSE_AVATAR]: MAX_IMAGE_UPLOAD_BYTES,
};

// ─── Derivative Types ───────────────────────────────────────────────────

export const DERIVATIVE_TYPES = {
  THUMBNAIL: "thumbnail",
  SMALL: "small",
  MEDIUM: "medium",
  LARGE: "large",
  POSTER: "poster",
  MOBILE: "mobile",
  STANDARD: "standard",
} as const;

export type DerivativeType = (typeof DERIVATIVE_TYPES)[keyof typeof DERIVATIVE_TYPES];

export const DERIVATIVE_CONFIG: Record<
  DerivativeType,
  { width: number; height: number; fit: "cover" | "inside" | "contain" }
> = {
  [DERIVATIVE_TYPES.THUMBNAIL]: { width: 150, height: 150, fit: "cover" },
  [DERIVATIVE_TYPES.SMALL]: { width: 320, height: 320, fit: "inside" },
  [DERIVATIVE_TYPES.MEDIUM]: { width: 640, height: 640, fit: "inside" },
  [DERIVATIVE_TYPES.LARGE]: { width: 1280, height: 1280, fit: "inside" },
  [DERIVATIVE_TYPES.POSTER]: { width: 640, height: 640, fit: "inside" },
  [DERIVATIVE_TYPES.MOBILE]: { width: 480, height: 480, fit: "inside" },
  [DERIVATIVE_TYPES.STANDARD]: { width: 720, height: 720, fit: "inside" },
};

// ─── Retention / Cleanup ────────────────────────────────────────────────

export const ORPHAN_MEDIA_GRACE_PERIOD_HOURS = 24;
export const FAILED_MEDIA_RETENTION_DAYS = 7;
export const DELETED_MEDIA_RETENTION_DAYS = 30;

// ─── Storage ────────────────────────────────────────────────────────────

export const STORAGE_BUCKET_PUBLIC = "media";
export const STORAGE_BUCKET_PRIVATE = "private-media";
export const STORAGE_BUCKET_PROCESSING = "processing";

// ─── MIME Types ─────────────────────────────────────────────────────────

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const IMAGE_MIME_SIGNATURES: Record<string, string[]> = {
  "image/jpeg": ["ffd8ff"],
  "image/png": ["89504e47"],
  "image/webp": ["52494646"],
};

// ─── Processing Jobs ────────────────────────────────────────────────────

export const PROCESSING_JOB_TYPES = {
  IMAGE_OPTIMIZE: "image_optimize",
  IMAGE_THUMBNAIL: "image_thumbnail",
  VIDEO_TRANSCODE: "video_transcode",
  VIDEO_THUMBNAIL: "video_thumbnail",
  CLEANUP: "cleanup",
} as const;

export type ProcessingJobType =
  (typeof PROCESSING_JOB_TYPES)[keyof typeof PROCESSING_JOB_TYPES];

export const MAX_PROCESSING_ATTEMPTS = 3;
export const PROCESSING_RETRY_BACKOFF_MS = [1000, 5000, 30000];

// ─── Rate Limits ────────────────────────────────────────────────────────

export const UPLOAD_RATE_LIMIT_PER_MINUTE = 10;
export const PROCESSING_RATE_LIMIT_PER_MINUTE = 20;

// ─── Cache ──────────────────────────────────────────────────────────────

export const CACHE_CONTROL_IMMUTABLE = "public, max-age=31536000, immutable";
export const CACHE_CONTROL_SHORT = "public, max-age=3600";
export const CACHE_CONTROL_PRIVATE = "private, max-age=300";

// ─── Media Purpose Validation ───────────────────────────────────────────

export const ALL_MEDIA_PURPOSES = [
  MEDIA_PURPOSE_PROFILE,
  MEDIA_PURPOSE_POST,
  MEDIA_PURPOSE_STORY,
  MEDIA_PURPOSE_CHAT,
  MEDIA_PURPOSE_AVATAR,
  MEDIA_PURPOSE_THUMBNAIL,
] as const;

export type MediaPurpose = (typeof ALL_MEDIA_PURPOSES)[number];

// Alias for routes that use "ALLOWED" naming
export const ALLOWED_MEDIA_PURPOSES = ALL_MEDIA_PURPOSES;

// ─── Error Codes ────────────────────────────────────────────────────────

export const MEDIA_ERROR_CODES = {
  TOO_LARGE: "MEDIA_TOO_LARGE",
  TYPE_UNSUPPORTED: "MEDIA_TYPE_UNSUPPORTED",
  PROCESSING_FAILED: "MEDIA_PROCESSING_FAILED",
  NOT_READY: "MEDIA_NOT_READY",
  ACCESS_DENIED: "MEDIA_ACCESS_DENIED",
  NOT_FOUND: "MEDIA_NOT_FOUND",
  UPLOAD_FAILED: "MEDIA_UPLOAD_FAILED",
  INVALID_FILE: "MEDIA_INVALID_FILE",
  RATE_LIMITED: "MEDIA_RATE_LIMITED",
} as const;
