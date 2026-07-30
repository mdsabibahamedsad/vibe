/**
 * Story service — server-side operations for the Stories system.
 *
 * All operations use an admin client (service-role) to bypass RLS.
 * Authorization is enforced via explicit identity checks against the
 * authenticated session, NOT by trusting client-provided IDs.
 *
 * Architecture mirrors the feed service patterns.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  AppError,
  notFoundError,
  authorizationError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";
import type { CreateStoryInput } from "./schemas";
import type {
  StoryItem,
  StoryGroup,
  StoryViewRecord,
  StoriesBarData,
  StoryViewerData,
  StoryReactionType,
} from "./types";
import type { AuthorSummary, MediaItem } from "@/features/feed/services/post.service";
import {
  MAX_STORIES_BAR_RESULTS,
  MAX_STORIES_PER_AUTHOR,
  MAX_ACTIVE_STORIES_PER_USER,
  STORY_EXPIRATION_HOURS,
} from "./constants";

// ─── Get Active Stories for User ─────────────────────────────────────────

/**
 * Get all active stories that the current user is allowed to see,
 * grouped by author. This is the main data source for the StoriesBar.
 *
 * Excludes:
 *  - The user's own stories (returned separately)
 *  - Blocked users
 *  - Banned/inactive users
 *  - Expired stories
 *  - Deleted stories
 */
