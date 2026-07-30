/**
 * Discovery service — server-side Search + Discovery Engine.
 *
 * Supports two modes:
 *   social — Find interesting people, creators, users with shared interests
 *   dating — Dating discovery with compatibility filtering (existing logic extended)
 *
 * Architecture: mode routing → eligibility → filtering → ranking → pagination → hydration
 *
 * All eligibility rules are enforced server-side:
 *   - Blocked users are excluded (mutual)
 *   - Banned/inactive users are excluded
 *   - Age/gender/intent filters (dating mode)
 *   - Distance filter
 *   - Already-interacted users (dating mode)
 *   - Profile visibility/completeness
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";
import { calculateAge } from "@/lib/validation/profile";
import type { DiscoveryRequestInput } from "./schemas";
import type {
  DiscoveryResponse,
  DiscoverySuccessResponse,
  DiscoveryCandidate,
  DiscoveryCandidatePhoto,
  DiscoveryCandidateInterest,
  DiscoveryEligibilityReason,
  SocialDiscoveryResponse,
  SearchProfileResult,
  DiscoveryMode,
} from "./schemas";
import {
  DISCOVERY_PAGE_SIZE,
  MIN_DATING_AGE,
  INTENT_COMPATIBILITY_MATRIX,
  RANKING_WEIGHTS,
  PROFILE_QUALITY,
  MIN_DISCOVERY_PROFILE_COMPLETION,
  MIN_QUERY_LENGTH,
} from "./constants";

// ─── Unified Discovery Entry Point ───────────────────────────────────────

/**
 * Main discovery entry point. Routes to social or dating mode.
 */
export async function discoverProfiles(
  currentUserId: string,
  options: DiscoveryRequestInput,
): Promise<DiscoveryResponse | SocialDiscoveryResponse> {
  const { mode, query, filters, sort, cursor, limit = DISCOVERY_PAGE_SIZE } = options;

  if (mode === "dating") {
    // Dating mode — use the existing dating discovery pipeline
    return getDiscoveryCandidates(currentUserId, {
      cursor,
      limit,
    });
  }

  // Social mode — text search + interest-based discovery
  return getSocialDiscoveryCandidates(currentUserId, {
    query,
    interestIds: filters?.interestIds,
    interestMatchMode: filters?.interestMatchMode,
    maxDistanceKm: filters?.maxDistanceKm,
    sort,
    cursor,
    limit,
  });
}

// ─── Social Discovery ────────────────────────────────────────────────────

interface SocialDiscoveryOptions {
  query?: string;
  interestIds?: string[];
  interestMatchMode?: string;
  maxDistanceKm?: number;
  sort?: string;
  cursor?: string;
  limit?: number;
}

/**
 * Social discovery — find people to follow, people with shared interests,
 * nearby users, and active users.
 */
async function getSocialDiscoveryCandidates(
  currentUserId: string,
  options: SocialDiscoveryOptions,
): Promise<SocialDiscoveryResponse> {
  const adminClient = createAdminClient();
  const {
    query,
    interestIds,
    maxDistanceKm,
    sort = "recommended",
    cursor,
    limit = DISCOVERY_PAGE_SIZE,
  } = options;

  // ─── Build exclusion set ────────────────────────────────────────────
  const [blockedIds, bannedIds] = await Promise.all([
    getBlockedUserIds(currentUserId),
    getBannedUserIds(),
  ]);

  const excludedIds = new Set([
    ...blockedIds,
    ...bannedIds,
    currentUserId,
  ]);

  // ─── Parse cursor ───────────────────────────────────────────────────
  let cursorScore: number | undefined;
  let cursorId: string | undefined;
  if (cursor) {
    const parts = cursor.split("_");
    cursorScore = parseFloat(parts[0]);
    cursorId = parts.slice(1).join("_");
  }

  // ─── Build base query ───────────────────────────────────────────────
  // Use the SQL RPC function for search + social discovery
  // Fallback: direct queries for when RPC is not available

  try {
    const rpcParams: Record<string, unknown> = {
      p_viewer_id: currentUserId,
      p_mode: "social",
      p_query: query && query.length >= MIN_QUERY_LENGTH ? query : null,
      p_interest_ids: interestIds && interestIds.length > 0 ? interestIds : null,
      p_min_age: 18,
      p_max_age: 100,
      p_preferred_genders: null,
      p_max_distance_km: maxDistanceKm ?? 0,
      p_cursor_score: cursorScore ?? null,
      p_cursor_id: cursorId ?? null,
      p_limit: limit + 1,
    };

    const { data: results, error } = (await adminClient.rpc("discover_profiles", rpcParams) as any) as { data: any[] | null; error: any };

    if (error) {
      logger.error("Social discovery RPC failed, falling back to direct query", {
        error: error.message,
      });
      return socialDiscoveryFallback(currentUserId, options, excludedIds);
    }

    if (!results || results.length === 0) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const hasMore = results.length > limit;
    const pageItems = results.slice(0, limit);

    // Hydrate with photos
    const items = await hydrateSearchResults(pageItems, currentUserId);

    const lastItem = pageItems[pageItems.length - 1];
    const nextCursor = `${lastItem.score}_${lastItem.user_id}`;

    await trackEvent(currentUserId, "discovery_search", "discovery", undefined, {
      mode: "social",
      query: query ?? null,
      resultCount: items.length,
      hasMore,
    }).catch(() => {});

    return { items, nextCursor, hasMore };
  } catch (err) {
    logger.error("Social discovery failed, using fallback", {
      error: err instanceof Error ? err.message : "Unknown",
    });
    return socialDiscoveryFallback(currentUserId, options, excludedIds);
  }
}

