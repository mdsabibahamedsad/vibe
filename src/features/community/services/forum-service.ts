import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { CommunityPost } from "../types";

export interface ForumFeedParams {
  communityId?: string;
  cursor?: string;
  limit?: number;
}

export interface ForumFeedResponse {
  items: CommunityPost[];
  nextCursor: string | null;
  hasMore: boolean;
}

export async function getCommunityForumFeed(
  communityId: string,
  params: ForumFeedParams = {},
): Promise<ForumFeedResponse> {
  const adminClient = createAdminClient();

  let currentUserId: string | undefined;
  try {
    const user = await getCurrentUser();
    currentUserId = user.id;
  } catch {}

  const { cursor, limit = 20 } = params;

  const { data: memberIds } = await adminClient
    .from("community_members")
    .select("user_id")
    .eq("community_id", communityId);

  const userIds = (memberIds ?? []).map((m: { user_id: string }) => m.user_id);
  if (userIds.length === 0) {
    return { items: [], nextCursor: null, hasMore: false };
  }

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
    .in("author_id", userIds)
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
    logger.error("Failed to fetch community forum feed", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to load forum posts", { statusCode: 500 });
  }

  const hasMore = (posts?.length ?? 0) > limit;
  const items = (posts ?? []).slice(0, limit);

  const enriched = await Promise.all(
    items.map((post: Record<string, unknown>) => enrichCommunityPost(post, currentUserId)),
  );

  const nextCursor =
    items.length > 0 ? `${(items[items.length - 1] as Record<string, unknown>).created_at}_${(items[items.length - 1] as Record<string, unknown>).id}` : null;

  return { items: enriched, nextCursor, hasMore };
}

export async function createCommunityPost(data: {
  communityId: string;
  caption: string;
  postType?: string;
  visibility?: string;
}): Promise<CommunityPost> {
  const adminClient = createAdminClient();
  const user = await getCurrentUser();

  const { data: membership } = await adminClient
    .from("community_members")
    .select("role")
    .eq("community_id", data.communityId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    throw new AppError("AUTHORIZATION_ERROR", "You must be a member to post in this community", {
      statusCode: 403,
    });
  }

  const { data: post, error } = await adminClient
    .from("posts")
    .insert({
      author_id: user.id,
      caption: data.caption,
      post_type: data.postType ?? "text",
      visibility: data.visibility ?? "public",
    })
    .select()
    .single();

  if (error) {
    logger.error("Failed to create community post", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to create post", { statusCode: 500 });
  }

  return enrichCommunityPost(post, user.id);
}

export async function deleteCommunityPost(postId: string): Promise<void> {
  const adminClient = createAdminClient();
  const user = await getCurrentUser();

  const { data: post } = await adminClient
    .from("posts")
    .select("id, author_id")
    .eq("id", postId)
    .single();

  if (!post) {
    throw new AppError("VALIDATION_ERROR", "Post not found", { statusCode: 404 });
  }

  if (post.author_id !== user.id) {
    const { data: membership } = await adminClient
      .from("community_members")
      .select("role")
      .eq("user_id", user.id);

    const isMod = (membership ?? []).some(
      (m: { role: string }) => m.role === "admin" || m.role === "moderator",
    );

    if (!isMod) {
      throw new AppError("AUTHORIZATION_ERROR", "Not authorized to delete this post", {
        statusCode: 403,
      });
    }
  }

  const { error } = await adminClient
    .from("posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", postId);

  if (error) {
    logger.error("Failed to delete community post", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to delete post", { statusCode: 500 });
  }
}

async function enrichCommunityPost(
  post: Record<string, unknown>,
  currentUserId?: string,
): Promise<CommunityPost> {
  const adminClient = createAdminClient();

  const { data: user } = await adminClient
    .from("users")
    .select("id, display_name, avatar_media_id")
    .eq("id", post.author_id as string)
    .single();

  let isLiked = false;
  if (currentUserId) {
    const { count } = await adminClient
      .from("post_likes")
      .select("*", { count: "exact", head: true })
      .eq("post_id", post.id as string)
      .eq("user_id", currentUserId);
    isLiked = (count ?? 0) > 0;
  }

  return {
    id: post.id as string,
    authorId: post.author_id as string,
    authorName: user?.display_name ?? "Unknown",
    authorAvatar: user?.avatar_media_id ?? null,
    caption: post.caption as string | null,
    postType: post.post_type as string,
    visibility: post.visibility as string,
    likeCount: post.like_count as number,
    commentCount: post.comment_count as number,
    createdAt: post.created_at as string,
    isLiked,
  };
}
