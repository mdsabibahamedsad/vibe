/**
 * Story configuration constants.
 *
 * All story limits are centralized here.
 * Do not scatter hard-coded limits throughout the application.
 */

/** Maximum duration for story videos in seconds (default: 60s) */
export const MAX_STORY_VIDEO_DURATION_SECONDS = 60;

/** Maximum file size for story videos in bytes (default: 50MB) */
export const MAX_STORY_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

/** Maximum file size for story images in bytes (default: 10MB) */
export const MAX_STORY_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/** Default display duration for image stories in milliseconds (default: 5000ms) */
export const STORY_IMAGE_DISPLAY_DURATION_MS = 5000;

/** Maximum caption length for stories */
export const STORY_CAPTION_MAX_LENGTH = 200;

/** Story expiration duration */
export const STORY_EXPIRATION_HOURS = 24;

/** Maximum number of stories a user can have active at once */
export const MAX_ACTIVE_STORIES_PER_USER = 20;

/** Maximum stories to return in the active stories query */
export const MAX_STORIES_BAR_RESULTS = 50;

/** Maximum stories per author in the viewer */
export const MAX_STORIES_PER_AUTHOR = 50;

/** Allowed image MIME types for stories */
export const ALLOWED_STORY_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Allowed video MIME types for stories */
export const ALLOWED_STORY_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

/** Story visibility options */
export const STORY_VISIBILITY_OPTIONS = ["public", "followers_only"] as const;

/** Story reaction types available */
export const STORY_REACTION_TYPES = [
  "like",
  "love",
  "haha",
  "wow",
  "sad",
] as const;

/** Story deep-link entity type */
export const STORY_DEEP_LINK_ENTITY = "story" as const;