export async function getActiveStoriesForUser(
  currentUserId: string,
  limit: number = MAX_STORIES_BAR_RESULTS,
): Promise<StoriesBarData> {
  const adminClient = createAdminClient();

  // Get blocked user IDs (both directions)
  const blockedIds = await getBlockedUserIds(currentUserId);

  // Get banned and inactive user IDs
  const bannedIds = await getBannedUserIds();

  // Get followed user IDs
  const followedIds = await getFollowedIds(currentUserId);

  // Get current user's own active stories
  const { data: ownStories } = await adminClient
    .from("stories")
    .select("*, media:media_id(*)")
    .eq("author_id", currentUserId)
    .eq("status", "active")
    .is("deleted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(MAX_STORIES_PER_AUTHOR);

  // Get active stories from other users
  const { data: allStories } = await adminClient
    .from("stories")
    .select("*, media:media_id(*), author:author_id(id, display_name, avatar_media_id)")
    .neq("author_id", currentUserId)
    .eq("status", "active")
    .is("deleted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(limit * 3);

  if (!allStories) {
    return {
      items: [],
      hasOwnStory: (ownStories?.length ?? 0) > 0,
      ownStoryGroup: undefined,
    };
  }

  // Filter out blocked, banned, inactive users and apply visibility rules
  const visibleStories = allStories.filter((s: any) => {
    const authorId = s.author_id as string;
    if (blockedIds.has(authorId)) return false;
    if (bannedIds.has(authorId)) return false;
    if (s.visibility === "followers_only" && !followedIds.has(authorId)) return false;
    return true;
  });

  // Batch enrichment: collect all story IDs and batch-query views and reactions
  const storyIds = visibleStories.map((s: any) => s.id);

  // Batch fetch view status for all stories
  const viewedStoryIds = await getViewedStoryIds(currentUserId, storyIds);

  // Batch fetch user reactions
  const userReactions = await getBatchUserReactions(currentUserId, storyIds);

  // Group stories by author
  const groups = new Map<string, any[]>();
  for (const story of visibleStories) {
    const authorId = story.author_id as string;
    if (!groups.has(authorId)) {
      groups.set(authorId, []);
    }
    groups.get(authorId)!.push(story);
  }

  // Enrich and build StoryGroup array
  const enrichedGroups: StoryGroup[] = [];

  for (const [authorId, authorStories] of groups) {
    const firstStory = authorStories[0];
    const authorData = firstStory.author as any;

    const authorSummary: AuthorSummary = {
      id: authorId,
      displayName: authorData?.display_name ?? "Unknown",
      avatarUrl: authorData?.avatar_media_id ?? null,
      age: null,
      city: null,
      isVerified: false,
      isFollowing: followedIds.has(authorId),
    };

    const enriched = authorStories
      .slice(0, MAX_STORIES_PER_AUTHOR)
      .map((s: any) => enrichStoryItemWithCache(s, currentUserId, viewedStoryIds, userReactions));

    const allViewed = enriched.every((s) => s.isViewed);

    enrichedGroups.push({
      authorId,
      author: authorSummary,
      stories: enriched,
      allViewed,
      storyCount: enriched.length,
    });
  }

  // Sort: unviewed first, then followed, then by recency
  enrichedGroups.sort((a, b) => {
    const aUnviewed = a.stories.some((s) => !s.isViewed) ? 0 : 1;
    const bUnviewed = b.stories.some((s) => !s.isViewed) ? 0 : 1;
    if (aUnviewed !== bUnviewed) return aUnviewed - bUnviewed;
    const aFollowed = a.author.isFollowing ? 0 : 1;
    const bFollowed = b.author.isFollowing ? 0 : 1;
    if (aFollowed !== bFollowed) return aFollowed - bFollowed;
    const aLatest = a.stories[0]?.createdAt ?? "";
    const bLatest = b.stories[0]?.createdAt ?? "";
    return bLatest.localeCompare(aLatest);
  });

  // Enrich own stories with view counts
  let ownStoryGroup: StoryGroup | undefined;
  if (ownStories && ownStories.length > 0) {
    const ownStoryIds = ownStories.map((s: any) => s.id);
    const ownViewedIds = await getViewedStoryIds(currentUserId, ownStoryIds);
    const ownReactions = await getBatchUserReactions(currentUserId, ownStoryIds);

    const enriched = ownStories.map((s: any) =>
      enrichStoryItemWithCache(s, currentUserId, ownViewedIds, ownReactions),
    );

    const enrichedWithViews = await Promise.all(
      enriched.map(async (story) => {
        const viewCount = await getStoryViewCount(story.id);
        return { ...story, viewCount };
      }),
    );

    ownStoryGroup = {
      authorId: currentUserId,
      author: {
        id: currentUserId,
        displayName: "Your Story",
        avatarUrl: null,
        age: null,
        city: null,
        isVerified: false,
        isFollowing: true,
      },
      stories: enrichedWithViews,
      allViewed: false,
      storyCount: enrichedWithViews.length,
    };
  }

  return {
    items: enrichedGroups.slice(0, limit),
    hasOwnStory: (ownStories?.length ?? 0) > 0,
    ownStoryGroup,
  };
}

// ─── Get Stories By Author ───────────────────────────────────────────────

/**
 * Get active stories for a specific author (for the viewer).
 */
export async function getStoriesByAuthor(
  authorId: string,
  currentUserId: string,
): Promise<StoryItem[]> {
  const adminClient = createAdminClient();

  const blocked = await checkBlocked(currentUserId, authorId);
  if (blocked) {
    throw authorizationError("Cannot view this user's stories");
  }

  const { data: stories } = await adminClient
    .from("stories")
    .select("*, media:media_id(*)")
    .eq("author_id", authorId)
    .eq("status", "active")
    .is("deleted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(MAX_STORIES_PER_AUTHOR);

  if (!stories || stories.length === 0) {
    return [];
  }

  const visibleStories = await Promise.all(
    stories.map(async (s: any) => {
      const canView = await canViewStory(currentUserId, s.id);
      return canView ? s : null;
    }),
  );

  const filtered = visibleStories.filter(Boolean) as any[];
  const storyIds = filtered.map((s: any) => s.id);

  // Batch fetch view status and reactions
  const viewedStoryIds = await getViewedStoryIds(currentUserId, storyIds);
  const userReactions = await getBatchUserReactions(currentUserId, storyIds);

  return filtered.map((s: any) =>
    enrichStoryItemWithCache(s, currentUserId, viewedStoryIds, userReactions),
  );
}

// ─── Get Single Story ────────────────────────────────────────────────────

/**
 * Get a single story by ID with viewer context.
 */
export async function getStoryById(
  storyId: string,
  currentUserId: string,
): Promise<StoryViewerData | null> {
  const adminClient = createAdminClient();

  const { data: story } = await adminClient
    .from("stories")
    .select("*, media:media_id(*)")
    .eq("id", storyId)
    .single();

  if (!story) return null;

  const canView = await canViewStory(currentUserId, story.id);
  if (!canView) return null;

  const enriched = await enrichStoryItem(story, currentUserId);

  const authorStories = await getStoriesByAuthor(story.author_id, currentUserId);
  const currentIndex = authorStories.findIndex((s) => s.id === storyId);

  return {
    story: enriched,
    authorStories,
    currentIndex: currentIndex >= 0 ? currentIndex : 0,
    totalInGroup: authorStories.length,
  };
}

// ─── Create Story ────────────────────────────────────────────────────────

/**
 * Create a new story with server-side validation.
 */
export async function createStory(
  userId: string,
  data: CreateStoryInput,
): Promise<StoryItem> {
  const adminClient = createAdminClient();

  // Verify media ownership and processing status
  const { data: mediaRecord, error: mediaError } = await adminClient
    .from("media")
    .select("id, owner_id, media_type, processing_status, mime_type, file_size, duration_seconds, width, height, storage_provider, provider_file_id, storage_path")
    .eq("id", data.mediaId)
    .single();

  if (mediaError || !mediaRecord) {
    throw new AppError("VALIDATION_ERROR", "Media not found", {
      statusCode: 400,
    });
  }

  if (mediaRecord.owner_id !== userId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Media does not belong to you",
      { statusCode: 403 },
    );
  }

  if (mediaRecord.processing_status !== "ready") {
    throw new AppError(
      "VALIDATION_ERROR",
      mediaRecord.processing_status === "failed"
        ? "Media processing failed. Please re-upload."
        : "Media is still processing. Please wait.",
      { statusCode: 400 },
    );
  }

  if (mediaRecord.media_type !== "image" && mediaRecord.media_type !== "video") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Stories only support images and videos",
      { statusCode: 400 },
    );
  }

  // Check max active stories per user
  const { count: activeCount } = await adminClient
    .from("stories")
    .select("*", { count: "exact", head: true })
    .eq("author_id", userId)
    .eq("status", "active");

  if (activeCount !== null && activeCount >= MAX_ACTIVE_STORIES_PER_USER) {
    throw new AppError(
      "VALIDATION_ERROR",
      "You have too many active stories. Please delete some first.",
      { statusCode: 400 },
    );
  }

  // Calculate expiration time server-side
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + STORY_EXPIRATION_HOURS);

  // Create the story
  const { data: story, error: storyError } = await adminClient
    .from("stories")
    .insert({
      author_id: userId,
      media_id: data.mediaId,
      caption: data.caption || null,
      visibility: data.visibility,
      processing_status: "ready",
      status: "active",
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (storyError || !story) {
    logger.error("Failed to create story", { error: storyError?.message });
    throw new AppError("INTERNAL_ERROR", "Failed to create story", {
      statusCode: 500,
    });
  }

  // Track analytics
  await trackEvent(userId, "story_created", "story", story.id, {
    media_type: mediaRecord.media_type,
    visibility: data.visibility,
  });

  // Return the enriched story directly (no fallback needed)
  return enrichStoryItem(story, userId);
}

// ─── Delete Story ────────────────────────────────────────────────────────

/**
 * Soft-delete a story. Only the story owner can delete their own story.
 */
export async function deleteStory(
  storyId: string,
  userId: string,
): Promise<void> {
  const adminClient = createAdminClient();

  const { data: story } = await adminClient
    .from("stories")
    .select("author_id")
    .eq("id", storyId)
    .single();

  if (!story) throw notFoundError("Story not found");
  if (story.author_id !== userId) {
    throw authorizationError("You can only delete your own stories");
  }

  const { error } = await adminClient
    .from("stories")
    .update({
      deleted_at: new Date().toISOString(),
      status: "deleted",
    })
    .eq("id", storyId);

  if (error) {
    logger.error("Failed to delete story", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to delete story", {
      statusCode: 500,
    });
  }

  await trackEvent(userId, "story_deleted", "story", storyId);
}

