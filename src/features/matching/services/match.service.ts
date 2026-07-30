/**
 * Match service — server-side operations for mutual matching.
 *
 * This service extends the dating action system to detect mutual likes
 * and create matches atomically. It also provides match list, unmatch,
 * and read state management.
 *
 * Match creation is atomic — uses a database function (process_dating_action)
 * that handles the entire flow in a transaction.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, notFoundError, authorizationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";
import { calculateAge } from "@/lib/validation/profile";

// ─── Types ───────────────────────────────────────────────────────────────

export interface MatchActionResult {
  success: boolean;
  action: "like" | "pass" | "super_like";
  matched: boolean;
  matchId?: string | null;
  notificationCreated?: boolean;
  error?: string;
}

export interface MatchItem {
  matchId: string;
  user: {
    id: string;
    displayName: string;
    age: number | null;
    avatarUrl: string | null;
    city: string | null;
  };
  createdAt: string;
  matchedAt: string;
  lastActivityAt: string;
  unread: boolean;
  status: string;
}

export interface MatchListResponse {
  items: MatchItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

const MATCH_PAGE_SIZE = 20;

// ─── Process Dating Action (with match detection) ────────────────────────

/**
 * Process a dating action with mutual match detection.
 *
 * This is the core function that bridges the dating action system
 * with the matching system. After saving the action, it checks for
 * reciprocal positive interest and atomically creates a match if found.
 *
 * The actual database work is done in the security-definer function
 * process_dating_action() to ensure atomicity and prevent race conditions.
 */
export async function processDatingAction(
  actorUserId: string,
  targetUserId: string,
  action: "like" | "pass" | "super_like",
): Promise<MatchActionResult> {
  const adminClient = createAdminClient();

  try {
    // Call the database function for atomic processing
    const { data, error } = await adminClient.rpc("process_dating_action", {
      p_actor_id: actorUserId,
      p_target_id: targetUserId,
      p_action: action,
    });

    if (error) {
      logger.error("process_dating_action RPC failed", {
        error: error.message,
        action,
      });
      throw new AppError("INTERNAL_ERROR", "Failed to process action", {
        statusCode: 500,
      });
    }

    const result = data as MatchActionResult;

    if (!result.success) {
      throw new AppError("VALIDATION_ERROR", result.error ?? "Action failed", {
        statusCode: 400,
      });
    }

    // Track analytics
    if (result.matched) {
      await trackEvent(actorUserId, "match_created", "match", result.matchId ?? undefined, {
        action,
        matchedWith: targetUserId,
      }).catch(() => {});
    }

    return result;
  } catch (err) {
    if (err instanceof AppError) throw err;

    logger.error("Failed to process dating action", {
      error: err instanceof Error ? err.message : "Unknown",
    });
    throw new AppError("INTERNAL_ERROR", "Failed to process action", {
      statusCode: 500,
    });
  }
}

// ─── Get Match List ──────────────────────────────────────────────────────

/**
 * Get the list of active matches for the current user.
 * Uses cursor-based pagination ordered by last_activity_at DESC.
 *
 * Excludes:
 *  - Unmatched (inactive) matches
 *  - Blocked users (checked server-side)
 *  - Deleted/inactive users
 */