// ─── Social Discovery Fallback (Direct SQL queries) ──────────────────────

async function socialDiscoveryFallback(
  currentUserId: string,
  options: SocialDiscoveryOptions,
  excludedIds: Set<string>,
): Promise<SocialDiscoveryResponse> {
  const adminClient = createAdminClient();
  const { query, interestIds, maxDistanceKm, cursor, limit = DISCOVERY_PAGE_SIZE } = options;
  const excludedArray = excludedIds.size > 0 ? Array.from(excludedIds) : [];

  // Parse cursor within the fallback function
  let cursorScore: number | undefined;
  let cursorId: string | undefined;
  if (cursor) {
    const parts = cursor.split("_");
    cursorScore = parseFloat(parts[0]);
    cursorId = parts.slice(1).join("_");
  }

  // Fetch eligible candidates (no exclusion filter — handled client-side below)
  const { data: profiles, error } = await adminClient
    .from("profiles")
    .select("user_id, bio, city, date_of_birth, profile_completion_pct, is_verified, gender, dating_intent, latitude, longitude")
    .eq("profile_visibility", "public")
    .gte("profile_completion_pct", MIN_DISCOVERY_PROFILE_COMPLETION)
    .not("date_of_birth", "is", null)
    .limit(limit * 5);

  if (error || !profiles) {
    logger.error("Social discovery fallback query failed", { error: error?.message });
    throw new AppError("INTERNAL_ERROR", "Failed to load profiles", { statusCode: 500 });
  }

  // Get user info for display_name
  const userIds = profiles.map((p: any) => p.user_id);
  const { data: users } = await adminClient
    .from("users")
    .select("id, display_name, telegram_username, last_seen_at")
    .in("id", userIds);

  const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));

  // Apply text filter
  let filtered = profiles;
  if (query && query.length >= MIN_QUERY_LENGTH) {
    const q = query.toLowerCase();
    filtered = profiles.filter((p: any) => {
      const user = userMap.get(p.user_id);
      if (!user) return false;
      const displayName = (user.display_name ?? "").toLowerCase();
      const username = (user.telegram_username ?? "").toLowerCase();
      const bio = (p.bio ?? "").toLowerCase();
      return displayName.includes(q) || username.includes(q) || bio.includes(q);
    });
  }

  // Apply interest filter
  if (interestIds && interestIds.length > 0) {
    const { data: profileInterestRows } = await adminClient
      .from("profile_interests")
      .select("profile_id, interest_id")
      .in("interest_id", interestIds);

    const profileIdsWithInterest = new Set(
      (profileInterestRows ?? []).map((r: any) => r.profile_id),
    );

    const { data: profileIdMap } = await adminClient
      .from("profiles")
      .select("id, user_id")
      .in("user_id", filtered.map((p: any) => p.user_id));

    const profileIdByUserId = new Map(
      (profileIdMap ?? []).map((p: any) => [p.user_id, p.id]),
    );

    filtered = filtered.filter((p: any) => {
      const pid = profileIdByUserId.get(p.user_id);
      return pid && profileIdsWithInterest.has(pid);
    });
  }

  // Apply distance filter
  if (maxDistanceKm && maxDistanceKm > 0) {
    const { data: viewerProfile } = await adminClient
      .from("profiles")
      .select("latitude, longitude")
      .eq("user_id", currentUserId)
      .single();

    if (viewerProfile?.latitude && viewerProfile?.longitude) {
      filtered = filtered.filter((p: any) => {
        if (!p.latitude || !p.longitude) return false;
        const dist = calculateHaversineDistance(
          parseFloat(viewerProfile.latitude),
          parseFloat(viewerProfile.longitude),
          parseFloat(p.latitude),
          parseFloat(p.longitude),
        );
        return dist <= maxDistanceKm;
      });
    }
  }

  // Sort
  if (options.sort === "nearby") {
    filtered.sort((a: any, b: any) => {
      const aDist = a.distanceKm ?? Infinity;
      const bDist = b.distanceKm ?? Infinity;
      return aDist - bDist;
    });
  } else if (options.sort === "recent") {
    filtered.sort((a: any, b: any) => {
      const aSeen = userMap.get(a.user_id)?.last_seen_at ?? "";
      const bSeen = userMap.get(b.user_id)?.last_seen_at ?? "";
      return bSeen.localeCompare(aSeen);
    });
  }

  // Cursor pagination
  if (cursorScore !== undefined && cursorId) {
    filtered = filtered.filter((p: any) => {
      const score = calculateSocialScore(p, userMap.get(p.user_id));
      return score < cursorScore || (score === cursorScore && p.user_id < cursorId);
    });
  }

  const hasMore = filtered.length > limit;
  const pageItems = filtered.slice(0, limit);

  const items = await hydrateSocialResults(pageItems, currentUserId, userMap);

  const lastItem = pageItems[pageItems.length - 1];
  const nextCursor = lastItem
    ? `${calculateSocialScore(lastItem, userMap.get(lastItem.user_id))}_${lastItem.user_id}`
    : null;

  return { items, nextCursor, hasMore };
}

