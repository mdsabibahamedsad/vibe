/**
 * Ranking Service — Configurable recommendation ranking engine.
 *
 * Supports both social and dating ranking configurations.
 * All features should already be normalized to 0.0–1.0 by feature.service.ts.
 *
 * Architecture:
 *   scoring function applies configured weights to normalized features
 *   → diversity reranking
 *   → exploration injection
 *   → final score
 *
 * The engine is a RuleBasedRecommendationModel that implements
 * the RecommendationModel interface (ready for future ML replacement).
 */

import {
  DATING_RANKING_WEIGHTS,
  SOCIAL_RANKING_WEIGHTS,
  RANKING_VERSION,
} from "@/lib/recommendation/constants";
import type { NormalizedFeatures } from "@/lib/recommendation/feature.service";
import type { ScoredCandidate } from "@/lib/recommendation/diversity.service";
import {
  diversifyCandidates,
} from "@/lib/recommendation/diversity.service";

// ─── Recommendation Model Interface ─────────────────────────────────────

/**
 * Future ML recommendation model interface.
 * The current implementation uses rule-based scoring.
 * Replace with MLRecommendationModel later.
 */
export interface RecommendationModel {
  score(viewerFeatures: unknown, candidateFeatures: unknown): Promise<number>;
  readonly version: string;
}

// ─── Rule-Based Model ──────────────────────────────────────────────────

export class RuleBasedRecommendationModel implements RecommendationModel {
  readonly version: string;

  private datingWeights: Record<string, number>;
  private socialWeights: Record<string, number>;

  constructor(
    version: string = RANKING_VERSION,
    datingWeights?: Partial<Record<string, number>>,
    socialWeights?: Partial<Record<string, number>>,
  ) {
    this.version = version;
    this.datingWeights = { ...DATING_RANKING_WEIGHTS, ...datingWeights };
    this.socialWeights = { ...SOCIAL_RANKING_WEIGHTS, ...socialWeights };
  }

  async score(
    _viewerFeatures: unknown,
    _candidateFeatures: unknown,
  ): Promise<number> {
    // The scoring is done synchronously via calculateFinalScore
    // This method exists for future ML model compatibility
    throw new Error("Use calculateFinalScore for synchronous scoring");
  }
}

// ─── Ranking Configuration ──────────────────────────────────────────────

export interface RankingConfig {
  mode: "dating" | "social";
  weights: { [key: string]: number };
  diversityLambda?: number;
  explorationRate?: number;
  sessionSeed?: number;
}

/**
 * Get ranking configuration for a given mode.
 * Validates that weights are finite and within sensible bounds.
 */
export function getRankingConfig(mode: "dating" | "social"): RankingConfig {
  const baseWeights: Record<string, number> = mode === "dating"
    ? { ...DATING_RANKING_WEIGHTS }
    : { ...SOCIAL_RANKING_WEIGHTS };

  // Validate weights
  for (const [key, value] of Object.entries(baseWeights)) {
    if (typeof value !== "number" || !isFinite(value)) {
      baseWeights[key] = 0; // Fallback to 0 for invalid weights
    }
  }

  return {
    mode,
    weights: baseWeights,
    diversityLambda: 0.7,
    explorationRate: mode === "dating" ? 0.10 : 0.08,
  };
}

// ─── Final Score Calculation ───────────────────────────────────────────

/**
 * Calculate the final score for a candidate by applying configured weights
 * to normalized features. Returns a score in the 0.0–1.0 range.
 */
export function calculateFinalScore(
  features: NormalizedFeatures,
  weights: Record<string, number>,
): number {
  let score = 0;

  // Apply each weight to its corresponding feature
  for (const [featureKey, weight] of Object.entries(weights)) {
    const featureValue = features[featureKey as keyof NormalizedFeatures] ?? 0;
    score += featureValue * weight;
  }

  // Clamp to 0.0–1.0
  return Math.max(0, Math.min(score, 1));
}

// ─── Full Ranking Pipeline ─────────────────────────────────────────────

export interface RankedCandidateResult {
  userId: string;
  score: number;
  features: NormalizedFeatures;
  reasons: string[];
}

/**
 * Full ranking pipeline for a set of candidates.
 * Steps:
 *   1. Calculate features for each candidate
 *   2. Apply weights to get initial score
 *   3. Apply diversity reranking
 *   4. Inject exploration
 *   5. Return final ranked list
 */
export function rankCandidates(
  candidates: Array<{
    userId: string;
    features: NormalizedFeatures;
    interests: string[];
    city: string | null;
  }>,
  config: RankingConfig,
  explorationPool?: Array<{
    userId: string;
    features: NormalizedFeatures;
    interests: string[];
    city: string | null;
  }>,
): RankedCandidateResult[] {
  // Step 1: Calculate initial scores
  const scored: ScoredCandidate[] = candidates.map((c) => ({
    userId: c.userId,
    score: calculateFinalScore(c.features, config.weights),
    features: {
      interestSimilarity: c.features.interestSimilarity,
      locationScore: c.features.locationScore,
      profileQuality: c.features.profileQuality,
    },
    interests: c.interests,
    city: c.city,
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Step 2 & 3: Apply diversity + exploration
  const diversified = diversifyCandidates({
    ranked: scored,
    explorationCandidates: (explorationPool ?? []).map((e) => ({
      userId: e.userId,
      score: calculateFinalScore(e.features, config.weights),
      features: {
        interestSimilarity: e.features.interestSimilarity,
        locationScore: e.features.locationScore,
        profileQuality: e.features.profileQuality,
      },
      interests: e.interests,
      city: e.city,
    })),
    lambda: config.diversityLambda,
    explorationRate: config.explorationRate,
    sessionSeed: config.sessionSeed,
  });

  // Step 4: Build explanation reasons
  return diversified.map((c) => ({
    userId: c.userId,
    score: c.score,
    features: candidates.find((cc) => cc.userId === c.userId)?.features ?? {} as NormalizedFeatures,
    reasons: generateReasons(
      candidates.find((cc) => cc.userId === c.userId)?.features ?? {} as NormalizedFeatures,
    ),
  }));
}

// ─── Explanation Generation ────────────────────────────────────────────

/**
 * Generate safe user-facing explanation labels.
 * Never exposes internal scores or sensitive data.
 */
function generateReasons(features: NormalizedFeatures): string[] {
  const reasons: string[] = [];

  if (features.interestSimilarity > 0.3) reasons.push("shared_interest");
  if (features.locationScore > 0.6) reasons.push("nearby");
  if (features.mutualConnectionScore > 0.3) reasons.push("mutual_connection");
  if (features.preferenceCompatibility > 0.6) reasons.push("compatible_preferences");

  return reasons;
}

// ─── Compatibility Badge ───────────────────────────────────────────────

/**
 * Generate a user-facing compatibility badge label.
 * Uses rounded score buckets — never exposes exact scores.
 */
export function getCompatibilityBadge(score: number): string {
  if (score >= 0.8) return "Strong match";
  if (score >= 0.6) return "Great match";
  if (score >= 0.4) return "Good match";
  return "";
}