export async function getMatches(
  currentUserId: string,
  cursor?: string,
  limit: number = MATCH_PAGE_SIZE,
): Promise<MatchListResponse> {
  const adminClient = createAdminClient();

  // Parse cursor: "lastActivityAt_matchId"
  let cursorLastActivity: string | undefined;
  let cursorMatchId: string | undefined;
  if (cursor) {
    const parts = cursor.split("_");
    cursorLastActivity = parts[0];
    cursorMatchId = parts.slice(1).join("_");
  }

  // Get the current user's matches where they are user_a OR user_b
  // Filter: only active matches, check block status server-side
  const { data: matchesA } = await adminClient
    .from("matches")
    .select("*")
    .eq("user_a_id", currentUserId)
    .eq("status", "active")
    .order("last_activity_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  const { data: matchesB } = await adminClient
    .from("matches")
    .select("*")
    .eq("user_b_id", currentUserId)
    .eq("status", "active")
    .order("last_activity_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  // Merge and sort by last_activity_at
  const allMatches = [...(matchesA ?? []), ...(matchesB ?? [])]
    .sort((a, b) => {
      const aTime = new Date(a.last_activity_at ?? a.created_at).getTime();
      const bTime = new Date(b.last_activity_at ?? b.created_at).getTime();
      if (bTime !== aTime) return bTime - aTime;
      return b.id.localeCompare(a.id);
    });

  if (allMatches.length === 0) {
    return { items: [], nextCursor: null, hasMore: false };
  }

  // Filter out blocked users
  const filteredMatches: any[] = [];
  for (const match of allMatches) {
    const otherUserId =
      match.user_a_id === currentUserId ? match.user_b_id : match.user_a_id;

    // Check block
    const { count: blockCount } = await adminClient
      .from("blocks")
      .select("*", { count: "exact", head: true })
      .or(
        `and(blocker_id.eq.${currentUserId},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${currentUserId})`,
      );

    if ((blockCount ?? 0) > 0) continue;

    filteredMatches.push(match);
    if (filteredMatches.length >= limit + 1) break;
  }

  const hasMore = filteredMatches.length > limit;
  const pageItems = filteredMatches.slice(0, limit);

  // Enrich with user profile info
  const enriched = await enrichMatches(pageItems, currentUserId);

  // Build next cursor
  const lastItem = pageItems[pageItems.length - 1];
  const nextCursor = lastItem
    ? `${lastItem.last_activity_at ?? lastItem.created_at}_${lastItem.id}`
    : null;

  return {
    items: enriched,
    nextCursor,
    hasMore,
  };
}

// ─── Get Single Match ────────────────────────────────────────────────────

/**
 * Get a single match by ID with access control.
 */
export async function getMatch(
  matchId: string,
  currentUserId: string,
): Promise<MatchItem | null> {
  const adminClient = createAdminClient();

  const { data: match } = await adminClient
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .single();

  if (!match) return null;

  // Access check
  const canAccess = await canAccessMatch(currentUserId, matchId);
  if (!canAccess) return null;

  const enriched = await enrichMatches([match], currentUserId);
  return enriched[0] ?? null;
}

// ─── Unmatch ─────────────────────────────────────────────────────────────

/**
 * Unmatch a user. Only a match participant can unmatch.
 *
 * After unmatching:
 *  - Status becomes 'unmatched'
 *  - Match disappears from active match list
 *  - Future access is denied
 *  - Unmatched pairs cannot recreate match automatically
 */
export async function unmatch(
  matchId: string,
  userId: string,
): Promise<void> {
  const adminClient = createAdminClient();

  // Verify participation
  const { data: match } = await adminClient
    .from("matches")
    .select("id, user_a_id, user_b_id, status")
    .eq("id", matchId)
    .single();

  if (!match) throw notFoundError("Match not found");

  if (match.user_a_id !== userId && match.user_b_id !== userId) {
    throw authorizationError("You can only unmatch your own matches");
  }

  if (match.status !== "active") {
    throw new AppError("VALIDATION_ERROR", "Match is not active", {
      statusCode: 400,
    });
  }

  // Soft-delete: set status to unmatched, preserve analytics/safety data
  const { error } = await adminClient
    .from("matches")
    .update({
      status: "unmatched",
      unmatched_at: new Date().toISOString(),
      unmatched_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  if (error) {
    logger.error("Failed to unmatch", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to unmatch", {
      statusCode: 500,
    });
  }

  await trackEvent(userId, "match_unmatched", "match", matchId).catch(() => {});
}

// ─── Mark Match as Read ─────────────────────────────────────────────────

/**
 * Mark a match as read for the current user.
 */
export async function markMatchRead(
  matchId: string,
  userId: string,
): Promise<void> {
  const adminClient = createAdminClient();

  // Verify participation
  const { data: match } = await adminClient
    .from("matches")
    .select("id, user_a_id, user_b_id")
    .eq("id", matchId)
    .single();

  if (!match) throw notFoundError("Match not found");

  if (match.user_a_id !== userId && match.user_b_id !== userId) {
    throw authorizationError("You can only mark your own matches as read");
  }

  // Update the appropriate read column
  const now = new Date().toISOString();
  const updateField =
    match.user_a_id === userId
      ? { last_read_at_user_a: now }
      : { last_read_at_user_b: now };

  const { error } = await adminClient
    .from("matches")
    .update(updateField)
    .eq("id", matchId);

  if (error) {
    logger.error("Failed to mark match as read", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to mark as read", {
      statusCode: 500,
    });
  }

  await trackEvent(userId, "match_marked_read", "match", matchId).catch(() => {});
}

// ─── Can Access Match ────────────────────────────────────────────────────

/**
 * Centralized access check for a match.
 *
 * Verifies:
 *  1. Match exists
 *  2. User is a participant
 *  3. Match is active
 *  4. No block relationship
 */
export async function canAccessMatch(
  userId: string,
  matchId: string,
): Promise<boolean> {
  const adminClient = createAdminClient();

  const { data: result } = await adminClient.rpc("can_access_match", {
    p_user_id: userId,
    p_match_id: matchId,
  });

  if (result !== null && result !== undefined) {
    return result as boolean;
  }

  // Fallback: manual check
  const { data: match } = await adminClient
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .single();

  if (!match) return false;
  if (match.user_a_id !== userId && match.user_b_id !== userId) return false;
  if (match.status !== "active") return false;

  // Check block
  const { count: blockCount } = await adminClient
    .from("blocks")
    .select("*", { count: "exact", head: true })
    .or(
      `and(blocker_id.eq.${match.user_a_id},blocked_id.eq.${match.user_b_id}),and(blocker_id.eq.${match.user_b_id},blocked_id.eq.${match.user_a_id})`,
    );

  return (blockCount ?? 0) === 0;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Enrich match records with user profile information.
 */
async function enrichMatches(
  matches: any[],
  currentUserId: string,
): Promise<MatchItem[]> {
  const adminClient = createAdminClient();

  if (matches.length === 0) return [];

  // Get the other user's IDs for each match
  const otherUserIds = matches.map((m) =>
    m.user_a_id === currentUserId ? m.user_b_id : m.user_a_id,
  );

  // Batch fetch user info
  const { data: users } = await adminClient
    .from("users")
    .select("id, display_name, avatar_media_id")
    .in("id", otherUserIds);

  const userMap = new Map((users ?? []).map((u) => [u.id, u]));

  // Batch fetch profile info (age, city)
  const { data: profiles } = await adminClient
    .from("profiles")
    .select("user_id, date_of_birth, city")
    .in("user_id", otherUserIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  return matches.map((match) => {
    const otherUserId =
      match.user_a_id === currentUserId ? match.user_b_id : match.user_a_id;
    const user = userMap.get(otherUserId);
    const profile = profileMap.get(otherUserId);

    // Calculate unread state
    const isUserA = match.user_a_id === currentUserId;
    const lastReadField = isUserA ? "last_read_at_user_a" : "last_read_at_user_b";
    const lastReadAt = match[lastReadField];

    // A match is "unread" if the user hasn't read it since it was created/updated
    const unread = !lastReadAt || new Date(lastReadAt) < new Date(match.last_activity_at ?? match.created_at);

    const age = profile?.date_of_birth ? calculateAge(profile.date_of_birth) : null;

    return {
      matchId: match.id,
      user: {
        id: otherUserId,
        displayName: user?.display_name ?? "Unknown",
        age,
        avatarUrl: user?.avatar_media_id ?? null,
        city: profile?.city ?? null,
      },
      createdAt: match.created_at,
      matchedAt: match.matched_at,
      lastActivityAt: match.last_activity_at ?? match.created_at,
      unread,
      status: match.status,
    };
  });
}
