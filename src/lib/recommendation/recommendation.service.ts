/**
 * Recommendation Service — Unified entry point for intelligent recommendations.
 *
 * This wraps Prompt 12's search/discovery system with:
 *   1. Feature extraction (normalized 0–1 features)
 *   2. Mutual compatibility scoring
 *   3. Ranking with configurable weights
 *   4. Diversity reranking (MMR)
 *   5. Exploration injection
 *   6. Impression tracking for feedback
 *   7. Recommendation explanations
 *
 * Architecture:
 *   getRecommendations() → Prompt 12 candidates → feature extraction
 *   → ranking → diversity → exploration → impressions → result
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";
import { RateLimiter } from "@/lib/rate-limiter";
import { discoverProfiles, getDiscoveryCandidates } from "@/lib/discovery/discovery.service";
import type { DiscoveryRequestInput } from "@/lib/discovery/schemas";
import type {
  DiscoveryResponse,
  SocialDiscoveryResponse,
  DiscoveryCandidate,
  SearchProfileResult,
} from "@/lib/discovery/schemas";
import {
  extractFeatures,
  type ViewerFeatures,
  type CandidateFeatures,
} from "@/lib/recommendation/feature.service";
import { calculateMutualCompatibility } from "@/lib/recommendation/compatibility.service";
import {
  getRankingConfig,
  rankCandidates,
  getCompatibilityBadge,
  type RankingConfig,
  type RankedCandidateResult,
} from "@/lib/recommendation/ranking.service";
import {
  RANKING_VERSION,
  CANDIDATE_POOL_SIZE,
  EXPLORATORY_POOL_SIZE,
} from "@/lib/recommendation/constants";

// ─── Types ──────────────────────────────────────────────────────────────

export interface RecommendationResult {
  items: RecommendationItem[];
  nextCursor: string | null;
  hasMore: boolean;
  requestId: string;
  rankingVersion: string;
}

export interface RecommendationItem {
  id: string;
  profile: DiscoveryCandidate | SearchProfileResult;
  score: number;
  compatibility: {
    badge: string;
    sharedInterests: number;
    intentMatch: boolean;
  };
  reasons: string[];
  /** Mode-specific data */
  mode: "dating" | "social";
}

export interface RecommendationInput {
  mode: "dating" | "social";
  viewerId: string;
  query?: string;
  filters?: DiscoveryRequestInput["filters"];
  sort?: string;
  cursor?: string;
  limit?: number;
  requestId?: string;
}

// ─── Rate Limiter ───────────────────────────────────────────────────────

const recommendationRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  name: "recommendation",
});

// ─── Get Recommendations ────────────────────────────────────────────────

/**
 * Get intelligent recommendations for a user.
 *
 * Pipeline:
 *   1. Call Prompt 12's candidate retrieval
 *   2. Build viewer + candidate features
 *   3. Calculate mutual compatibility
 *   4. Rank with configured weights
 *   5. Apply diversity + exploration
 *   6. Record impressions for feedback
 *   7. Return ranked results with explanations
 */
