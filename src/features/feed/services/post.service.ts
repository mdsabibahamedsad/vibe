/**
 * Post service — server-side operations for feed posts.
 *
 * All operations use an admin client (service-role) to bypass RLS.
 * Authorization is enforced via explicit identity checks against the
 * authenticated session, NOT by trusting client-provided IDs.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, notFoundError, authorizationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { CreatePostInput, UpdatePostInput } from "@/features/feed/schemas/post.schema";
import { trackEvent } from "@/lib/analytics";

// ─── Types ───────────────────────────────────────────────────────────────

export interface PostResult {
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
  thumbnailMediaId: string | null;
  isLiked: boolean;
  isSaved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthorSummary {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  age: number | null;
  city: string | null;
  isVerified: boolean;
  isFollowing: boolean;
}

export interface MediaItem {
  id: string;
  mediaId: string;
  mediaType: string;
  storageProvider: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  processingStatus: string;
  sortOrder: number;
  thumbnailUrl: string | null;
}

export interface CommentResult {
  id: string;
  postId: string;
  authorId: string;
  author: AuthorSummary | null;
  content: string;
  parentCommentId: string | null;
  replies: CommentResult[];
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}

export interface CreateCommentData {
  content: string;
  parentCommentId?: string;
}

// ─── Create Post ─────────────────────────────────────────────────────────

export async function createPost(userId: string, data: CreatePostInput): Promise<PostResult> {
  const adminClient = createAdminClient();

  // Validate media ownership
  if (data.mediaIds && data.mediaIds.length > 0) {
    const { data: mediaRecords, error: mediaError } = await adminClient
      .from("media")
      .select("id, media_type, processing_status")
      .in("id", data.mediaIds)
      .eq("owner_id", userId);

    if (mediaError || !mediaRecords || mediaRecords.length !== data.mediaIds.length) {
      throw new AppError(
        "VALIDATION_ERROR",
        "One or more media files are invalid or do not belong to you",
        {
          statusCode: 400,
        },
      );
    }

    // Check processing status
    const failedMedia = mediaRecords.filter((m) => m.processing_status === "failed");
    if (failedMedia.length > 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Some media files have processing errors. Please re-upload them.",
        {
          statusCode: 400,
        },
      );
    }

    const pendingMedia = mediaRecords.filter(
      (m) => m.processing_status === "pending" || m.processing_status === "processing",
    );
    if (pendingMedia.length > 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Some media files are still processing. Please wait and try again.",
        {
          statusCode: 400,
        },
      );
    }
  }

  // Create post
  const { data: post, error: postError } = await adminClient
    .from("posts")
    .insert({
      author_id: userId,
      caption: data.caption || null,
      post_type: data.postType,
      visibility: data.visibility,
      comments_enabled: data.commentsEnabled,
    })
    .select()
    .single();

  if (postError || !post) {
    logger.error("Failed to create post", { error: postError?.message });
    throw new AppError("INTERNAL_ERROR", "Failed to create post", { statusCode: 500 });
  }

  // Attach media
  if (data.mediaIds && data.mediaIds.length > 0) {
    const mediaInserts = data.mediaIds.map((mediaId, index) => ({
      post_id: post.id,
      media_id: mediaId,
      sort_order: index,
    }));

    const { error: attachError } = await adminClient.from("post_media").insert(mediaInserts);

    if (attachError) {
      logger.error("Failed to attach media to post", { error: attachError.message });
    }
  }

  // Track analytics
  await trackEvent(userId, "post_created", "post", post.id, {
    post_type: data.postType,
    visibility: data.visibility,
    media_count: data.mediaIds?.length ?? 0,
  });

  return (await getPostById(post.id, userId))!;
}

// ─── Get Single Post ─────────────────────────────────────────────────────

export async function getPostById(
  postId: string,
  currentUserId?: string,
): Promise<PostResult | null> {
  const adminClient = createAdminClient();

  const { data: post } = await adminClient
    .from("posts")
    .select("*")
    .eq("id", postId)
    .is("deleted_at", null)
    .single();

  if (!post) return null;

  return await enrichPost(post, currentUserId);
}

// ─── Update Post ─────────────────────────────────────────────────────────

export async function updatePost(
  postId: string,
  userId: string,
  data: UpdatePostInput,
): Promise<PostResult> {
  const adminClient = createAdminClient();

  // Verify ownership
  const { data: post } = await adminClient
    .from("posts")
    .select("author_id")
    .eq("id", postId)
    .single();

  if (!post) throw notFoundError("Post not found");
  if (post.author_id !== userId) throw authorizationError("You can only edit your own posts");

  const updateData: Record<string, unknown> = {};
  if (data.caption !== undefined) updateData.caption = data.caption;
  if (data.visibility !== undefined) updateData.visibility = data.visibility;
  if (data.commentsEnabled !== undefined) updateData.comments_enabled = data.commentsEnabled;

  const { error } = await adminClient.from("posts").update(updateData).eq("id", postId);

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to update post", { statusCode: 500 });
  }

  return (await getPostById(postId, userId))!;
}

// ─── Delete Post (soft delete) ───────────────────────────────────────────

export async function deletePost(postId: string, userId: string): Promise<void> {
  const adminClient = createAdminClient();

  const { data: post } = await adminClient
    .from("posts")
    .select("author_id")
    .eq("id", postId)
    .single();

  if (!post) throw notFoundError("Post not found");
  if (post.author_id !== userId) throw authorizationError("You can only delete your own posts");

  const { error } = await adminClient
    .from("posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", postId);

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to delete post", { statusCode: 500 });
  }

  await trackEvent(userId, "post_deleted", "post", postId);
}

// ─── Like Post ───────────────────────────────────────────────────────────

export async function likePost(postId: string, userId: string): Promise<{ liked: boolean }> {
  const adminClient = createAdminClient();

  // Check post exists and is not deleted
  const { data: post } = await adminClient
    .from("posts")
    .select("id, author_id")
    .eq("id", postId)
    .is("deleted_at", null)
    .single();

  if (!post) throw notFoundError("Post not found");

  // Check block
  const blocked = await checkBlocked(userId, post.author_id);
  if (blocked) throw authorizationError("Cannot interact with this post");

  // Insert like — primary key conflict prevents duplicates
  const { error } = await adminClient
    .from("post_likes")
    .insert({ post_id: postId, user_id: userId })
    .select()
    .single();

  if (error) {
    // If duplicate, it's already liked — that's fine
    if (error.code === "23505") {
      return { liked: true };
    }
    throw new AppError("INTERNAL_ERROR", "Failed to like post", { statusCode: 500 });
  }

  await trackEvent(userId, "post_liked", "post", postId);

  return { liked: true };
}

// ─── Unlike Post ─────────────────────────────────────────────────────────

export async function unlikePost(postId: string, userId: string): Promise<{ liked: boolean }> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("post_likes")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", userId);

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to unlike post", { statusCode: 500 });
  }

  await trackEvent(userId, "post_unliked", "post", postId);

  return { liked: false };
}

// ─── Comments ────────────────────────────────────────────────────────────

export async function createComment(
  postId: string,
  userId: string,
  data: CreateCommentData,
): Promise<CommentResult> {
  const adminClient = createAdminClient();

  // Check post exists & comments enabled
  const { data: post } = await adminClient
    .from("posts")
    .select("id, author_id, comments_enabled")
    .eq("id", postId)
    .is("deleted_at", null)
    .single();

  if (!post) throw notFoundError("Post not found");
  if (!post.comments_enabled) {
    throw new AppError("VALIDATION_ERROR", "Comments are disabled on this post", {
      statusCode: 400,
    });
  }

  // Check block
  const blocked = await checkBlocked(userId, post.author_id);
  if (blocked) throw authorizationError("Cannot comment on this post");

  // If it's a reply, verify parent comment exists
  if (data.parentCommentId) {
    const { data: parent } = await adminClient
      .from("post_comments")
      .select("id, post_id")
      .eq("id", data.parentCommentId)
      .single();

    if (!parent || parent.post_id !== postId) {
      throw new AppError("VALIDATION_ERROR", "Parent comment not found", { statusCode: 400 });
    }
  }

  const { data: comment, error } = await adminClient
    .from("post_comments")
    .insert({
      post_id: postId,
      author_id: userId,
      parent_comment_id: data.parentCommentId || null,
      content: data.content,
    })
    .select()
    .single();

  if (error || !comment) {
    throw new AppError("INTERNAL_ERROR", "Failed to create comment", { statusCode: 500 });
  }

  await trackEvent(userId, "comment_created", "comment", comment.id);

  return await enrichComment(comment, userId);
}

export async function deleteComment(commentId: string, userId: string): Promise<void> {
  const adminClient = createAdminClient();

  const { data: comment } = await adminClient
    .from("post_comments")
    .select("author_id")
    .eq("id", commentId)
    .single();

  if (!comment) throw notFoundError("Comment not found");
  if (comment.author_id !== userId)
    throw authorizationError("You can only delete your own comments");

  // Soft delete
  const { error } = await adminClient
    .from("post_comments")
    .update({ deleted_at: new Date().toISOString(), content: "[deleted]" })
    .eq("id", commentId);

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to delete comment", { statusCode: 500 });
  }
}

export async function getComments(
  postId: string,
  currentUserId: string,
  cursor?: string,
  limit: number = 20,
): Promise<{ items: CommentResult[]; nextCursor: string | null; hasMore: boolean }> {
  const adminClient = createAdminClient();

  let query = adminClient
    .from("post_comments")
    .select("*")
    .eq("post_id", postId)
    .is("parent_comment_id", null) // Top-level comments only
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: comments, error } = await query;

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to load comments", { statusCode: 500 });
  }

  const hasMore = comments.length > limit;
  const items = comments.slice(0, limit);

  // Get replies for each top-level comment
  const enriched = await Promise.all(items.map((c) => enrichComment(c, currentUserId)));

  const nextCursor = items.length > 0 ? items[items.length - 1].created_at : null;

  return { items: enriched, nextCursor, hasMore };
}

export async function getCommentReplies(
  commentId: string,
  currentUserId: string,
): Promise<CommentResult[]> {
  const adminClient = createAdminClient();

  const { data: replies } = await adminClient
    .from("post_comments")
    .select("*")
    .eq("parent_comment_id", commentId)
    .order("created_at", { ascending: true });

  if (!replies) return [];

  return await Promise.all(replies.map((r) => enrichComment(r, currentUserId)));
}

// ─── Follows ─────────────────────────────────────────────────────────────

export async function followUser(followerId: string, followingId: string): Promise<void> {
  const adminClient = createAdminClient();

  if (followerId === followingId) {
    throw new AppError("VALIDATION_ERROR", "You cannot follow yourself", { statusCode: 400 });
  }

  // Check block
  const blocked = await checkBlocked(followerId, followingId);
  if (blocked) {
    throw authorizationError("Cannot follow this user");
  }

  const { error } = await adminClient
    .from("follows")
    .insert({ follower_id: followerId, following_id: followingId });

  if (error) {
    if (error.code === "23505") {
      return; // Already following — idempotent
    }
    throw new AppError("INTERNAL_ERROR", "Failed to follow user", { statusCode: 500 });
  }

  await trackEvent(followerId, "follow_created", "user", followingId);
}

export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", followingId);

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to unfollow user", { statusCode: 500 });
  }

  await trackEvent(followerId, "follow_removed", "user", followingId);
}

export async function getFollowStatus(
  followerId: string,
  followingId: string,
): Promise<{ isFollowing: boolean }> {
  const adminClient = createAdminClient();

  const { count } = await adminClient
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", followerId)
    .eq("following_id", followingId);

  return { isFollowing: (count ?? 0) > 0 };
}

export async function getFollowersCount(userId: string): Promise<number> {
  const adminClient = createAdminClient();

  const { count } = await adminClient
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", userId);

  return count ?? 0;
}

export async function getFollowingCount(userId: string): Promise<number> {
  const adminClient = createAdminClient();

  const { count } = await adminClient
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", userId);

  return count ?? 0;
}

// ─── Reports ─────────────────────────────────────────────────────────────

export async function createReport(
  reporterId: string,
  data: import("@/features/feed/schemas/post.schema").CreateReportInput,
): Promise<void> {
  const adminClient = createAdminClient();

  const { error } = await adminClient.from("reports").insert({
    reporter_id: reporterId,
    reported_user_id: data.reportedUserId ?? null,
    reported_post_id: data.reportedPostId ?? null,
    reported_message_id: data.reportedMessageId ?? null,
    reason: data.reason,
    details: data.details ?? null,
  });

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to submit report", { statusCode: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

async function getAuthorSummary(
  authorId: string,
  currentUserId?: string,
): Promise<AuthorSummary | null> {
  const adminClient = createAdminClient();

  const { data: user } = await adminClient
    .from("users")
    .select("id, display_name, avatar_media_id")
    .eq("id", authorId)
    .single();

  if (!user) return null;

  const { data: profile } = await adminClient
    .from("profiles")
    .select("date_of_birth, city, is_verified")
    .eq("user_id", authorId)
    .single();

  let isFollowing = false;
  if (currentUserId && currentUserId !== authorId) {
    const { count } = await adminClient
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", currentUserId)
      .eq("following_id", authorId);
    isFollowing = (count ?? 0) > 0;
  }

  const age = profile?.date_of_birth ? calculateAgeSimple(profile.date_of_birth) : null;

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

function calculateAgeSimple(dateOfBirth: string): number {
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const mDiff = today.getMonth() - birth.getMonth();
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

async function enrichPost(
  post: Record<string, unknown>,
  currentUserId?: string,
): Promise<PostResult> {
  const adminClient = createAdminClient();

  const author = await getAuthorSummary(post.author_id as string, currentUserId);

  // Get media
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
    thumbnailUrl: null, // Future: resolve CDN URL
  }));

  // Get like state
  let isLiked = false;
  let isSaved = false;
  if (currentUserId) {
    const { count: likeCount } = await adminClient
      .from("post_likes")
      .select("*", { count: "exact", head: true })
      .eq("post_id", post.id as string)
      .eq("user_id", currentUserId);
    isLiked = (likeCount ?? 0) > 0;

    const { count: saveCount } = await adminClient
      .from("post_saves")
      .select("*", { count: "exact", head: true })
      .eq("post_id", post.id as string)
      .eq("user_id", currentUserId);
    isSaved = (saveCount ?? 0) > 0;
  }

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
    thumbnailMediaId: null, // Future
    isLiked,
    isSaved,
    createdAt: post.created_at as string,
    updatedAt: post.updated_at as string,
  };
}

async function enrichComment(
  comment: Record<string, unknown>,
  currentUserId: string,
): Promise<CommentResult> {
  const adminClient = createAdminClient();

  const author = await getAuthorSummary(comment.author_id as string, currentUserId);

  const isDeleted = comment.deleted_at !== null;

  // Get replies (one level)
  let replies: CommentResult[] = [];
  if (!isDeleted) {
    const { data: replyData } = await adminClient
      .from("post_comments")
      .select("*")
      .eq("parent_comment_id", comment.id as string)
      .order("created_at", { ascending: true });

    if (replyData) {
      replies = await Promise.all(
        replyData.map((r: Record<string, unknown>) => enrichComment(r, currentUserId)),
      );
    }
  }

  return {
    id: comment.id as string,
    postId: comment.post_id as string,
    authorId: comment.author_id as string,
    author,
    content: isDeleted ? "[deleted]" : (comment.content as string),
    parentCommentId: comment.parent_comment_id as string | null,
    replies,
    createdAt: comment.created_at as string,
    updatedAt: comment.updated_at as string,
    isDeleted,
  };
}

async function checkBlocked(userAId: string, userBId: string): Promise<boolean> {
  const adminClient = createAdminClient();

  const { count } = await adminClient
    .from("blocks")
    .select("*", { count: "exact", head: true })
    .or(
      `and(blocker_id.eq.${userAId},blocked_id.eq.${userBId}),and(blocker_id.eq.${userBId},blocked_id.eq.${userAId})`,
    );

  return (count ?? 0) > 0;
}
