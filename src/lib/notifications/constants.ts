/**
 * Notification system constants — all configurable values centralized here.
 */

// ─── Notification Types ────────────────────────────────────────────────

/**
 * All supported notification types and their human-readable metadata.
 * This is the single source of truth — never scatter string literals.
 */
export const NOTIFICATION_TYPES = {
  NEW_MATCH: "new_match",
  NEW_MESSAGE: "new_message",
  POST_LIKE: "post_like",
  POST_COMMENT: "post_comment",
  NEW_FOLLOWER: "new_follower",
  STORY_VIEW: "story_view",
  STORY_REACTION: "story_reaction",
  STORY_MENTION: "story_mention",
  PROFILE_VISIT: "profile_visit",
  SUBSCRIPTION_EXPIRED: "subscription_expired",
  SUBSCRIPTION_RENEWED: "subscription_renewed",
  REPORT_UPDATE: "report_update",
  SAFETY_WARNING: "safety_warning",
  SAFETY_RESTRICTION: "safety_restriction",
  SUSPICIOUS_LOGIN: "suspicious_login",
  VERIFICATION_CHANGE: "verification_change",
  ACCOUNT_SECURITY: "account_security",
  SYSTEM: "system",
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

// ─── Categories ────────────────────────────────────────────────────────

/**
 * Notification categories for UI filtering.
 */
export const NOTIFICATION_CATEGORIES = {
  ALL: "all",
  MESSAGES: "messages",
  DATING: "dating",
  SOCIAL: "social",
  SYSTEM: "system",
} as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[keyof typeof NOTIFICATION_CATEGORIES];

/**
 * Map notification types to their UI category.
 */
export const TYPE_TO_CATEGORY: Record<string, string> = {
  [NOTIFICATION_TYPES.NEW_MESSAGE]: NOTIFICATION_CATEGORIES.MESSAGES,
  [NOTIFICATION_TYPES.NEW_MATCH]: NOTIFICATION_CATEGORIES.DATING,
  [NOTIFICATION_TYPES.POST_LIKE]: NOTIFICATION_CATEGORIES.SOCIAL,
  [NOTIFICATION_TYPES.POST_COMMENT]: NOTIFICATION_CATEGORIES.SOCIAL,
  [NOTIFICATION_TYPES.NEW_FOLLOWER]: NOTIFICATION_CATEGORIES.SOCIAL,
  [NOTIFICATION_TYPES.STORY_VIEW]: NOTIFICATION_CATEGORIES.SOCIAL,
  [NOTIFICATION_TYPES.STORY_REACTION]: NOTIFICATION_CATEGORIES.SOCIAL,
  [NOTIFICATION_TYPES.STORY_MENTION]: NOTIFICATION_CATEGORIES.SOCIAL,
  [NOTIFICATION_TYPES.PROFILE_VISIT]: NOTIFICATION_CATEGORIES.SOCIAL,
  [NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED]: NOTIFICATION_CATEGORIES.SYSTEM,
  [NOTIFICATION_TYPES.SUBSCRIPTION_RENEWED]: NOTIFICATION_CATEGORIES.SYSTEM,
  [NOTIFICATION_TYPES.REPORT_UPDATE]: NOTIFICATION_CATEGORIES.SYSTEM,
  [NOTIFICATION_TYPES.SAFETY_WARNING]: NOTIFICATION_CATEGORIES.SYSTEM,
  [NOTIFICATION_TYPES.SAFETY_RESTRICTION]: NOTIFICATION_CATEGORIES.SYSTEM,
  [NOTIFICATION_TYPES.SUSPICIOUS_LOGIN]: NOTIFICATION_CATEGORIES.SYSTEM,
  [NOTIFICATION_TYPES.VERIFICATION_CHANGE]: NOTIFICATION_CATEGORIES.SYSTEM,
  [NOTIFICATION_TYPES.ACCOUNT_SECURITY]: NOTIFICATION_CATEGORIES.SYSTEM,
  [NOTIFICATION_TYPES.SYSTEM]: NOTIFICATION_CATEGORIES.SYSTEM,
};

// ─── Pagination ────────────────────────────────────────────────────────

export const NOTIFICATION_PAGE_SIZE = 20;
export const MAX_NOTIFICATION_PAGE_SIZE = 50;

// ─── Retention ─────────────────────────────────────────────────────────

export const NOTIFICATION_RETENTION_DAYS = 90;

// ─── Telegram ──────────────────────────────────────────────────────────

export const MESSAGE_TELEGRAM_NOTIFICATION_COOLDOWN_MS = 60 * 1000; // 1 minute between Telegram message notifications
export const SOCIAL_NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between social notifications

// ─── Delivery Jobs ─────────────────────────────────────────────────────

export const MAX_DELIVERY_RETRIES = 3;
export const DELIVERY_RETRY_BACKOFF_MS = [1000, 5000, 30000]; // 1s, 5s, 30s

// ─── Preference Defaults ───────────────────────────────────────────────

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  inAppEnabled: true,
  matchNotifications: true,
  messageNotifications: true,
  followNotifications: true,
  postNotifications: true,
  storyNotifications: true,
  systemNotifications: true,
  telegramEnabled: false,
  telegramActivated: false,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  timezone: "UTC",
};