export async function getRecommendations(
  input: RecommendationInput,
): Promise<RecommendationResult> {
  const { mode, viewerId, query, filters, sort, cursor, limit = 20, requestId: providedRequestId } = input;

  // ─── Rate limit ────────────────────────────────────────────────────
  await recommendationRateLimiter.enforce(viewerId);

  // ─── Generate request ID ───────────────────────────────────────────
  const requestId = providedRequestId ?? crypto.randomUUID();

  // ─── Step 1: Retrieve candidates from Prompt 12 ────────────────────
  let candidates: Array<DiscoveryCandidate | SearchProfileResult> = [];
  let nextCursor: string | null = null;
  let hasMore = false;

  try {
    const discoveryInput: DiscoveryRequestInput = {
      mode,
      query,
      filters,
      sort: sort as any,
      cursor,
      limit: Math.min(limit, CANDIDATE_POOL_SIZE),
    };

    const result = await discoverProfiles(viewerId, discoveryInput);

    if ("items" in result) {
      candidates = result.items;
      nextCursor = result.nextCursor;
      hasMore = result.hasMore;
    } else {
      // Not eligible — pass through
      return {
        items: [],
        nextCursor: null,
        hasMore: false,
        requestId,
        rankingVersion: RANKING_VERSION,
      };
    }
  } catch (err) {
    logger.error("Candidate retrieval failed for recommendations", {
      error: err instanceof Error ? err.message : "Unknown",
    });

    // Fallback to basic discovery
    try {
      const fallbackResult = await getDiscoveryCandidates(viewerId, { cursor, limit });
      if ("items" in fallbackResult && fallbackResult.items) {
        candidates = fallbackResult.items;
        nextCursor = fallbackResult.nextCursor;
        hasMore = fallbackResult.hasMore;
      }
    } catch {
      // Return empty if everything fails
      return {
        items: [],
        nextCursor: null,
        hasMore: false,
        requestId,
        rankingVersion: RANKING_VERSION,
      };
    }
  }

  if (candidates.length === 0) {
    return {
      items: [],
      nextCursor: null,
      hasMore: false,
      requestId,
      rankingVersion: RANKING_VERSION,
    };
  }

  // ─── Step 2: Build viewer features ─────────────────────────────────
  const viewerFeatures = await buildViewerFeatures(viewerId);
  if (!viewerFeatures) {
    // Fallback: return candidates as-is from Prompt 12
    return {
      items: candidates.map((c) => ({
        id: c.id,
        profile: c,
        score: 0.5,
        compatibility: { badge: "", sharedInterests: 0, intentMatch: false },
        reasons: [],
        mode,
      })),
      nextCursor,
      hasMore,
      requestId,
      rankingVersion: RANKING_VERSION,
    };
  }

  // ─── Step 3: Build candidate features + rank ───────────────────────
  const candidateIds = candidates.map((c) => c.id);
  const candidateFeaturesMap = await buildCandidateFeatures(candidateIds, viewerId);

  const candidateData = candidates.map((c) => {
    const cf = candidateFeaturesMap.get(c.id);
    const features = cf
      ? extractFeatures(viewerFeatures, cf)
      : {
          interestSimilarity: 0,
          preferenceCompatibility: 0,
          locationScore: 0,
          activityScore: 0,
          profileQuality: 0,
          mutualConnectionScore: 0,
          interactionAffinity: 0,
          freshnessScore: 0,
          diversityScore: 0,
          explorationScore: 0,
        };

    return {
      userId: c.id,
      features,
      interests: ("interests" in c && c.interests
        ? c.interests.map((i: any) => i.id ?? i.name ?? "")
        : []
      ),
      city: ("city" in c && c.city ? c.city : null) as string | null,
    };
  });

  const config = getRankingConfig(mode);
  const ranked = rankCandidates(candidateData, config);

  // ─── Step 4: Record impressions ────────────────────────────────────
  await recordImpressions(
    viewerId,
    requestId,
    mode,
    ranked.slice(0, limit),
  ).catch(() => {});

  // ─── Step 5: Build response ────────────────────────────────────────
  const items: RecommendationItem[] = ranked.slice(0, limit).map((r) => {
    const profile = candidates.find((c) => c.id === r.userId);
    const sharedInterests = profile
      ? ("compatibility" in profile
          ? profile.compatibility?.sharedInterests ?? 0
          : "sharedInterests" in profile
            ? profile.sharedInterests ?? 0
            : 0)
      : 0;

    const intentMatch = profile
      ? ("compatibility" in profile ? profile.compatibility?.intentMatch ?? false : false)
      : false;

    return {
      id: r.userId,
      profile: profile ?? candidates[0],
      score: r.score,
      compatibility: {
        badge: getCompatibilityBadge(r.score),
        sharedInterests: typeof sharedInterests === "number" ? sharedInterests : 0,
        intentMatch,
      },
      reasons: r.reasons,
      mode,
    };
  });

  // ─── Track analytics ───────────────────────────────────────────────
  await trackEvent(viewerId, "recommendation_request", "recommendation", requestId, {
    mode,
    rankingVersion: RANKING_VERSION,
    resultCount: items.length,
    hasMore,
  }).catch(() => {});

  return {
    items,
    nextCursor,
    hasMore,
    requestId,
    rankingVersion: RANKING_VERSION,
  };
}

