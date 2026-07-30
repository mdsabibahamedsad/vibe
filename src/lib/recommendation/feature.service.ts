/**
 * Feature Extraction Service — Normalized feature computation.
 *
 * All features are normalized to 0.0–1.0 range.
 * This makes ranking weights consistent and easy to tune.
 *
 * Features that cannot be computed (missing data) return 0.
 * Feature failures are isolated — one failing feature doesn't crash the request.
 */

import { calculateAge } from "@/lib/validation/profile";
import { INTENT_COMPATIBILITY_MATRIX } from "@/lib/discovery/constants";
import {
  NEW_CANDIDATE_WINDOW_HOURS,
  SIGNAL_DECAY_HALF_LIFE_HOURS,
  SIGNAL_MAX_AGE_HOURS,
  RECENTLY_SEEN_COOLDOWN_HOURS,
  RECENTLY_SEEN_PENALTY,
  REPEATED_PASS_PENALTY,
} from "@/lib/recommendation/constants";

// ─── Types ──────────────────────────────────────────────────────────────

export interface ViewerFeatures {
  userId: string;
  interests: string[];
  datingIntent: string | null;
  preferredGenders: string[];
  minAge: number;
  maxAge: number;
  latitude: number | null;
  longitude: number | null;
  followedUserIds: Set<string>;
  previouslyPassedIds: Set<string>;
  previouslyLikedIds: Set<string>;
  recentlySeenIds: Set<string>;
  hasInteractedWithIds: Set<string>;
}

export interface CandidateFeatures {
  userId: string;
  age: number | null;
  gender: string | null;
  datingIntent: string | null;
  interests: string[];
  profileCompletionPct: number;
  isVerified: boolean;
  hasBio: boolean;
  hasPhoto: boolean;
  photoCount: number;
  distanceKm: number | null;
  latitude: number | null;
  longitude: number | null;
  lastSeenAt: string | null;
  createdAt: string;
  isFollowing: boolean;
  followerCount: number;
  followingCount: number;
  mutualFollowCount: number;
  likeCount: number;
  passCount: number;
  matchCount: number;
}

export interface NormalizedFeatures {
  interestSimilarity: number;
  preferenceCompatibility: number;
  locationScore: number;
  activityScore: number;
  profileQuality: number;
  mutualConnectionScore: number;
  interactionAffinity: number;
  freshnessScore: number;
  diversityScore: number;
  explorationScore: number;
}

// ─── Feature Extraction ─────────────────────────────────────────────────

/**
 * Extract normalized features for a viewer-candidate pair.
 * All features return 0.0–1.0.
 * Safe fallback: if any calculation fails, returns 0 for that feature.
 */
export function extractFeatures(
  viewer: ViewerFeatures,
  candidate: CandidateFeatures,
): NormalizedFeatures {
  return {
    interestSimilarity: calculateInterestSimilarity(viewer.interests, candidate.interests),
    preferenceCompatibility: calculatePreferenceCompatibility(viewer, candidate),
    locationScore: calculateLocationScore(viewer, candidate),
    activityScore: calculateActivityScore(candidate),
    profileQuality: calculateProfileQuality(candidate),
    mutualConnectionScore: calculateMutualConnectionScore(candidate),
    interactionAffinity: calculateInteractionAffinity(viewer, candidate),
    freshnessScore: calculateFreshnessScore(candidate),
    diversityScore: 0, // Set by diversity module
    explorationScore: 0, // Set by exploration module
  };
}

// ─── Interest Similarity (0.0–1.0) ─────────────────────────────────────

function calculateInterestSimilarity(
  viewerInterests: string[],
  candidateInterests: string[],
): number {
  if (viewerInterests.length === 0 || candidateInterests.length === 0) {
    return 0;
  }

  const viewerSet = new Set(viewerInterests);
  let shared = 0;
  for (const interest of candidateInterests) {
    if (viewerSet.has(interest)) shared++;
  }

  // Jaccard similarity: intersection / union
  const union = new Set([...viewerInterests, ...candidateInterests]);
  const similarity = union.size > 0 ? shared / union.size : 0;

  return similarity;
}

// ─── Preference Compatibility (0.0–1.0) ─────────────────────────────────

function calculatePreferenceCompatibility(
  viewer: ViewerFeatures,
  candidate: CandidateFeatures,
): number {
  let score = 0;
  let factors = 0;

  // Age compatibility
  if (candidate.age !== null && viewer.minAge > 0 && viewer.maxAge > 0) {
    factors++;
    if (candidate.age >= viewer.minAge && candidate.age <= viewer.maxAge) {
      score += 1;
    } else {
      // Partial score for being close to range
      const distanceFromRange = Math.max(
        viewer.minAge - candidate.age,
        candidate.age - viewer.maxAge,
        0,
      );
      score += Math.max(0, 1 - distanceFromRange / 20);
    }
  }

  // Gender compatibility
  if (candidate.gender && viewer.preferredGenders.length > 0) {
    factors++;
    if (viewer.preferredGenders.includes(candidate.gender)) {
      score += 1;
    }
  }

  // Dating intent compatibility
  if (viewer.datingIntent && candidate.datingIntent) {
    factors++;
    const compatible = INTENT_COMPATIBILITY_MATRIX[viewer.datingIntent];
    if (compatible && compatible.includes(candidate.datingIntent)) {
      // Exact match is better than compatible
      if (viewer.datingIntent === candidate.datingIntent) {
        score += 1;
      } else {
        score += 0.7;
      }
    }
  }

  return factors > 0 ? score / factors : 0;
}

