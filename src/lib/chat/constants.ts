/**
 * Chat system constants — all configurable limits centralized here.
 *
 * Do not scatter hard-coded magic numbers throughout the chat system.
 * Change values here to tune behavior.
 */

/** Maximum characters in a text message */
export const MAX_MESSAGE_LENGTH = 4000;

/** Maximum characters displayed in message previews */
export const MAX_MESSAGE_PREVIEW_LENGTH = 150;

/** Maximum image file size for chat (10 MB) */
export const MAX_CHAT_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum video file size for chat (50 MB) */
export const MAX_CHAT_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;

/** Maximum video duration for chat messages (60 seconds) */
export const MAX_CHAT_VIDEO_DURATION_SECONDS = 60;

/** Maximum messages per minute per user (sent through server-side rate limiter) */
export const MAX_MESSAGES_PER_MINUTE = 30;

/** Maximum messages per conversation fetch */
export const MESSAGE_PAGE_SIZE = 30;

/** Maximum messages a user can send per conversation before a rate limit kicks in */
export const MAX_MESSAGES_PER_CONVERSATION_PER_MINUTE = 20;

/** Typing indicator throttle interval in milliseconds */
export const TYPING_THROTTLE_MS = 2000;

/** Typing indicator timeout in milliseconds — auto-stops after this */
export const TYPING_TIMEOUT_MS = 5000;

/** Reconnect poll interval in milliseconds */
export const RECONNECT_POLL_MS = 3000;

/** Maximum reconnect retries before showing permanent disconnect */
export const MAX_RECONNECT_RETRIES = 5;

/** Allowed image MIME types for chat */
export const ALLOWED_CHAT_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Allowed video MIME types for chat */
export const ALLOWED_CHAT_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

/** Allowed chat message types */
export const ALLOWED_MESSAGE_TYPES = ["text", "image", "video"] as const;

/** Message type display labels */
export const MESSAGE_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  image: "Photo",
  video: "Video",
  system: "System message",
};

/** Realtime channel prefix for chat */
export const CHAT_REALTIME_CHANNEL_PREFIX = "chat:";