// ─── Record Story View ───────────────────────────────────────────────────

/**
 * Record that a user viewed a story. Uses upsert with PK constraint
 * to prevent duplicate rows.
 */
export async function recordStoryView(
  storyId: string,
  viewerId: string,
): Promise<boolean> {
  const adminClient = createAdminClient();

  const canView = await canViewStory(viewerId, storyId);
  if (!canView) return false;

  const { error } = await adminClient.from("story_views").insert(
    {
      story_id: storyId,
      viewer_id: viewerId,
    },
  );

  if (error) {
    if (error.code === "23505") {
      return true; // Already viewed — idempotent
    }
    logger.error("Failed to record story view", { error: error.message });
    return false;
  }

  await trackEvent(viewerId, "story_viewed", "story", storyId);

  return true;
}

// ─── Get Story View Count ────────────────────────────────────────────────

export async function getStoryViewCount(storyId: string): Promise<number> {
  const adminClient = createAdminClient();

  const { count } = await adminClient
    .from("story_views")
    .select("*", { count: "exact", head: true })
    .eq("story_id", storyId);

  return count ?? 0;
}

// ─── Get Story Viewer List ──────────────────────────────────────────────

export async function getStoryViewers(
  storyId: string,
  currentUserId: string,
  cursor?: string,
  limit: number = 20,
): Promise<{
  viewers: StoryViewRecord[];
  totalCount: number;
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const adminClient = createAdminClient();

  const { data: story } = await adminClient
    .from("stories")
    .select("author_id")
    .eq("id", storyId)
    .single();

  if (!story) throw notFoundError("Story not found");
  if (story.author_id !== currentUserId) {
    throw authorizationError("Only the story owner can view the viewer list");
  }

  const { count: totalCount } = await adminClient
    .from("story_views")
    .select("*", { count: "exact", head: true })
    .eq("story_id", storyId);

  let query = adminClient
    .from("story_views")
    .select("*, viewer:viewer_id(id, display_name, avatar_media_id)")
    .eq("story_id", storyId)
    .order("viewed_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lt("viewed_at", cursor);
  }

  const { data: viewRecords, error } = await query;

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to load viewers", {
      statusCode: 500,
    });
  }

  const hasMore = viewRecords.length > limit;
  const items = viewRecords.slice(0, limit);

  const viewers: StoryViewRecord[] = items.map((r: any) => {
    const viewerData = r.viewer as any;
    return {
      storyId: r.story_id,
      viewerId: r.viewer_id,
      viewer: viewerData
        ? {
            id: viewerData.id,
            displayName: viewerData.display_name ?? "Unknown",
            avatarUrl: viewerData.avatar_media_id ?? null,
            age: null,
            city: null,
            isVerified: false,
            isFollowing: false,
          }
        : null,
      viewedAt: r.viewed_at,
    };
  });

  return {
    viewers,
    totalCount: totalCount ?? 0,
    nextCursor: items.length > 0 ? items[items.length - 1].viewed_at : null,
    hasMore,
  };
}