// ─── Location Score (0.0–1.0) ──────────────────────────────────────────

function calculateLocationScore(
  viewer: ViewerFeatures,
  candidate: CandidateFeatures,
): number {
  if (candidate.distanceKm === null || viewer.latitude === null) {
    return 0.3; // Neutral score when no location data
  }

  // Smooth decay: closer = higher score
  // Score decays from 1.0 at 0km to ~0 at maxDistance
  const maxDistance = Math.max(viewer.maxAge * 5, 100); // Dynamic cap
  const normalizedDistance = Math.min(candidate.distanceKm / maxDistance, 1);
  const score = 1 - Math.pow(normalizedDistance, 0.5); // Sub-linear decay (starts high, decays smoothly)

  return Math.max(0, score);
}

// ─── Activity Score (0.0–1.0) ──────────────────────────────────────────

function calculateActivityScore(candidate: CandidateFeatures): number {
  if (!candidate.lastSeenAt) {
    return 0.1; // Low but non-zero for unknown activity
  }

  const hoursSinceActive =
    (Date.now() - new Date(candidate.lastSeenAt).getTime()) / (1000 * 60 * 60);

  if (hoursSinceActive < 24) return 1.0; // Active today
  if (hoursSinceActive < 72) return 0.8; // Active this week
  if (hoursSinceActive < 168) return 0.5; // Active this month
  if (hoursSinceActive < 720) return 0.2; // Active recently

  return 0.05; // Inactive for months
}

// ─── Profile Quality (0.0–1.0) ─────────────────────────────────────────

function calculateProfileQuality(candidate: CandidateFeatures): number {
  let score = 0;
  const maxScore = 7;

  // Has photo (weight: 2)
  if (candidate.hasPhoto) score += 2;

  // Has bio (weight: 1)
  if (candidate.hasBio) score += 1;

  // Profile completion (weight: 1)
  if (candidate.profileCompletionPct >= 80) score += 1;
  else if (candidate.profileCompletionPct >= 50) score += 0.5;

  // Has interests (weight: 1)
  if (candidate.interests.length >= 3) score += 1;
  else if (candidate.interests.length > 0) score += 0.5;

  // Verified (weight: 1)
  if (candidate.isVerified) score += 1;

  // Engagement (weight: 1)
  const totalEngagement = (candidate.likeCount ?? 0) + (candidate.matchCount ?? 0);
  if (totalEngagement > 50) score += 1;
  else if (totalEngagement > 10) score += 0.5;

  return Math.min(score / maxScore, 1);
}

// ─── Mutual Connection Score (0.0–1.0) ─────────────────────────────────

function calculateMutualConnectionScore(candidate: CandidateFeatures): number {
  if (candidate.mutualFollowCount > 5) return 0.9;
  if (candidate.mutualFollowCount > 2) return 0.7;
  if (candidate.mutualFollowCount > 0) return 0.5;
  return 0;
}

// ─── Interaction Affinity (0.0–1.0) ────────────────────────────────────

function calculateInteractionAffinity(
  viewer: ViewerFeatures,
  candidate: CandidateFeatures,
): number {
  let score = 0;

  // Following each other is a strong signal
  if (candidate.isFollowing) score += 0.6;

  // Previously liked is a strong signal
  if (viewer.previouslyLikedIds.has(candidate.userId)) score += 0.8;

  // Previously passed is negative signal
  if (viewer.previouslyPassedIds.has(candidate.userId)) {
    score -= REPEATED_PASS_PENALTY;
  }

  // Recently seen reduces score (fatigue)
  if (viewer.recentlySeenIds.has(candidate.userId)) {
    score *= RECENTLY_SEEN_PENALTY;
  }

  return Math.max(0, Math.min(score, 1));
}

// ─── Freshness Score (0.0–1.0) ─────────────────────────────────────────

function calculateFreshnessScore(candidate: CandidateFeatures): number {
  const hoursSinceCreation =
    (Date.now() - new Date(candidate.createdAt).getTime()) / (1000 * 60 * 60);

  // New profiles get a boost
  if (hoursSinceCreation < NEW_CANDIDATE_WINDOW_HOURS) {
    return 1 - hoursSinceCreation / NEW_CANDIDATE_WINDOW_HOURS;
  }

  return 0;
}

// ─── Decay Helper ──────────────────────────────────────────────────────

/**
 * Apply exponential decay to a signal based on its age.
 * Returns a multiplier (0.0–1.0) for the signal weight.
 */
export function decaySignal(hoursOld: number): number {
  if (hoursOld > SIGNAL_MAX_AGE_HOURS) return 0;
  return Math.pow(0.5, hoursOld / SIGNAL_DECAY_HALF_LIFE_HOURS);
}
