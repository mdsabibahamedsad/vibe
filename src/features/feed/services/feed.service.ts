/**
 * Feed service — server-side feed query with cursor pagination and ranking V1.
 *
 * Ranking formula (V1):
 *   score = (recency_weight * 0.4) + (follow_weight * 0.35) + (engagement_weight * 0.25)
 *
 * Architecture is isolated so a future recommendation engine can replace
 * the ranking logic without touching the UI or pagination layer.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { PostResult, AuthorSummary, MediaItem } from "@/features/feed/services/post.service";

export interface FeedItem {
  id: string;
  authorId: string;
  author: AuthorSummary | null;
  caption: string | null;
  postType: string;
  visibility: string;
  commentsEnabled: boolean;
  likeCount: number;
  commentCount: number;
  media: MediaItem[];
  isLiked: boolean;
  createdAt: string;
}

export interface FeedResponse {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface FeedOptions {
  currentUserId: string;
  cursor?: string;
  limit?: number;
}

// ─── Get Feed ────────────────────────────────────────────────────────────

export async function getFeed(options: FeedOptions): Promise<FeedResponse> {
  const adminClient = createAdminClient();
  const { currentUserId, cursor, limit = 20 } = options;

  // Get list of blocked user IDs (both directions)
  const blockedIds = await getBlockedUserIds(currentUserId);

  // Get list of followed user IDs
  const followedIds = await getFollowedIds(currentUserId);

  // Get banned and inactive user IDs to exclude
  const bannedIds = await getBannedUserIds();
  const inactiveIds = await getInactiveUserIds();

  // Parse compound cursor: "createdAt_id"
  let cursorCreatedAt: string | undefined;
  let cursorId: string | undefined;
  if (cursor) {
    const parts = cursor.split("_");
    cursorCreatedAt = parts[0];
    cursorId = parts.slice(1).join("_");
  }

  // Build the query with compound ordering
  let query = adminClient
    .from("posts")
    .select("*")
    .is("deleted_at", null)
    .in("visibility", ["public", "followers_only"])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursorCreatedAt && cursorId) {
    // Compound cursor: (created_at < cursorCreatedAt) OR (created_at = cursorCreatedAt AND id < cursorId)
    query = query.or(
      `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`,
    );
  }

  const { data: posts, error } = await query;

  if (error) {
    logger.error("Feed query failed", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to load feed", { statusCode: 500 });
  }

  // Filter out blocked/banned/inactive users' posts and apply visibility rules
  const visiblePosts = posts.filter((post: Record<string, unknown>) => {
    const authorId = post.author_id as string;

    // Exclude blocked users
    if (blockedIds.has(authorId)) return false;

    // Exclude banned users
    if (bannedIds.has(authorId)) return false;

    // Exclude inactive (deleted/deactivated) users
    if (inactiveIds.has(authorId)) return false;

    // Followers-only posts: only show if current user follows the author
    if (
      post.visibility === "followers_only" &&
      authorId !== currentUserId &&
      !followedIds.has(authorId)
    ) {
      return false;
    }

    return true;
  });

  const hasMore = visiblePosts.length > limit;
  const items = visiblePosts.slice(0, limit);

  // Enrich with author info, media, like state
  const enriched = await Promise.all(
    items.map((post: Record<string, unknown>) => enrichFeedItem(post, currentUserId)),
  );

  // Apply ranking (V1)
  const ranked = rankItems(enriched, currentUserId, followedIds);

  // Build compound next cursor
  const nextCursor =
    items.length > 0 ? `${items[items.length - 1].created_at}_${items[items.length - 1].id}` : null;

  return { items: ranked, nextCursor, hasMore };
}async function getBannedUserIds(): Promise<Set<string>> {
  const adminClient = createAdminClient();
  const { data: banned } = await adminClient
    .from("users")
    .select("id")
    .eq("is_banned", true);

  return new Set((banned ?? []).map((u) => u.id));
}

async function getInactiveUserIds(): Promise<Set<string>> {
  const adminClient = createAdminClient();
  const { data: inactive } = await adminClient
    .from("users")
    .select("id")
    .or("is_active.eq.false,is_active.is.null");

  return new Set((inactive ?? []).map((u) => u.id));
}

// ─── Ranking V1 ──────────────────────────────────────────────────────────

interface RankableItem extends FeedItem {
  _score?: number;
}

function rankItems(
  items: FeedItem[],
  _currentUserId: string,
  followedIds: Set<string>,
): FeedItem[] {
  // Calculate score for each item
  const now = Date.now();

  const scored = items.map((item) => {
    let score = 0;

    // Recency weight (0.4): newer posts score higher
    const ageHours = (now - new Date(item.createdAt).getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 1 - ageHours / 72); // Full score under 3 hours, decays to 0 over 72 hours
    score += recencyScore * 0.4;

    // Follow weight (0.35): followed authors get a boost
    if (followedIds.has(item.authorId)) {
      score += 0.35;
    }

    // Engagement weight (0.25): more likes/comments = higher score
    const engagement = Math.min(item.likeCount + item.commentCount, 100);
    const engagementScore = engagement / 100;
    score += engagementScore * 0.25;

    return { ...item, _score: score } as RankableItem;
  });

  // Sort by score descending
  scored.sort((a, b) => (b._score ?? 0) - (a._score ?? 0));

  // Remove score from output
  return scored.map(({ _score, ...rest }) => rest);
}

// ─── User's Own Posts Feed ───────────────────────────────────────────────

export async function getUserPosts(
  currentUserId: string,
  authorId: string,
  cursor?: string,
  limit: number = 20,
): Promise<FeedResponse> {
  const adminClient = createAdminClient();

  // Parse compound cursor
  let cursorCreatedAt: string | undefined;
  let cursorId: string | undefined;
  if (cursor) {
    const parts = cursor.split("_");
    cursorCreatedAt = parts[0];
    cursorId = parts.slice(1).join("_");
  }

  let query = adminClient
    .from("posts")
    .select("*")
    .eq("author_id", authorId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursorCreatedAt && cursorId) {
    query = query.or(
      `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`,
    );
  }

  const { data: posts, error } = await query;

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to load posts", { statusCode: 500 });
  }

  const hasMore = (posts?.length ?? 0) > limit;
  const items = (posts ?? []).slice(0, limit);

  const enriched = await Promise.all(
    items.map((post: Record<string, unknown>) => enrichFeedItem(post, currentUserId)),
  );

  const nextCursor =
    items.length > 0 ? `${items[items.length - 1].created_at}_${items[items.length - 1].id}` : null;

  return { items: enriched, nextCursor, hasMore };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

async function getBlockedUserIds(userId: string): Promise<Set<string>> {
  const adminClient = createAdminClient();

  const { data: blocksAsBlocker } = await adminClient
    .from("blocks")
    .select("blocked_id")
    .eq("blocker_id", userId);

  const { data: blocksAsBlocked } = await adminClient
    .from("blocks")
    .select("blocker_id")
    .eq("blocked_id", userId);

  const ids = new Set<string>();

  (blocksAsBlocker ?? []).forEach((b) => ids.add(b.blocked_id));
  (blocksAsBlocked ?? []).forEach((b) => ids.add(b.blocker_id));

  return ids;
}

async function getFollowedIds(userId: string): Promise<Set<string>> {
  const adminClient = createAdminClient();

  const { data: follows } = await adminClient
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);

  return new Set((follows ?? []).map((f) => f.following_id));
}

async function enrichFeedItem(
  post: Record<string, unknown>,
  currentUserId: string,
): Promise<FeedItem> {
  // Eager-load using the same pattern as enrichPost in post.service.ts
  const adminClient = createAdminClient();

  // Author summary
  const { data: user } = await adminClient
    .from("users")
    .select("id, display_name, avatar_media_id")
    .eq("id", post.author_id as string)
    .single();

  const { data: profile } = await adminClient
    .from("profiles")
    .select("date_of_birth, city, is_verified")
    .eq("user_id", post.author_id as string)
    .single();

  let isFollowing = false;
  if (currentUserId !== post.author_id) {
    const { count } = await adminClient
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", currentUserId)
      .eq("following_id", post.author_id as string);
    isFollowing = (count ?? 0) > 0;
  }

  const age = profile?.date_of_birth ? calculateAge(profile.date_of_birth) : null;

  const author: AuthorSummary = {
    id: user?.id ?? (post.author_id as string),
    displayName: user?.display_name ?? "Unknown",
    avatarUrl: user?.avatar_media_id ?? null,
    age,
    city: profile?.city ?? null,
    isVerified: profile?.is_verified ?? false,
    isFollowing,
  };

  // Media
  const { data: postMedia } = await adminClient
    .from("post_media")
    .select("*, media:media_id(*)")
    .eq("post_id", post.id as string)
    .order("sort_order", { ascending: true });

  const media: MediaItem[] = (postMedia ?? []).map((pm: Record<string, unknown>) => ({
    id: pm.id as string,
    mediaId: (pm.media as Record<string, unknown>)?.id as string,
    mediaType: (pm.media as Record<string, unknown>)?.media_type as string,
    storageProvider: (pm.media as Record<string, unknown>)?.storage_provider as string,
    mimeType: (pm.media as Record<string, unknown>)?.mime_type as string | null,
    width: (pm.media as Record<string, unknown>)?.width as number | null,
    height: (pm.media as Record<string, unknown>)?.height as number | null,
    durationSeconds: (pm.media as Record<string, unknown>)?.duration_seconds as number | null,
    processingStatus: (pm.media as Record<string, unknown>)?.processing_status as string,
    sortOrder: pm.sort_order as number,
    thumbnailUrl: null,
  }));

  // Like state
  const { count: likeCount } = await adminClient
    .from("post_likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", post.id as string)
    .eq("user_id", currentUserId);

  return {
    id: post.id as string,
    authorId: post.author_id as string,
    author,
    caption: post.caption as string | null,
    postType: post.post_type as string,
    visibility: post.visibility as string,
    commentsEnabled: post.comments_enabled as boolean,
    likeCount: post.like_count as number,
    commentCount: post.comment_count as number,
    media,
    isLiked: (likeCount ?? 0) > 0,
    createdAt: post.created_at as string,
  };
}

function calculateAge(dateOfBirth: string): number {
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const mDiff = today.getMonth() - birth.getMonth();
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