// ─── Viewer Feature Builder ─────────────────────────────────────────────

async function buildViewerFeatures(
  viewerId: string,
): Promise<ViewerFeatures | null> {
  try {
    const adminClient = createAdminClient();

    // Get profile
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, date_of_birth, gender, dating_intent, latitude, longitude")
      .eq("user_id", viewerId)
      .single();

    if (!profile) return null;

    // Get preferences
    const { data: prefs } = await adminClient
      .from("profile_preferences")
      .select("*")
      .eq("user_id", viewerId)
      .single();

    // Get interests
    const { data: interestRows } = await adminClient
      .from("profile_interests")
      .select("interest_id")
      .eq("profile_id", profile.id);

    const interests = (interestRows ?? []).map((r: any) => r.interest_id);

    // Get followed user IDs
    const { data: follows } = await adminClient
      .from("follows")
      .select("following_id")
      .eq("follower_id", viewerId);

    const followedIds = new Set((follows ?? []).map((f: any) => f.following_id));

    // Get previous dating actions
    const { data: actions } = await adminClient
      .from("dating_actions")
      .select("target_id, action")
      .eq("actor_id", viewerId);

    const passedIds = new Set(
      (actions ?? []).filter((a: any) => a.action === "pass").map((a: any) => a.target_id),
    );
    const likedIds = new Set(
      (actions ?? []).filter((a: any) => a.action === "like" || a.action === "super_like").map((a: any) => a.target_id),
    );

    // Get recently seen IDs (last 24h)
    const recentThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentImpressions } = await adminClient
      .from("recommendation_impressions")
      .select("candidate_id")
      .eq("viewer_id", viewerId)
      .gte("created_at", recentThreshold);

    const recentlySeen = new Set(
      (recentImpressions ?? []).map((r: any) => r.candidate_id),
    );

    return {
      userId: viewerId,
      interests,
      datingIntent: profile.dating_intent ?? null,
      preferredGenders: (prefs?.preferred_genders as string[]) ?? [],
      minAge: prefs?.min_age ?? 18,
      maxAge: prefs?.max_age ?? 60,
      latitude: profile.latitude ? parseFloat(profile.latitude) : null,
      longitude: profile.longitude ? parseFloat(profile.longitude) : null,
      followedUserIds: followedIds,
      previouslyPassedIds: passedIds,
      previouslyLikedIds: likedIds,
      recentlySeenIds: recentlySeen,
      hasInteractedWithIds: new Set([...passedIds, ...likedIds]),
    };
  } catch (err) {
    logger.error("Failed to build viewer features", {
      error: err instanceof Error ? err.message : "Unknown",
    });
    return null;
  }
}

// ─── Candidate Feature Builder ──────────────────────────────────────────

