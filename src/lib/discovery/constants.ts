/**
 * Discovery constants — centralized configuration for the dating discovery engine.
 *
 * All configurable limits are defined here.
 * Do not scatter hard-coded limits throughout the application.
 */

/** Default number of candidates per discovery page */
export const DISCOVERY_PAGE_SIZE = 20;

/** Maximum number of candidates per page */
export const DISCOVERY_MAX_PAGE_SIZE = 50;

/** Maximum distance in kilometers */
export const MAX_DISCOVERY_DISTANCE_KM = 500;

/** Minimum age for dating discovery */
export const MIN_DATING_AGE = 18;

/** Maximum age for dating discovery */
export const MAX_DATING_AGE = 100;

/** Default age range */
export const DEFAULT_MIN_AGE = 18;
export const DEFAULT_MAX_AGE = 60;

/** Default max distance */
export const DEFAULT_MAX_DISTANCE_KM = 100;

/** Daily limit for super likes (free tier) */
export const DAILY_SUPER_LIKE_LIMIT = 3;

/** Maximum likes per hour (rate limiting) */
export const MAX_LIKES_PER_HOUR = 100;

/** Maximum passes per hour */
export const MAX_PASSES_PER_HOUR = 200;

/** Maximum super likes per hour */
export const MAX_SUPER_LIKES_PER_HOUR = 10;

/** Minimum profile completion percentage for discovery */
export const MIN_DISCOVERY_PROFILE_COMPLETION = 50;

/** Minimum shared interests required for showing compatibility (0 = show all) */
export const MIN_SHARED_INTERESTS_FOR_DISPLAY = 0;

/** Discovery modes */
export const DISCOVERY_MODES = ["social", "dating"] as const;
export type DiscoveryMode = (typeof DISCOVERY_MODES)[number];

/** Default search query limits */
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;
export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_MAX_RESULTS = 50;

/** Sort modes */
export const SORT_MODES = ["recommended", "nearby", "recent"] as const;
export type SortMode = (typeof SORT_MODES)[number];

/** Interest filter modes */
export const INTEREST_MATCH_MODES = ["matchAny", "matchAll"] as const;
export type InterestMatchMode = (typeof INTEREST_MATCH_MODES)[number];

/** Score weights for ranking */
export const RANKING_WEIGHTS = {
  RECENCY: 0.25,
  ACTIVITY: 0.15,
  INTEREST_COMPATIBILITY: 0.25,
  INTENT_COMPATIBILITY: 0.15,
  PROFILE_QUALITY: 0.10,
  DISTANCE: 0.05,
  SOCIAL_AFFINITY: 0.05,
} as const;

/**
 * Intent compatibility matrix.
 * Key: current user intent. Value: array of compatible candidate intents.
 */
export const INTENT_COMPATIBILITY_MATRIX: Record<string, string[]> = {
  dating: ["dating", "relationship", "not_sure"],
  friendship: ["friendship", "chat", "not_sure"],
  chat: ["friendship", "chat", "not_sure"],
  relationship: ["dating", "relationship", "not_sure"],
  not_sure: ["dating", "friendship", "chat", "relationship", "not_sure"],
};

/** Profile quality scoring rules */
export const PROFILE_QUALITY = {
  /** Points for having a bio */
  BIO_PRESENT: 20,
  /** Points per profile photo (max 4 counted) */
  PHOTO_POINTS: [0, 15, 25, 30, 35], // Index = number of photos, capped at 4
  /** Points for having interests */
  INTERESTS_PRESENT: 15,
  /** Points for having a verified profile */
  VERIFIED: 20,
  /** Points for profile completion percentage */
  COMPLETION_PCT_MULTIPLIER: 0.3,
  /** Maximum quality score */
  MAX_SCORE: 100,
} as const;
