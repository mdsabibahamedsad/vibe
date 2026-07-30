"use client";

import { useCallback, useRef } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useFeed } from "@/features/feed/hooks/useFeed";
import { usePost } from "@/features/feed/hooks/usePost";
import { FeedPost } from "./FeedPost";
import { Loading, EmptyState, ErrorState } from "@/components/ui";

export function Feed() {
  const { user, authenticated } = useCurrentUser();
  const {
    items,
    loading,
    loadingMore,
    error: feedError,
    hasMore,
    refresh,
    loadMore,
    removeItem,
    removeItemsByAuthor,
  } = useFeed();

  const {
    liking,
    error: postError,
    likePost,
    unlikePost,
    deletePost,
    followUser,
    unfollowUser,
    reportContent,
  } = usePost();

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loadingMore) return;
      if (observerRef.current) observerRef.current.disconnect();

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      });

      if (node) observerRef.current.observe(node);
    },
    [loadingMore, hasMore, loadMore],
  );

  const handleLike = useCallback(
    async (postId: string) => {
      await likePost(postId);
      // Optimistic update is handled in FeedPost, but we sync on failure
    },
    [likePost],
  );

  const handleUnlike = useCallback(
    async (postId: string) => {
      await unlikePost(postId);
    },
    [unlikePost],
  );

  const handleDelete = useCallback(
    async (postId: string) => {
      const success = await deletePost(postId);
      if (success) removeItem(postId);
    },
    [deletePost, removeItem],
  );

  const handleReport = useCallback(
    async (_postId: string, reportedUserId: string) => {
      await reportContent({
        reason: "spam",
        reportedUserId,
        reportedPostId: _postId,
      });
    },
    [reportContent],
  );
  const handleBlock = useCallback(
    async (userId: string) => {
      try {
        await fetch("/api/blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blockedUserId: userId }),
        });
        removeItemsByAuthor(userId);
      } catch {
        /* ignore */
      }
    },
    [removeItemsByAuthor],
  );

  if (!authenticated || !user) {
    return (
      <EmptyState
        title="Sign in to see your feed"
        description="Connect with people and see their posts here."
      />
    );
  }

  if (loading) {
    return <Loading fullScreen message="Loading feed..." />;
  }

  if (feedError) {
    return <ErrorState title="Failed to load feed" message={feedError} onRetry={refresh} />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Your feed is empty"
        description="Follow people to see their posts here. Or create your first post!"
        action={
          <a
            href="/create"
            className="mt-3 inline-block rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-medium text-white shadow-glow active:scale-95 transition"
          >
            Create Post
          </a>
        }
      />
    );
  }

  return (
    <div className="pb-safe">
      {/* Post error toast */}
      {postError && (
        <div className="fixed bottom-4 left-4 right-4 z-40 rounded-2xl bg-danger p-3 text-sm text-white shadow-lift">
          {postError}
        </div>
      )}

      {/* Feed items */}
      <div className="space-y-3">
        {items.map((post) => (
          <FeedPost
            key={post.id}
            post={post}
            currentUserId={user.id}
            onLike={handleLike}
            onUnlike={handleUnlike}
            onDelete={handleDelete}
            onFollow={async (userId) => {
              await followUser(userId);
            }}
            onUnfollow={async (userId) => {
              await unfollowUser(userId);
            }}
            onReport={handleReport}
            onBlock={handleBlock}
            liking={liking}
          />
        ))}
      </div>

      {/* Load more trigger */}
      {hasMore && (
        <div ref={loadMoreRef} className="flex justify-center py-6">
          {loadingMore ? (
            <Loading message="Loading more..." />
          ) : (
            <button
              onClick={loadMore}
              className="text-sm text-primary font-medium hover:text-accent-400 transition-colors"
            >
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
