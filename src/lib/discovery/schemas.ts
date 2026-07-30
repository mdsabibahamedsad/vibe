/**
 * Zod validation schemas for the Search + Discovery Engine.
 *
 * Supports both social and dating discovery modes.
 * Server-side schemas are authoritative.
 */

import { z } from "zod";
import {
  DISCOVERY_PAGE_SIZE,
  DISCOVERY_MAX_PAGE_SIZE,
  MIN_DATING_AGE,
  MAX_DATING_AGE,
  MAX_DISCOVERY_DISTANCE_KM,
  MIN_QUERY_LENGTH,
  MAX_QUERY_LENGTH,
  DISCOVERY_MODES,
  SORT_MODES,
  INTEREST_MATCH_MODES,
} from "./constants";

// ─── Gender values (must match DB) ───────────────────────────────────────
const genderValues = ["male", "female", "non_binary", "prefer_not_to_say"] as const;

// ─── Dating intent values (must match DB) ────────────────────────────────
const datingIntentValues = [
  "dating",
  "friendship",
  "chat",
  "relationship",
  "not_sure",
] as const;

// ─── Dating action type values (must match DB) ───────────────────────────
const datingActionTypeValues = ["like", "pass", "super_like"] as const;

// ─── Discovery Mode ─────────────────────────────────────────────────────

export const discoveryModeSchema = z.enum(DISCOVERY_MODES as unknown as [string, ...string[]]);
export type DiscoveryMode = z.infer<typeof discoveryModeSchema>;

// ─── Sort Mode ───────────────────────────────────────────────────────────

export const sortModeSchema = z.enum(SORT_MODES as unknown as [string, ...string[]]);
export type SortMode = z.infer<typeof sortModeSchema>;

// ─── Interest Match Mode ─────────────────────────────────────────────────

export const interestMatchModeSchema = z.enum(INTEREST_MATCH_MODES as unknown as [string, ...string[]]);
export type InterestMatchMode = z.infer<typeof interestMatchModeSchema>;

// ─── Unified Discovery Request ───────────────────────────────────────────

export const discoveryRequestSchema = z.object({
  mode: discoveryModeSchema.default("social"),
  query: z
    .string()
    .min(MIN_QUERY_LENGTH, `Search query must be at least ${MIN_QUERY_LENGTH} characters`)
    .max(MAX_QUERY_LENGTH, `Search query must be at most ${MAX_QUERY_LENGTH} characters`)
    .optional(),
  filters: z
    .object({
      interestIds: z.array(z.string().uuid()).optional(),
      interestMatchMode: interestMatchModeSchema.default("matchAny"),
      minAge: z.coerce
        .number()
        .int()
        .min(MIN_DATING_AGE, `Minimum age must be at least ${MIN_DATING_AGE}`)
        .optional(),
      maxAge: z.coerce
        .number()
        .int()
        .min(MIN_DATING_AGE, `Maximum age must be at least ${MIN_DATING_AGE}`)
        .optional(),
      preferredGenders: z.array(z.enum(genderValues)).optional(),
      maxDistanceKm: z.coerce
        .number()
        .int()
        .min(1, "Distance must be at least 1 km")
        .max(MAX_DISCOVERY_DISTANCE_KM, `Distance must be at most ${MAX_DISCOVERY_DISTANCE_KM} km`)
        .optional(),
    })
    .optional(),
  sort: sortModeSchema.default("recommended"),
  cursor: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, "Limit must be at least 1")
    .max(DISCOVERY_MAX_PAGE_SIZE, `Limit must be at most ${DISCOVERY_MAX_PAGE_SIZE}`)
    .default(DISCOVERY_PAGE_SIZE),
});

export type DiscoveryRequestInput = z.infer<typeof discoveryRequestSchema>;

// ─── Discovery Cursor Schema (Legacy Compatibility) ──────────────────────

export const discoveryCursorSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, "Limit must be at least 1")
    .max(DISCOVERY_MAX_PAGE_SIZE, `Limit must be at most ${DISCOVERY_MAX_PAGE_SIZE}`)
    .default(DISCOVERY_PAGE_SIZE),
});