// ─── Story Reactions ─────────────────────────────────────────────────────

export async function addStoryReaction(
  storyId: string,
  userId: string,
  reaction: StoryReactionType,
): Promise<void> {
  const adminClient = createAdminClient();

  const canView = await canViewStory(userId, storyId);
  if (!canView) {
    throw authorizationError("Cannot react to this story");
  }

  const { error } = await adminClient.from("story_reactions").upsert(
    {
      story_id: storyId,
      user_id: userId,
      reaction,
    },
    { onConflict: "story_id, user_id" },
  );

  if (error) {
    logger.error("Failed to add story reaction", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to add reaction", {
      statusCode: 500,
    });
  }

  await trackEvent(userId, "story_reaction_added", "story", storyId, {
    reaction,
  });
}

export async function removeStoryReaction(
  storyId: string,
  userId: string,
): Promise<void> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("story_reactions")
    .delete()
    .eq("story_id", storyId)
    .eq("user_id", userId);

  if (error) {
    logger.error("Failed to remove story reaction", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to remove reaction", {
      statusCode: 500,
    });
  }

  await trackEvent(userId, "story_reaction_removed", "story", storyId);
}

export async function getUserStoryReaction(
  storyId: string,
  userId: string,
): Promise<StoryReactionType | null> {
  const adminClient = createAdminClient();

  const { data } = await adminClient
    .from("story_reactions")
    .select("reaction")
    .eq("story_id", storyId)
    .eq("user_id", userId)
    .single();

  return (data?.reaction as StoryReactionType) ?? null;
}

// ─── Can View Story ──────────────────────────────────────────────────────

/**
 * Centralized visibility check for stories.
 */