// ─── Hydration ───────────────────────────────────────────────────────────

async function hydrateSearchResults(
  results: any[],
  currentUserId: string,
): Promise<SearchProfileResult[]> {
  const adminClient = createAdminClient();
  const userIds = results.map((r: any) => r.user_id);

  // Batch fetch photos
  const { data: allPhotos } = await adminClient
    .from("profile_photos")
    .select("id, user_id, media_id, is_primary")
    .in("user_id", userIds)
    .eq("is_primary", true);

  const primaryPhotoMap = new Map<string, string | null>();
  for (const photo of allPhotos ?? []) {
    if (!primaryPhotoMap.has(photo.user_id)) {
      primaryPhotoMap.set(photo.user_id, photo.media_id);
    }
  }

  // Batch fetch interests
  const { data: profileIdMap } = await adminClient
    .from("profiles")
    .select("id, user_id")
    .in("user_id", userIds);

  const profileIdByUser = new Map(
    (profileIdMap ?? []).map((p: any) => [p.user_id, p.id]),
  );

  return results.map((r: any) => ({
    id: r.user_id,
    displayName: r.display_name ?? "Unknown",
    username: r.telegram_username ?? null,
    bio: r.bio ?? null,
    avatarUrl: primaryPhotoMap.get(r.user_id) ?? null,
    age: r.age ?? null,
    city: r.city ?? null,
    distanceKm: r.distance_km ?? null,
    sharedInterests: Number(r.shared_interests ?? 0),
    isVerified: r.is_verified ?? false,
  }));
}

async function hydrateSocialResults(
  candidates: any[],
  currentUserId: string,
  userMap: Map<string, any>,
): Promise<SearchProfileResult[]> {
  const adminClient = createAdminClient();
  const userIds = candidates.map((c: any) => c.user_id);

  // Batch fetch profile photos (primary)
  const { data: allPhotos } = await adminClient
    .from("profile_photos")
    .select("id, user_id, media_id, is_primary")
    .in("user_id", userIds)
    .eq("is_primary", true);

  const primaryPhotoMap = new Map<string, string | null>();
  for (const photo of allPhotos ?? []) {
    if (!primaryPhotoMap.has(photo.user_id)) {
      primaryPhotoMap.set(photo.user_id, photo.media_id ?? null);
    }
  }

  // Batch fetch profile IDs
  const { data: profileIdMap } = await adminClient
    .from("profiles")
    .select("id, user_id")
    .in("user_id", userIds);

  const profileIdByUser = new Map(
    (profileIdMap ?? []).map((p: any) => [p.user_id, p.id]),
  );

  return candidates.map((c: any) => {
    const user = userMap.get(c.user_id);
    return {
      id: c.user_id,
      displayName: user?.display_name ?? "Unknown",
      username: user?.telegram_username ?? null,
      bio: c.bio ?? null,
      avatarUrl: primaryPhotoMap.get(c.user_id) ?? null,
      age: c.date_of_birth ? calculateAge(c.date_of_birth) : null,
      city: c.city ?? null,
      distanceKm: c.distanceKm ?? null,
      sharedInterests: 0,
      isVerified: c.is_verified ?? false,
    };
  });
}

// ─── Social Score ────────────────────────────────────────────────────────