async function buildCandidateFeatures(
  candidateIds: string[],
  viewerId: string,
): Promise<Map<string, CandidateFeatures>> {
  const adminClient = createAdminClient();
  const result = new Map<string, CandidateFeatures>();

  if (candidateIds.length === 0) return result;

  try {
    // Batch fetch user data
    const { data: users } = await adminClient
      .from("users")
      .select("id, last_seen_at, created_at")
      .in("id", candidateIds);

    const userMap = new Map(
      (users ?? []).map((u: any) => [u.id, u]),
    );

    // Batch fetch profile data
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("user_id, date_of_birth, gender, dating_intent, profile_completion_pct, is_verified, bio, latitude, longitude, created_at")
      .in("user_id", candidateIds);

    const profileMap = new Map(
      (profiles ?? []).map((p: any) => [p.user_id, p]),
    );

    // Get mutual follows
    const { data: mutualFollows } = await adminClient
      .from("follows")
      .select("follower_id")
      .eq("following_id", viewerId)
      .in("follower_id", candidateIds);

    const mutualFollowSet = new Set(
      (mutualFollows ?? []).map((f: any) => f.follower_id),
    );

    // Get interest counts per user
    const { data: profileIdMap } = await adminClient
      .from("profiles")
      .select("id, user_id")
      .in("user_id", candidateIds);

    const profileByUser = new Map(
      (profileIdMap ?? []).map((p: any) => [p.user_id, p.id]),
    );

    const allProfileIds = Array.from(profileByUser.values());
    const { data: interests } = await adminClient
      .from("profile_interests")
      .select("profile_id, interest_id")
      .in("profile_id", allProfileIds);

    const interestMap = new Map<string, string[]>();
    for (const row of interests ?? []) {
      if (!interestMap.has(row.profile_id)) {
        interestMap.set(row.profile_id, []);
      }
      interestMap.get(row.profile_id)!.push(row.interest_id);
    }

    // Get photo counts
    const { data: photoCounts } = await adminClient
      .from("profile_photos")
      .select("user_id")
      .in("user_id", candidateIds);

    const photoCountMap = new Map<string, number>();
    for (const p of photoCounts ?? []) {
      photoCountMap.set(p.user_id, (photoCountMap.get(p.user_id) ?? 0) + 1);
    }

    // Get dating action counts
    for (const uid of candidateIds) {
      const profile = profileMap.get(uid);
      const user = userMap.get(uid);
      const profileId = profileByUser.get(uid);

      const age = profile?.date_of_birth
        ? calculateAgeFromDB(profile.date_of_birth)
        : null;

      result.set(uid, {
        userId: uid,
        age,
        gender: profile?.gender ?? null,
        datingIntent: profile?.dating_intent ?? null,
        interests: (profileId ? interestMap.get(profileId) ?? [] : []),
        profileCompletionPct: profile?.profile_completion_pct ?? 0,
        isVerified: profile?.is_verified ?? false,
        hasBio: !!(profile?.bio && profile.bio.trim().length > 0),
        hasPhoto: (photoCountMap.get(uid) ?? 0) > 0,
        photoCount: photoCountMap.get(uid) ?? 0,
        distanceKm: null, // Calculated by Prompt 12
        latitude: profile?.latitude ? parseFloat(profile.latitude) : null,
        longitude: profile?.longitude ? parseFloat(profile.longitude) : null,
        lastSeenAt: user?.last_seen_at ?? null,
        createdAt: user?.created_at ?? profile?.created_at ?? new Date().toISOString(),
        isFollowing: mutualFollowSet.has(uid),
        followerCount: 0,
        followingCount: 0,
        mutualFollowCount: mutualFollowSet.has(uid) ? 1 : 0,
        likeCount: 0,
        passCount: 0,
        matchCount: 0,
      });
    }
  } catch (err) {
    logger.error("Failed to build candidate features", {
      error: err instanceof Error ? err.message : "Unknown",
    });
  }

  return result;
}

// ─── Impression Recording ───────────────────────────────────────────────

async function recordImpressions(
  viewerId: string,
  requestId: string,
  mode: string,
  candidates: RankedCandidateResult[],
): Promise<void> {
  try {
    const adminClient = createAdminClient();
    const impressions = candidates.map((c, idx) => ({
      viewer_id: viewerId,
      candidate_id: c.userId,
      mode,
      request_id: requestId,
      ranking_version: RANKING_VERSION,
      position: idx,
      score_bucket: c.score >= 0.7 ? "high" : c.score >= 0.4 ? "medium" : "low",
    }));

    // Batch insert impressions
    await adminClient.from("recommendation_impressions").insert(impressions);
  } catch (err) {
    // Non-critical — don't break recommendations for impression tracking
    logger.warn("Failed to record impressions", {
      error: err instanceof Error ? err.message : "Unknown",
    });
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────

function calculateAgeFromDB(dateOfBirth: string): number {
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const mDiff = today.getMonth() - birth.getMonth();
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
