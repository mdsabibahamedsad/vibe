/**
 * Compatibility Service — Mutual preference compatibility scoring.
 *
 * Computes how compatible two users are based on their preferences,
 * interests, and dating intents. Evaluates both directions:
 *   viewer → candidate compatibility
 *   candidate → viewer compatibility
 *
 * All scores are normalized to 0.0–1.0.
 */

import { INTENT_COMPATIBILITY_MATRIX } from "@/lib/discovery/constants";

interface CompatUserData {
  userId: string;
  age: number | null;
  gender: string | null;
  preferredGenders: string[];
  minAge: number;
  maxAge: number;
  datingIntent: string | null;
  interests: string[];
  distanceKm: number | null;
  maxDistanceKm: number;
}

interface CompatibilityScore {
  /** Overall compatibility (0.0–1.0) */
  overall: number;
  /** Whether the pair is minimally compatible */
  isCompatible: boolean;
  /** Directional scores */
  viewerToCandidate: number;
  candidateToViewer: number;
  /** Individual factor scores */
  factors: {
    ageCompatibility: number;
    genderCompatibility: number;
    intentMatch: boolean;
    intentScore: number;
    interestSimilarity: number;
    distanceCompatibility: number;
  };
}

/**
 * Calculate mutual compatibility between two users.
 * Evaluates both directions and combines them.
 */
export function calculateMutualCompatibility(
  viewer: CompatUserData,
  candidate: CompatUserData,
): CompatibilityScore {
  // ─── Direction 1: viewer → candidate ─────────────────────────────────
  const v2c = calculateDirectionalCompatibility(viewer, candidate);

  // ─── Direction 2: candidate → viewer ─────────────────────────────────
  const c2v = calculateDirectionalCompatibility(candidate, viewer);

  // ─── Combined score (geometric mean of both directions) ──────────────
  const overall = Math.sqrt(v2c.score * c2v.score);

  // ─── Minimum compatibility check ─────────────────────────────────────
  // Both directions must show at least basic compatibility
  const isCompatible = v2c.isMinimallyCompatible && c2v.isMinimallyCompatible;

  return {
    overall,
    isCompatible,
    viewerToCandidate: v2c.score,
    candidateToViewer: c2v.score,
    factors: {
      ageCompatibility: (v2c.factors.ageCompatibility + c2v.factors.ageCompatibility) / 2,
      genderCompatibility: (v2c.factors.genderCompatibility + c2v.factors.genderCompatibility) / 2,
      intentMatch: v2c.factors.intentMatch || c2v.factors.intentMatch,
      intentScore: (v2c.factors.intentScore + c2v.factors.intentScore) / 2,
      interestSimilarity: (v2c.factors.interestSimilarity + c2v.factors.interestSimilarity) / 2,
      distanceCompatibility: (v2c.factors.distanceCompatibility + c2v.factors.distanceCompatibility) / 2,
    },
  };
}

interface DirectionalResult {
  score: number;
  isMinimallyCompatible: boolean;
  factors: {
    ageCompatibility: number;
    genderCompatibility: number;
    intentMatch: boolean;
    intentScore: number;
    interestSimilarity: number;
    distanceCompatibility: number;
  };
}

/**
 * Calculate compatibility from one user's perspective toward another.
 */
function calculateDirectionalCompatibility(
  from: CompatUserData,
  to: CompatUserData,
): DirectionalResult {
  const factors = {
    ageCompatibility: calculateAgeCompat(from, to),
    genderCompatibility: calculateGenderCompat(from, to),
    intentMatch: calculateIntentMatch(from, to),
    intentScore: calculateIntentScore(from, to),
    interestSimilarity: calculateInterestSimilarity(from.interests, to.interests),
    distanceCompatibility: calculateDistanceCompat(from, to),
  };

  // Weighted combination
  const score =
    factors.ageCompatibility * 0.20 +
    factors.genderCompatibility * 0.20 +
    factors.intentScore * 0.20 +
    factors.interestSimilarity * 0.20 +
    factors.distanceCompatibility * 0.20;

  // Minimum compatibility: age and gender must pass (hard requirements for dating)
  const isMinimallyCompatible =
    factors.ageCompatibility > 0.3 &&
    factors.genderCompatibility > 0.3;

  return { score, isMinimallyCompatible, factors };
}

// ─── Age Compatibility (0.0–1.0) ────────────────────────────────────────

function calculateAgeCompat(from: CompatUserData, to: CompatUserData): number {
  if (to.age === null || from.minAge <= 0) return 0.5; // Neutral

  if (to.age >= from.minAge && to.age <= from.maxAge) return 1.0;

  // Partial compatibility if close to range
  const distance = Math.max(from.minAge - to.age, to.age - from.maxAge, 0);
  return Math.max(0, 1 - distance / 10);
}

// ─── Gender Compatibility (0.0–1.0) ─────────────────────────────────────

function calculateGenderCompat(from: CompatUserData, to: CompatUserData): number {
  if (!to.gender || from.preferredGenders.length === 0) return 0.5; // Neutral
  if (from.preferredGenders.includes(to.gender)) return 1.0;
  return 0;
}

// ─── Intent Match (boolean) ─────────────────────────────────────────────

function calculateIntentMatch(from: CompatUserData, to: CompatUserData): boolean {
  if (!from.datingIntent || !to.datingIntent) return true; // Unknown intents are open
  const compat = INTENT_COMPATIBILITY_MATRIX[from.datingIntent];
  if (!compat) return false;
  return compat.includes(to.datingIntent);
}

// ─── Intent Score (0.0–1.0) ─────────────────────────────────────────────

function calculateIntentScore(from: CompatUserData, to: CompatUserData): number {
  if (!from.datingIntent || !to.datingIntent) return 0.5; // Neutral
  const compat = INTENT_COMPATIBILITY_MATRIX[from.datingIntent];
  if (!compat) return 0;
  if (from.datingIntent === to.datingIntent) return 1.0;
  if (compat.includes(to.datingIntent)) return 0.7;
  return 0;
}

// ─── Interest Similarity (0.0–1.0) ─────────────────────────────────────

function calculateInterestSimilarity(
  fromInterests: string[],
  toInterests: string[],
): number {
  if (fromInterests.length === 0 || toInterests.length === 0) return 0;

  const fromSet = new Set(fromInterests);
  let shared = 0;
  for (const i of toInterests) {
    if (fromSet.has(i)) shared++;
  }

  const union = new Set([...fromInterests, ...toInterests]);
  return union.size > 0 ? shared / union.size : 0;
}

// ─── Distance Compatibility (0.0–1.0) ──────────────────────────────────

function calculateDistanceCompat(from: CompatUserData, to: CompatUserData): number {
  if (to.distanceKm === null || from.maxDistanceKm <= 0) return 0.5; // Neutral
  if (to.distanceKm <= from.maxDistanceKm) return 1.0;
  // Partial penalty for being slightly over
  const overRatio = to.distanceKm / from.maxDistanceKm;
  return Math.max(0, 1 - (overRatio - 1) * 0.5);
}