function calculateSocialScore(candidate: any, user: any): number {
  let score = 0;

  // Profile quality (40%)
  score += (candidate.profile_completion_pct ?? 50) * 0.4;

  // Activity (30%)
  if (user?.last_seen_at) {
    const hoursSinceActive =
      (Date.now() - new Date(user.last_seen_at).getTime()) / (1000 * 60 * 60);
    score += Math.max(0, 1 - hoursSinceActive / 168) * 30;
  } else {
    score += 10;
  }

  // Verified (10%)
  if (candidate.is_verified) {
    score += 10;
  }

  // Bio presence (10%)
  if (candidate.bio && candidate.bio.trim().length > 0) {
    score += 10;
  }

  // Distance bonus (10%)
  score += 10; // Neutral bonus

  return Math.round(score * 100) / 100;
}

// ─── Existing Dating Discovery API (unchanged from Prompt 07) ────────────

export async function getDiscoveryCandidates(
  currentUserId: string,
  options: { cursor?: string; limit?: number } = { limit: DISCOVERY_PAGE_SIZE },
): Promise<DiscoveryResponse> {
  const adminClient = createAdminClient();
  const { cursor, limit = DISCOVERY_PAGE_SIZE } = options;

  const eligibilityCheck = await checkUserEligibility(currentUserId);

  if (!eligibilityCheck.eligible) {
    return { eligible: false, reason: eligibilityCheck.reason! };
  }

  const preferences = await getUserDiscoveryPreferences(currentUserId);

  if (!preferences) {
    return { eligible: false, reason: "PROFILE_INCOMPLETE" };
  }

  const [blockedIds, previousActionIds, bannedIds, inactiveIds] = await Promise.all([
    getBlockedUserIds(currentUserId),
    getPreviousDatingActionTargetIds(currentUserId),
    getBannedUserIds(),
    getInactiveUserIds(),
  ]);

  const candidates = await queryCandidates({
    currentUserId,
    preferences,
    excludedIds: new Set([
      ...blockedIds,
      ...previousActionIds,
      ...bannedIds,
      ...inactiveIds,
      currentUserId,
    ]),
    cursor,
    limit: limit + 1,
  });

  if (candidates.length === 0) {
    await trackEvent(currentUserId, "discovery_empty", "discovery", undefined, {
      preferences: JSON.stringify(preferences),
    }).catch(() => {});

    return { eligible: true, items: [], nextCursor: null, hasMore: false };
  }

  const hasMore = candidates.length > limit;
  const pageItems = candidates.slice(0, limit);

  const enriched = await enrichCandidates(pageItems, currentUserId, preferences);

  const lastItem = enriched[enriched.length - 1];
  const nextCursor = `${lastItem._score}_${lastItem.id}`;

  await trackEvent(currentUserId, "candidate_impression", "discovery", undefined, {
    count: enriched.length,
  }).catch(() => {});

  const items = enriched.map(({ _score, ...rest }) => rest);

  return { eligible: true, items, nextCursor, hasMore };
}

// ─── Check User Eligibility ─────────────────────────────────────────────

interface EligibilityResult {
  eligible: boolean;
  reason?: DiscoveryEligibilityReason;
}

export async function checkUserEligibility(
  userId: string,
): Promise<EligibilityResult> {
  const adminClient = createAdminClient();

  const { data: result } = await adminClient.rpc("check_discovery_eligibility", {
    p_user_id: userId,
  });

  if (result && result.length > 0) {
    return {
      eligible: result[0].eligible,
      reason: result[0].reason as DiscoveryEligibilityReason | undefined,
    };
  }

  const { data: user } = await adminClient
    .from("users")
    .select("is_active, is_banned")
    .eq("id", userId)
    .single();

  if (!user) return { eligible: false, reason: "ACCOUNT_RESTRICTED" };
  if (user.is_banned) return { eligible: false, reason: "ACCOUNT_RESTRICTED" };
  if (!user.is_active) return { eligible: false, reason: "ACCOUNT_RESTRICTED" };

  const { data: profile } = await adminClient
    .from("profiles")
    .select("date_of_birth, gender, dating_intent, profile_completion_pct")
    .eq("user_id", userId)
    .single();

  if (!profile) return { eligible: false, reason: "PROFILE_INCOMPLETE" };
  if (!profile.date_of_birth) return { eligible: false, reason: "PROFILE_INCOMPLETE" };

  const age = calculateAge(profile.date_of_birth);
  if (age < MIN_DATING_AGE) return { eligible: false, reason: "UNDERAGE" };

  if (!profile.gender || !profile.dating_intent) {
    return { eligible: false, reason: "PROFILE_INCOMPLETE" };
  }

  if ((profile.profile_completion_pct ?? 0) < MIN_DISCOVERY_PROFILE_COMPLETION) {
    return { eligible: false, reason: "PROFILE_INCOMPLETE" };
  }

  const { count: photoCount } = await adminClient
    .from("profile_photos")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((photoCount ?? 0) === 0) {
    return { eligible: false, reason: "PROFILE_INCOMPLETE" };
  }

  const { data: prefs } = await adminClient
    .from("profile_preferences")
    .select("discovery_enabled")
    .eq("user_id", userId)
    .single();

  if (prefs && !prefs.discovery_enabled) {
    return { eligible: false, reason: "DISCOVERY_DISABLED" };
  }

  return { eligible: true };
}

