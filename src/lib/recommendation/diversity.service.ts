/**
 * Diversity + Exploration Service.
 *
 * After initial ranking, applies:
 *   1. Diversity — MMR (Maximum Marginal Relevance) to avoid showing similar profiles
 *   2. Exploration — Controlled random injection of new candidates
 *
 * Safety filters are always preserved — exploration never bypasses eligibility.
 */

import {
  DIVERSITY_LAMBDA,
  DIVERSITY_SIMILARITY_THRESHOLD,
  EXPLORATION_RATE,
  EXPLORATION_SEED_BASE,
  EXPLORATORY_POOL_SIZE,
} from "@/lib/recommendation/constants";

// ─── Scored Candidate ───────────────────────────────────────────────────

export interface ScoredCandidate {
  userId: string;
  score: number;
  features: {
    interestSimilarity: number;
    locationScore: number;
    profileQuality: number;
    [key: string]: number;
  };
  interests: string[];
  city: string | null;
}

// ─── MMR Diversity Reranking ────────────────────────────────────────────

/**
 * Apply Maximum Marginal Relevance (MMR) diversity reranking.
 *
 * Balances relevance (score) against similarity to already-selected items.
 *
 * MMR = λ * relevance - (1 - λ) * maxSimilarity(selected)
 *
 * Where λ controls the diversity-relevance trade-off:
 *   1.0 = pure relevance (no diversity)
 *   0.0 = pure diversity (no relevance)
 */
export function applyDiversityReranking(
  candidates: ScoredCandidate[],
  lambda: number = DIVERSITY_LAMBDA,
): ScoredCandidate[] {
  if (candidates.length <= 1) return candidates;

  const reranked: ScoredCandidate[] = [];
  const remaining = [...candidates];

  // Pick the highest-scoring candidate first
  reranked.push(remaining.shift()!);

  // Iteratively select the candidate with highest marginal relevance
  while (remaining.length > 0) {
    let bestIdx = -1;
    let bestMMR = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];

      // Relevance component: the candidate's score
      const relevance = candidate.score;

      // Diversity component: max similarity to any already-selected candidate
      let maxSimilarity = 0;
      for (const selected of reranked) {
        const similarity = calculateCandidateSimilarity(candidate, selected);
        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
        }
      }

      // MMR formula
      const mmr = lambda * relevance - (1 - lambda) * maxSimilarity;

      if (mmr > bestMMR) {
        bestMMR = mmr;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      reranked.push(remaining[bestIdx]);
      remaining.splice(bestIdx, 1);
    } else {
      break;
    }
  }

  return reranked;
}

// ─── Candidate Similarity ───────────────────────────────────────────────

/**
 * Calculate similarity between two candidates based on their features.
 * Returns 0.0–1.0 where 1.0 = identical.
 */
function calculateCandidateSimilarity(
  a: ScoredCandidate,
  b: ScoredCandidate,
): number {
  let similarity = 0;
  let factors = 0;

  // Interest overlap
  if (a.interests.length > 0 || b.interests.length > 0) {
    factors++;
    const aSet = new Set(a.interests);
    let shared = 0;
    for (const i of b.interests) {
      if (aSet.has(i)) shared++;
    }
    const union = new Set([...a.interests, ...b.interests]);
    similarity += union.size > 0 ? shared / union.size : 0;
  }

  // Location similarity
  if (a.city && b.city) {
    factors++;
    if (a.city === b.city) similarity += 1;
  }

  // Score similarity (features profile)
  factors++;
  const scoreDiff = Math.abs(a.score - b.score);
  similarity += 1 - Math.min(scoreDiff, 1);

  return factors > 0 ? similarity / factors : 0;
}

// ─── Exploration Injection ──────────────────────────────────────────────

/**
 * Inject controlled exploration candidates into the ranked list.
 * Uses a seeded selector for stability within a session.
 *
 * Exploration candidates are placed at configurable positions
 * (e.g., every 5th slot) without pushing high-relevance candidates
 * completely out of view.
 */
export function injectExploration(
  rankedCandidates: ScoredCandidate[],
  explorationPool: ScoredCandidate[],
  rate: number = EXPLORATION_RATE,
  sessionSeed?: number,
): ScoredCandidate[] {
  if (explorationPool.length === 0) return rankedCandidates;
  if (rankedCandidates.length <= 1) return rankedCandidates;

  const result = [...rankedCandidates];
  const explorationCount = Math.max(
    1,
    Math.floor(rankedCandidates.length * rate),
  );

  // Use seeded selection for stability
  const seed = sessionSeed ?? EXPLORATION_SEED_BASE;
  const rng = seededRandom(seed);

  const selectedExploration: ScoredCandidate[] = [];
  const available = [...explorationPool];

  for (let i = 0; i < Math.min(explorationCount, available.length); i++) {
    const idx = Math.floor(rng() * available.length);
    selectedExploration.push(available[idx]);
    available.splice(idx, 1);
  }

  // Inject at spaced positions (e.g., every Nth position)
  const interval = Math.max(2, Math.floor(rankedCandidates.length / explorationCount));

  for (let i = 0; i < selectedExploration.length; i++) {
    const insertPos = Math.min(
      (i + 1) * interval,
      result.length - 1,
    );
    result.splice(insertPos, 0, selectedExploration[i]);
  }

  return result;
}

// ─── Seeded Random (for stable exploration) ─────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ─── Apply All Diversification ──────────────────────────────────────────

export interface DiversificationInput {
  ranked: ScoredCandidate[];
  explorationCandidates: ScoredCandidate[];
  lambda?: number;
  explorationRate?: number;
  sessionSeed?: number;
}

/**
 * Apply all diversification: diversity reranking + exploration injection.
 */
export function diversifyCandidates(input: DiversificationInput): ScoredCandidate[] {
  const { ranked, explorationCandidates, lambda, explorationRate, sessionSeed } = input;

  // Step 1: Apply diversity reranking
  const diversified = applyDiversityReranking(ranked, lambda);

  // Step 2: Inject exploration
  const withExploration = injectExploration(
    diversified,
    explorationCandidates,
    explorationRate,
    sessionSeed,
  );

  // Step 3: Re-sort by final score (preserving diversity ordering for display)
  // The diversity reranking already sorted, but exploration may have inserted
  // We preserve the order: diversified list with exploration interleaved
  return withExploration;
}