export type DiscoveryCursorInput = z.infer<typeof discoveryCursorSchema>;

// ─── Discovery Filters (Legacy Compatibility) ───────────────────────────

export const discoveryFiltersSchema = z.object({
  minAge: z.coerce
    .number()
    .int()
    .min(MIN_DATING_AGE, `Minimum age must be at least ${MIN_DATING_AGE}`)
    .max(MAX_DATING_AGE, `Minimum age must be at most ${MAX_DATING_AGE}`)
    .optional(),
  maxAge: z.coerce
    .number()
    .int()
    .min(MIN_DATING_AGE, `Maximum age must be at least ${MIN_DATING_AGE}`)
    .max(MAX_DATING_AGE, `Maximum age must be at most ${MAX_DATING_AGE}`)
    .optional(),
  preferredGenders: z
    .array(z.enum(genderValues))
    .min(1, "Select at least one gender preference")
    .optional(),
  maxDistanceKm: z.coerce
    .number()
    .int()
    .min(1, "Distance must be at least 1 km")
    .max(MAX_DISCOVERY_DISTANCE_KM, `Distance must be at most ${MAX_DISCOVERY_DISTANCE_KM} km`)
    .optional(),
  datingIntent: z.enum(datingIntentValues).optional(),
});

export type DiscoveryFiltersInput = z.infer<typeof discoveryFiltersSchema>;

// ─── Dating Action Schema ────────────────────────────────────────────────

export const datingActionSchema = z.object({
  targetUserId: z.string().uuid("Invalid target user ID"),
  action: z.enum(datingActionTypeValues, {
    errorMap: () => ({ message: "Action must be 'like', 'pass', or 'super_like'" }),
  }),
});

export type DatingActionInput = z.infer<typeof datingActionSchema>;

// ─── Dating Action Response Schema ───────────────────────────────────────

export const datingActionResponseSchema = z.object({
  success: z.boolean(),
  action: z.enum(datingActionTypeValues),
  targetUserId: z.string().uuid(),
  /** Whether the action was newly created or updated */
  isNew: z.boolean(),
});

export type DatingActionResponse = z.infer<typeof datingActionResponseSchema>;

// ─── Discovery Response Types ────────────────────────────────────────────

export const discoveryEligibilityReasons = [
  "PROFILE_INCOMPLETE",
  "UNDERAGE",
  "DISCOVERY_DISABLED",
  "ACCOUNT_RESTRICTED",
] as const;

export type DiscoveryEligibilityReason = (typeof discoveryEligibilityReasons)[number];

export interface DiscoveryCandidatePhoto {
  id: string;
  mediaId: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface DiscoveryCandidateInterest {
  id: string;
  name: string;
  slug: string;
  category: string | null;
}

export interface DiscoveryCandidate {
  id: string;
  displayName: string;
  username: string | null;
  bio: string | null;
  age: number | null;
  city: string | null;
  distanceKm: number | null;
  intent: string | null;
  gender: string | null;
  isVerified: boolean;
  profileCompletionPct: number;
  photos: DiscoveryCandidatePhoto[];
  interests: DiscoveryCandidateInterest[];
  compatibility: {
    sharedInterests: number;
    intentMatch: boolean;
  };
}

export interface SearchProfileResult {
  id: string;
  displayName: string;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  age: number | null;
  city: string | null;
  distanceKm: number | null;
  sharedInterests: number;
  isVerified: boolean;
}

export interface DiscoverySuccessResponse {
  eligible: true;
  items: DiscoveryCandidate[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface DiscoveryIneligibleResponse {
  eligible: false;
  reason: DiscoveryEligibilityReason;
}

export type DiscoveryResponse = DiscoverySuccessResponse | DiscoveryIneligibleResponse;

// ─── Social Discovery Response ───────────────────────────────────────────

export interface SocialDiscoveryResponse {
  items: SearchProfileResult[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ─── Interests for filter UI ─────────────────────────────────────────────

export interface InterestCategory {
  category: string;
  interests: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
}