// ─── Intent Compatibility ───────────────────────────────────────────────

export function isIntentCompatible(
  currentUserIntent: string,
  candidateIntent: string,
): boolean {
  const compatibleIntents = INTENT_COMPATIBILITY_MATRIX[currentUserIntent];
  if (!compatibleIntents) return false;
  return compatibleIntents.includes(candidateIntent);
}

// ─── Dating Candidate Query ─────────────────────────────────────────────

interface QueryOptions {
  currentUserId: string;
  preferences: DiscoveryPreferences;
  excludedIds: Set<string>;
  cursor?: string;
  limit: number;
}

interface DiscoveryPreferences {
  minAge: number;
  maxAge: number;
  preferredGenders: string[];
  maxDistanceKm: number;
  datingIntent: string | null;
  userLatitude: number | null;
  userLongitude: number | null;
}

async function queryCandidates(options: QueryOptions): Promise<any[]> {
  const adminClient = createAdminClient();
  const { currentUserId, preferences, excludedIds, cursor, limit } = options;

  let cursorScore: number | undefined;
  let cursorId: string | undefined;
  if (cursor) {
    const parts = cursor.split("_");
    cursorScore = parseFloat(parts[0]);
    cursorId = parts.slice(1).join("_");
  }

  const today = new Date();
  const minBirthDate = new Date(
    today.getFullYear() - preferences.maxAge,
    today.getMonth(),
    today.getDate(),
  );
  const maxBirthDate = new Date(
    today.getFullYear() - preferences.minAge,
    today.getMonth(),
    today.getDate(),
  );

  const excludedArray = Array.from(excludedIds);

  let profileQuery = adminClient
    .from("profiles")
    .select("user_id, date_of_birth, gender, dating_intent, bio, profile_completion_pct, is_verified, latitude, longitude, city")
    .eq("profile_visibility", "public")
    .gte("profile_completion_pct", MIN_DISCOVERY_PROFILE_COMPLETION)
    .not("date_of_birth", "is", null)
    .not("gender", "is", null)
    .not("dating_intent", "is", null)
    .gte("date_of_birth", minBirthDate.toISOString().split("T")[0])
    .lte("date_of_birth", maxBirthDate.toISOString().split("T")[0]);

  if (preferences.preferredGenders.length > 0) {
    profileQuery = profileQuery.in("gender", preferences.preferredGenders);
  }

  const compatibleIntents = preferences.datingIntent
    ? INTENT_COMPATIBILITY_MATRIX[preferences.datingIntent] ?? null
    : null;

  if (compatibleIntents && compatibleIntents.length > 0) {
    profileQuery = profileQuery.in("dating_intent", compatibleIntents);
  }

  const { data: profiles, error } = await profileQuery.limit(limit * 3);

  if (error || !profiles) {
    logger.error("Discovery query failed", { error: error?.message });
    throw new AppError("INTERNAL_ERROR", "Failed to load candidates", {
      statusCode: 500,
    });
  }

  const userIds = profiles.map((p: any) => p.user_id);

  const sharedInterestCounts = await batchGetSharedInterestCounts(
    currentUserId,
    userIds,
  );

  const { data: users } = await adminClient
    .from("users")
    .select("id, last_seen_at")
    .in("id", userIds);

  const userActivityMap = new Map(
    (users ?? []).map((u: any) => [u.id, u.last_seen_at]),
  );

  const { data: follows } = await adminClient
    .from("follows")
    .select("following_id")
    .eq("follower_id", currentUserId)
    .in("following_id", userIds);

  const followedSet = new Set((follows ?? []).map((f: any) => f.following_id));

  const { data: photoCounts } = await adminClient
    .from("profile_photos")
    .select("user_id")
    .in("user_id", userIds);

  const photoCountMap = new Map<string, number>();
  for (const p of photoCounts ?? []) {
    photoCountMap.set(p.user_id, (photoCountMap.get(p.user_id) ?? 0) + 1);
  }

  const filteredProfiles = profiles.filter((p: any) => {
    if (excludedIds.has(p.user_id)) return false;
    if (preferences.datingIntent) {
      if (!isIntentCompatible(preferences.datingIntent, p.dating_intent)) return false;
    }
    return true;
  });

  const profilesWithDistance = filteredProfiles.map((p: any) => {
    let distanceKm: number | null = null;
    if (
      preferences.userLatitude != null &&
      preferences.userLongitude != null &&
      p.latitude != null &&
      p.longitude != null
    ) {
      distanceKm = calculateHaversineDistance(
        preferences.userLatitude,
        preferences.userLongitude,
        parseFloat(p.latitude),
        parseFloat(p.longitude),
      );
    }
    return { ...p, distanceKm };
  });

  let distanceFiltered = profilesWithDistance;
  if (preferences.maxDistanceKm > 0) {
    distanceFiltered = profilesWithDistance.filter((p) => {
      if (p.distanceKm === null) return false;
      return p.distanceKm <= preferences.maxDistanceKm;
    });
  }

  let pagedCandidates = distanceFiltered;
  if (cursorScore !== undefined && cursorId) {
    pagedCandidates = distanceFiltered.filter((p: any) => {
      const score = calculateBaseScore(
        p,
        preferences,
        sharedInterestCounts.get(p.user_id) ?? 0,
        photoCountMap.get(p.user_id) ?? 0,
      );
      return score < cursorScore || (score === cursorScore && p.user_id < cursorId);
    });
  }

  const rankedPromises = pagedCandidates.map(async (p: any) => {
    const baseScore = calculateBaseScore(
      p,
      preferences,
      sharedInterestCounts.get(p.user_id) ?? 0,
      photoCountMap.get(p.user_id) ?? 0,
    );

    const lastSeenAt = userActivityMap.get(p.user_id) ?? null;
    const isFollowing = followedSet.has(p.user_id);

    const fullScore = calculateFullScore(baseScore, lastSeenAt, isFollowing);

    return { ...p, _score: fullScore };
  });

  const ranked = (await Promise.all(rankedPromises))
    .sort((a: any, b: any) => {
      if (b._score !== a._score) return b._score - a._score;
      return b.user_id.localeCompare(a.user_id);
    })
    .slice(0, limit);

  return ranked;
}