export async function canViewStory(
  userId: string,
  storyId: string,
): Promise<boolean> {
  const adminClient = createAdminClient();

  // Use the database function if available
  const { data: result } = await adminClient.rpc("can_view_story", {
    p_user_id: userId,
    p_story_id: storyId,
  });

  if (result !== null && result !== undefined) {
    return result as boolean;
  }

  // Fallback: manual check
  const { data: story } = await adminClient
    .from("stories")
    .select("*, author:author_id(id, is_active, is_banned)")
    .eq("id", storyId)
    .single();

  if (!story) return false;
  if (story.deleted_at) return false;
  if (new Date(story.expires_at) <= new Date()) return false;
  if (story.author_id === userId) return true;

  const author = story.author as any;
  if (!author || !author.is_active || author.is_banned) return false;

  const { count: blockCount } = await adminClient
    .from("blocks")
    .select("*", { count: "exact", head: true })
    .or(
      `and(blocker_id.eq.${userId},blocked_id.eq.${story.author_id}),and(blocker_id.eq.${story.author_id},blocked_id.eq.${userId})`,
    );

  if ((blockCount ?? 0) > 0) return false;

  if (story.visibility === "public") return true;

  if (story.visibility === "followers_only") {
    const { count: followCount } = await adminClient
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId)
      .eq("following_id", story.author_id);

    return (followCount ?? 0) > 0;
  }

  return false;
}

// ─── Report a Story ─────────────────────────────────────────────────────

export async function reportStory(
  reporterId: string,
  storyId: string,
  reason: string,
  details?: string,
): Promise<void> {
  const adminClient = createAdminClient();

  const { data: story } = await adminClient
    .from("stories")
    .select("author_id")
    .eq("id", storyId)
    .single();

  if (!story) throw notFoundError("Story not found");

  const { error } = await adminClient.from("reports").insert({
    reporter_id: reporterId,
    reported_user_id: story.author_id,
    reason,
    details: details ?? null,
  });

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to submit report", {
      statusCode: 500,
    });
  }

  await trackEvent(reporterId, "story_reported", "story", storyId, {
    reason,
  });
}

// ─── Expire Old Stories ──────────────────────────────────────────────────

