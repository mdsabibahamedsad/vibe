/**
 * Recommendation + Matching Intelligence Engine constants.
 *
 * All ranking configuration is centralized here.
 * Weights are normalized so features should be 0.0–1.0.
 * Only hard-eligibility rules live separately (in Prompt 12's discovery system).
 */

// ─── Ranking Version ────────────────────────────────────────────────────

export const RANKING_VERSION = "v1";

// ─── Default Weights (Dating Mode) ──────────────────────────────────────

export const DATING_RANKING_WEIGHTS = {
  COMPATIBILITY: 0.25,
  INTEREST_SIMILARITY: 0.20,
  LOCATION: 0.10,
  ACTIVITY: 0.10,
  PROFILE_QUALITY: 0.10,
  MUTUAL_CONNECTION: 0.05,
  INTERACTION_AFFINITY: 0.05,
  FRESHNESS: 0.05,
  DIVERSITY: 0.05,
  EXPLORATION: 0.05,
} as const;

export type DatingRankingWeight = keyof typeof DATING_RANKING_WEIGHTS;

// ─── Default Weights (Social Mode) ──────────────────────────────────────

export const SOCIAL_RANKING_WEIGHTS = {
  INTEREST_SIMILARITY: 0.25,
  MUTUAL_CONNECTION: 0.20,
  ACTIVITY: 0.15,
  LOCATION: 0.10,
  PROFILE_QUALITY: 0.10,
  INTERACTION_AFFINITY: 0.05,
  FRESHNESS: 0.05,
  DIVERSITY: 0.05,
  EXPLORATION: 0.05,
} as const;

export type SocialRankingWeight = keyof typeof SOCIAL_RANKING_WEIGHTS;

// ─── Exploration Settings ───────────────────────────────────────────────

/** Percentage of results that can be exploratory (0.0–1.0) */
export const EXPLORATION_RATE = 0.10;

/** Seed for stable exploration randomness within a session */
export const EXPLORATION_SEED_BASE = 42;

// ─── Diversity Settings ────────────────────────────────────────────────

/** MMR lambda: 1.0 = pure relevance, 0.0 = pure diversity */
export const DIVERSITY_LAMBDA = 0.7;

/** Similarity threshold for diversity penalty (0.0–1.0) */
export const DIVERSITY_SIMILARITY_THRESHOLD = 0.5;

// ─── Cooldown / Fatigue ────────────────────────────────────────────────

/** Hours before a recently seen candidate's score penalty fully decays */
export const RECENTLY_SEEN_COOLDOWN_HOURS = 24;

/** Score penalty for a recently seen profile (0.0–1.0 multiplier) */
export const RECENTLY_SEEN_PENALTY = 0.5;

/** How many times a repeated pass reduces future score */
export const REPEATED_PASS_PENALTY = 0.3;

// ─── Cold Start ────────────────────────────────────────────────────────

/** Exploration boost for new users with no interaction history (added score) */
export const NEW_USER_EXPLORATION_BOOST = 0.05;

/** Exploration boost for new candidates (added score) */
export const NEW_CANDIDATE_FRESHNESS_BOOST = 0.10;

/** How long a candidate is considered "new" (in hours since account creation) */
export const NEW_CANDIDATE_WINDOW_HOURS = 72;

// ─── Feature Decay ─────────────────────────────────────────────────────

/** Half-life for interaction signal decay (in hours) */
export const SIGNAL_DECAY_HALF_LIFE_HOURS = 168; // 7 days

/** Maximum age for a signal to have any effect (in hours) */
export const SIGNAL_MAX_AGE_HOURS = 8760; // 1 year

// ─── Success Metrics ────────────────────────────────────────────────────

export const PRIMARY_DATING_METRIC = "qualified_match_rate";
export const PRIMARY_SOCIAL_METRIC = "meaningful_connection_rate";

// ─── Impression Retention ───────────────────────────────────────────────

export const IMPRESSION_RETENTION_DAYS = 90;

// ─── Request Generation ────────────────────────────────────────────────

/** Number of candidates to fetch from Prompt 12 before reranking */
export const CANDIDATE_POOL_SIZE = 100;

/** Number of exploratory candidates to inject */
export const EXPLORATORY_POOL_SIZE = 5;