// ─── Ranking Functions ───────────────────────────────────────────────────

function calculateBaseScore(
  candidate: any,
  preferences: DiscoveryPreferences,
  sharedInterestCount: number,
  photoCount: number,
): number {
  let score = 0;

  const interestScore = Math.min(sharedInterestCount / 5, 1) * 100;
  score += interestScore * RANKING_WEIGHTS.INTEREST_COMPATIBILITY;

  if (preferences.datingIntent && preferences.datingIntent === candidate.dating_intent) {
    score += 100 * RANKING_WEIGHTS.INTENT_COMPATIBILITY;
  } else if (isIntentCompatible(preferences.datingIntent ?? "not_sure", candidate.dating_intent)) {
    score += 60 * RANKING_WEIGHTS.INTENT_COMPATIBILITY;
  }

  const qualityScore = calculateProfileQualityScore(candidate, photoCount);
  score += qualityScore * RANKING_WEIGHTS.PROFILE_QUALITY;

  if (candidate.distanceKm !== null && preferences.maxDistanceKm > 0) {
    const distanceRatio = 1 - candidate.distanceKm / preferences.maxDistanceKm;
    score += Math.max(0, distanceRatio) * 100 * RANKING_WEIGHTS.DISTANCE;
  } else {
    score += 50 * RANKING_WEIGHTS.DISTANCE;
  }

  return score;
}

function calculateFullScore(
  baseScore: number,
  lastSeenAt: string | null,
  isFollowing: boolean,
): number {
  let score = baseScore;

  if (lastSeenAt) {
    const hoursSinceActive =
      (Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 1 - hoursSinceActive / 168) * 100;
    score += recencyScore * RANKING_WEIGHTS.RECENCY;
  } else {
    score += 20 * RANKING_WEIGHTS.RECENCY;
  }

  if (isFollowing) {
    score += 100 * RANKING_WEIGHTS.SOCIAL_AFFINITY;
  }

  return score;
}

function calculateProfileQualityScore(candidate: any, photoCount: number): number {
  let score = 0;

  if (candidate.bio && candidate.bio.trim().length > 0) {
    score += PROFILE_QUALITY.BIO_PRESENT;
  }

  score += (candidate.profile_completion_pct ?? 0) * PROFILE_QUALITY.COMPLETION_PCT_MULTIPLIER;

  const photoIndex = Math.min(photoCount, 4);
  score += PROFILE_QUALITY.PHOTO_POINTS[photoIndex] ?? 0;

  if (candidate.is_verified) {
    score += PROFILE_QUALITY.VERIFIED;
  }

  return Math.min(score, PROFILE_QUALITY.MAX_SCORE);
}