export async function expireOldStories(): Promise<number> {
  const adminClient = createAdminClient();

  const { data: result } = await adminClient.rpc("expire_stories");

  const count = (result ?? 0) as number;

  logger.info("Expired old stories", { count });

  return count;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function getBlockedUserIds(userId: string): Promise<Set<string>> {
  const adminClient = createAdminClient();

  const [blocksAsBlocker, blocksAsBlocked] = await Promise.all([
    adminClient.from("blocks").select("blocked_id").eq("blocker_id", userId),
    adminClient.from("blocks").select("blocker_id").eq("blocked_id", userId),
  ]);

  const ids = new Set<string>();
  (blocksAsBlocker.data ?? []).forEach((b) => ids.add(b.blocked_id));
  (blocksAsBlocked.data ?? []).forEach((b) => ids.add(b.blocker_id));

  return ids;
}

async function getBannedUserIds(): Promise<Set<string>> {
  const adminClient = createAdminClient();

  const { data: banned } = await adminClient
    .from("users")
    .select("id")
    .eq("is_banned", true);

  return new Set((banned ?? []).map((u) => u.id));
}

async function getFollowedIds(userId: string): Promise<Set<string>> {
  const adminClient = createAdminClient();

  const { data: follows } = await adminClient
    .from("follows")
    .select("following_id")
    .eq("follower_id", userId);

  return new Set((follows ?? []).map((f) => f.following_id));
}

async function checkBlocked(
  userAId: string,
  userBId: string,
): Promise<boolean> {
  const adminClient = createAdminClient();

  const { count } = await adminClient
    .from("blocks")
    .select("*", { count: "exact", head: true })
    .or(
      `and(blocker_id.eq.${userAId},blocked_id.eq.${userBId}),and(blocker_id.eq.${userBId},blocked_id.eq.${userAId})`,
    );

  return (count ?? 0) > 0;
}

async function getAuthorSummary(
  authorId: string,
  currentUserId?: string,
): Promise<AuthorSummary | null> {
  const adminClient = createAdminClient();

  const [userResult, profileResult] = await Promise.all([
    adminClient
      .from("users")
      .select("id, display_name, avatar_media_id")
      .eq("id", authorId)
      .single(),
    adminClient
      .from("profiles")
      .select("date_of_birth, city, is_verified")
      .eq("user_id", authorId)
      .single(),
  ]);

  const user = userResult.data;
  const profile = profileResult.data;

  if (!user) return null;

  let isFollowing = false;
  if (currentUserId && currentUserId !== authorId) {
    const { count } = await adminClient
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", currentUserId)
      .eq("following_id", authorId);
    isFollowing = (count ?? 0) > 0;
  }

  const age = profile?.date_of_birth
    ? calculateAge(profile.date_of_birth)
    : null;

  return {
    id: user.id,
    displayName: user.display_name,
    avatarUrl: user.avatar_media_id,
    age,
    city: profile?.city ?? null,
    isVerified: profile?.is_verified ?? false,
    isFollowing,
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

// ─── Batch Helpers ───────────────────────────────────────────────────────

/**
 * Batch-fetch which story IDs a user has viewed.
 */
async function getViewedStoryIds(
  userId: string,
  storyIds: string[],
): Promise<Set<string>> {
  if (storyIds.length === 0) return new Set();

  const adminClient = createAdminClient();

  const { data: views } = await adminClient
    .from("story_views")
    .select("story_id")
    .in("story_id", storyIds)
    .eq("viewer_id", userId);

  return new Set((views ?? []).map((v) => v.story_id));
}

/**
 * Batch-fetch user reactions for a set of stories.
 */
async function getBatchUserReactions(
  userId: string,
  storyIds: string[],
): Promise<Map<string, StoryReactionType>> {
  if (storyIds.length === 0) return new Map();

  const adminClient = createAdminClient();

  const { data: reactions } = await adminClient
    .from("story_reactions")
    .select("story_id, reaction")
    .in("story_id", storyIds)
    .eq("user_id", userId);

  const map = new Map<string, StoryReactionType>();
  (reactions ?? []).forEach((r) => {
    map.set(r.story_id, r.reaction as StoryReactionType);
  });

  return map;
}

/**
 * Enrich a story item using cached view/reaction data (no extra DB queries).
 */
function enrichStoryItemWithCache(
  story: any,
  currentUserId: string,
  viewedStoryIds: Set<string>,
  userReactions: Map<string, StoryReactionType>,
): StoryItem {
  const mediaRecord = story.media as any;

  const media: MediaItem = {
    id: mediaRecord?.id ?? story.media_id,
    mediaId: mediaRecord?.id ?? story.media_id,
    mediaType: mediaRecord?.media_type ?? "image",
    storageProvider: mediaRecord?.storage_provider ?? "telegram",
    mimeType: mediaRecord?.mime_type ?? null,
    width: mediaRecord?.width ?? null,
    height: mediaRecord?.height ?? null,
    durationSeconds: mediaRecord?.duration_seconds ?? null,
    processingStatus: mediaRecord?.processing_status ?? "ready",
    sortOrder: 0,
    thumbnailUrl: null,
  };

  return {
    id: story.id,
    authorId: story.author_id,
    author: null, // Filled by caller
    media,
    caption: story.caption ?? null,
    visibility: story.visibility,
    processingStatus: story.processing_status,
    status: story.status,
    createdAt: story.created_at,
    expiresAt: story.expires_at,
    isViewed: viewedStoryIds.has(story.id),
    myReaction: userReactions.get(story.id) ?? null,
  };
}

async function enrichStoryItem(
  story: any,
  currentUserId: string,
): Promise<StoryItem> {
  const adminClient = createAdminClient();

  const author = await getAuthorSummary(story.author_id, currentUserId);

  const mediaRecord = story.media as any;
  const media: MediaItem = {
    id: mediaRecord?.id ?? story.media_id,
    mediaId: mediaRecord?.id ?? story.media_id,
    mediaType: mediaRecord?.media_type ?? "image",
    storageProvider: mediaRecord?.storage_provider ?? "telegram",
    mimeType: mediaRecord?.mime_type ?? null,
    width: mediaRecord?.width ?? null,
    height: mediaRecord?.height ?? null,
    durationSeconds: mediaRecord?.duration_seconds ?? null,
    processingStatus: mediaRecord?.processing_status ?? "ready",
    sortOrder: 0,
    thumbnailUrl: null,
  };

  // Check if viewed
  const { count: viewCount } = await adminClient
    .from("story_views")
    .select("*", { count: "exact", head: true })
    .eq("story_id", story.id)
    .eq("viewer_id", currentUserId);

  const isViewed = (viewCount ?? 0) > 0;

  // Get current user's reaction
  const myReaction = await getUserStoryReaction(story.id, currentUserId);

  return {
    id: story.id,
    authorId: story.author_id,
    author,
    media,
    caption: story.caption ?? null,
    visibility: story.visibility,
    processingStatus: story.processing_status,
    status: story.status,
    createdAt: story.created_at,
    expiresAt: story.expires_at,
    isViewed,
    myReaction,
  };
}