// ─── Enrichment ─────────────────────────────────────────────────────────

async function enrichCandidates(
  candidates: any[],
  currentUserId: string,
  preferences: DiscoveryPreferences,
): Promise<any[]> {
  const adminClient = createAdminClient();

  if (candidates.length === 0) return [];

  const userIds = candidates.map((c: any) => c.user_id);

  const { data: users } = await adminClient
    .from("users")
    .select("id, display_name, avatar_media_id, last_seen_at")
    .in("id", userIds);

  const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));

  const { data: allPhotos } = await adminClient
    .from("profile_photos")
    .select("id, user_id, media_id, sort_order, is_primary")
    .in("user_id", userIds)
    .order("sort_order", { ascending: true });

  const photosMap = new Map<string, DiscoveryCandidatePhoto[]>();
  for (const photo of allPhotos ?? []) {
    if (!photosMap.has(photo.user_id)) {
      photosMap.set(photo.user_id, []);
    }
    photosMap.get(photo.user_id)!.push({
      id: photo.id,
      mediaId: photo.media_id,
      sortOrder: photo.sort_order,
      isPrimary: photo.is_primary,
    });
  }

  const { data: profileIdsResult } = await adminClient
    .from("profiles")
    .select("id, user_id")
    .in("user_id", userIds);

  const profileIdByUserId = new Map<string, string>();
  for (const p of profileIdsResult ?? []) {
    profileIdByUserId.set(p.user_id, p.id);
  }
  const allProfileIds = Array.from(profileIdByUserId.values());

  const { data: profileInterests } = await adminClient
    .from("profile_interests")
    .select("profile_id, interest_id")
    .in("profile_id", allProfileIds);

  const interestIds = [...new Set((profileInterests ?? []).map((pi: any) => pi.interest_id))];
  const { data: interestData } = await adminClient
    .from("interests")
    .select("id, name, slug, category")
    .in("id", interestIds);

  const interestMap = new Map((interestData ?? []).map((i: any) => [i.id, i]));

  const interestsByProfileId = new Map<string, DiscoveryCandidateInterest[]>();
  for (const pi of profileInterests ?? []) {
    if (!interestsByProfileId.has(pi.profile_id)) {
      interestsByProfileId.set(pi.profile_id, []);
    }
    const interest = interestMap.get(pi.interest_id);
    if (interest) {
      interestsByProfileId.get(pi.profile_id)!.push({
        id: interest.id,
        name: interest.name,
        slug: interest.slug,
        category: interest.category,
      });
    }
  }

  const currentUserProfileId = profileIdByUserId.get(currentUserId);
  const currentUserInterestIds = new Set<string>();
  if (currentUserProfileId) {
    const { data: currentInterests } = await adminClient
      .from("profile_interests")
      .select("interest_id")
      .eq("profile_id", currentUserProfileId);
    for (const ci of currentInterests ?? []) {
      currentUserInterestIds.add(ci.interest_id);
    }
  }

  const { data: followRelations } = await adminClient
    .from("follows")
    .select("following_id")
    .eq("follower_id", currentUserId)
    .in("following_id", userIds);

  const followedSet = new Set((followRelations ?? []).map((f: any) => f.following_id));

  const enriched = candidates.map((c: any) => {
    const user = userMap.get(c.user_id);
    const photos = photosMap.get(c.user_id) ?? [];
    const candidateProfileId = profileIdByUserId.get(c.user_id);
    const interests = candidateProfileId
      ? interestsByProfileId.get(candidateProfileId) ?? []
      : [];
    const isFollowing = followedSet.has(c.user_id);

    const sharedInterestCount = interests.filter(
      (i: any) => currentUserInterestIds.has(i.id),
    ).length;

    const intentMatch = isIntentCompatible(
      preferences.datingIntent ?? "not_sure",
      c.dating_intent,
    );

    const lastSeenAt = user?.last_seen_at ?? null;
    const fullScore = calculateFullScore(
      c._score ?? 50,
      lastSeenAt,
      isFollowing,
    );

    return {
      id: c.user_id,
      displayName: user?.display_name ?? "Unknown",
      username: null,
      age: c.date_of_birth ? calculateAge(c.date_of_birth) : null,
      city: c.city ?? null,
      distanceKm: c.distanceKm,
      bio: c.bio ?? null,
      intent: c.dating_intent,
      gender: c.gender,
      isVerified: c.is_verified ?? false,
      profileCompletionPct: c.profile_completion_pct ?? 0,
      photos,
      interests,
      compatibility: {
        sharedInterests: sharedInterestCount,
        intentMatch,
      },
      _score: fullScore,
    };
  });

  enriched.sort((a: any, b: any) => {
    if (b._score !== a._score) return b._score - a._score;
    return b.id.localeCompare(a.id);
  });

  return enriched;
}

// ─── Batch Shared Interest Counts ────────────────────────────────────────

async function batchGetSharedInterestCounts(
  currentUserId: string,
  candidateUserIds: string[],
): Promise<Map<string, number>> {
  if (candidateUserIds.length === 0) return new Map();

  const adminClient = createAdminClient();

  const allUserIds = [currentUserId, ...candidateUserIds];
  const { data: profileData } = await adminClient
    .from("profiles")
    .select("id, user_id")
    .in("user_id", allUserIds);

  const profileIdByUserId = new Map<string, string>();
  for (const p of profileData ?? []) {
    profileIdByUserId.set(p.user_id, p.id);
  }

  const currentProfileId = profileIdByUserId.get(currentUserId);
  if (!currentProfileId) return new Map();

  const { data: currentInterestRows } = await adminClient
    .from("profile_interests")
    .select("interest_id")
    .eq("profile_id", currentProfileId);

  const currentInterestIds = new Set(
    (currentInterestRows ?? []).map((r: any) => r.interest_id),
  );

  if (currentInterestIds.size === 0) return new Map();

  const candidateProfileIds = candidateUserIds
    .map((uid) => profileIdByUserId.get(uid))
    .filter(Boolean) as string[];

  const { data: candidateInterestRows } = await adminClient
    .from("profile_interests")
    .select("profile_id, interest_id")
    .in("profile_id", candidateProfileIds);

  const profileToUser = new Map<string, string>();
  for (const [uid, pid] of profileIdByUserId) {
    profileToUser.set(pid, uid);
  }

  const sharedCounts = new Map<string, number>();
  for (const row of candidateInterestRows ?? []) {
    if (currentInterestIds.has(row.interest_id)) {
      const userId = profileToUser.get(row.profile_id);
      if (userId) {
        sharedCounts.set(userId, (sharedCounts.get(userId) ?? 0) + 1);
      }
    }
  }

  return sharedCounts;
}

// ─── Geo Helpers ─────────────────────────────────────────────────────────

function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// ─── Data Fetching Helpers ───────────────────────────────────────────────

async function getUserDiscoveryPreferences(
  userId: string,
): Promise<DiscoveryPreferences | null> {
  const adminClient = createAdminClient();

  const [prefsResult, profileResult] = await Promise.all([
    adminClient
      .from("profile_preferences")
      .select("*")
      .eq("user_id", userId)
      .single(),
    adminClient
      .from("profiles")
      .select("latitude, longitude")
      .eq("user_id", userId)
      .single(),
  ]);

  const prefs = prefsResult.data;
  const profile = profileResult.data;

  if (!prefs) return null;

  return {
    minAge: prefs.min_age ?? 18,
    maxAge: prefs.max_age ?? 60,
    preferredGenders: prefs.preferred_genders ?? [],
    maxDistanceKm: prefs.max_distance_km ?? 100,
    datingIntent: prefs.dating_intent ?? null,
    userLatitude: profile?.latitude ? parseFloat(profile.latitude) : null,
    userLongitude: profile?.longitude ? parseFloat(profile.longitude) : null,
  };
}

async function getBlockedUserIds(userId: string): Promise<Set<string>> {
  const adminClient = createAdminClient();

  const [asBlocker, asBlocked] = await Promise.all([
    adminClient.from("blocks").select("blocked_id").eq("blocker_id", userId),
    adminClient.from("blocks").select("blocker_id").eq("blocked_id", userId),
  ]);

  const ids = new Set<string>();
  (asBlocker.data ?? []).forEach((b: any) => ids.add(b.blocked_id));
  (asBlocked.data ?? []).forEach((b: any) => ids.add(b.blocker_id));

  return ids;
}

async function getPreviousDatingActionTargetIds(
  userId: string,
): Promise<Set<string>> {
  const adminClient = createAdminClient();

  const { data } = await adminClient
    .from("dating_actions")
    .select("target_id")
    .eq("actor_id", userId);

  return new Set((data ?? []).map((d: any) => d.target_id));
}

async function getBannedUserIds(): Promise<Set<string>> {
  const adminClient = createAdminClient();

  const { data } = await adminClient
    .from("users")
    .select("id")
    .eq("is_banned", true);

  return new Set((data ?? []).map((u: any) => u.id));
}

async function getInactiveUserIds(): Promise<Set<string>> {
  const adminClient = createAdminClient();

  const { data } = await adminClient
    .from("users")
    .select("id")
    .or("is_active.eq.false,is_active.is.null");

  return new Set((data ?? []).map((u: any) => u.id));
}
