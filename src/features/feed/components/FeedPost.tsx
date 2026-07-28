"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui";
import { PostMedia } from "./PostMedia";
import { PostActions } from "./PostActions";
import { PostMenu } from "./PostMenu";
import { FollowButton } from "./FollowButton";
import { CommentSheet } from "./CommentSheet";
import { shareDeepLink } from "@/lib/utils/deep-link";
import type { FeedItem } from "@/features/feed/services/feed.service";

interface FeedPostProps {
  post: FeedItem;
  currentUserId: string;
  onLike: (postId: string) => void;
  onUnlike: (postId: string) => void;
  onDelete: (postId: string) => void;
  onFollow: (userId: string) => void;
  onUnfollow: (userId: string) => void;
  onReport: (postId: string, reportedUserId: string) => void;
  onBlock: (userId: string) => void;
  liking?: boolean;
}

export function FeedPost({
  post,
  currentUserId,
  onLike,
  onUnlike,
  onDelete,
  onFollow,
  onUnfollow,
  onReport,
  onBlock,
  liking = false,
}: FeedPostProps) {
  const [commentOpen, setCommentOpen] = useState(false);
  const [isLiked, setIsLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [isFollowing, setIsFollowing] = useState(post.author?.isFollowing ?? false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const isOwnPost = post.authorId === currentUserId;

  const handleLikeToggle = async () => {
    if (isLiked) {
      setIsLiked(false);
      setLikeCount((c) => Math.max(0, c - 1));
      await onUnlike(post.id);
    } else {
      setIsLiked(true);
      setLikeCount((c) => c + 1);
      await onLike(post.id);
    }
  };

  const handleDelete = () => {
    setShowConfirmDelete(true);
  };

  const confirmDelete = async () => {
    await onDelete(post.id);
    setShowConfirmDelete(false);
  };

  const handleShare = () => {
    shareDeepLink("post", post.id);
  };

  const formatTime = (dateStr: string) => {
    const now = Date.now();
    const date = new Date(dateStr).getTime();
    const diff = now - date;

    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m`;

    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;

    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <>
      <div className="bg-[var(--tg-theme-bg-color,#ffffff)] border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Avatar
              src={post.author?.avatarUrl}
              alt={post.author?.displayName ?? "User"}
              size="md"
              fallback={post.author?.displayName?.charAt(0) ?? "?"}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-sm font-semibold text-[var(--tg-theme-text-color,#000000)] truncate">
                  {post.author?.displayName ?? "Unknown"}
                </span>
                {post.author?.isVerified && (
                  <svg
                    className="h-4 w-4 flex-shrink-0 text-blue-500"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {post.author?.age && (
                  <span className="text-sm text-[var(--tg-theme-hint-color,#999999)]">
                    {post.author.age}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {post.author?.city && (
                  <span className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
                    {post.author.city}
                  </span>
                )}
                <span className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
                  {formatTime(post.createdAt)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isOwnPost && (
              <FollowButton
                userId={post.authorId}
                isFollowing={isFollowing}
                onFollow={async () => {
                  setIsFollowing(true);
                  await onFollow(post.authorId);
                }}
                onUnfollow={async () => {
                  setIsFollowing(false);
                  await onUnfollow(post.authorId);
                }}
                size="sm"
              />
            )}
            <PostMenu
              isOwnPost={isOwnPost}
              postId={post.id}
              onEdit={undefined}
              onDelete={handleDelete}
              onReport={() => onReport(post.id, post.authorId)}
              onBlock={() => onBlock(post.authorId)}
            />
          </div>
        </div>

        {/* Caption */}
        {post.caption && (
          <div className="px-4 pb-3">
            <p className="text-sm text-[var(--tg-theme-text-color,#000000)] leading-relaxed">
              {post.caption}
            </p>
          </div>
        )}

        {/* Media */}
        <PostMedia media={post.media} postType={post.postType} />

        {/* Actions */}
        <PostActions
          postId={post.id}
          isLiked={isLiked}
          likeCount={likeCount}
          commentCount={commentCount}
          onLike={handleLikeToggle}
          onComment={() => setCommentOpen(true)}
          onShare={handleShare}
          liking={liking}
        />

        {/* View comments link */}
        {commentCount > 0 && (
          <div className="px-4 pb-3">
            <button
              onClick={() => setCommentOpen(true)}
              className="text-sm text-[var(--tg-theme-hint-color,#999999)] hover:text-[var(--tg-theme-button-color,#0088cc)]"
            >
              View all {commentCount} comment{commentCount !== 1 ? "s" : ""}
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {showConfirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-[var(--tg-theme-bg-color,#ffffff)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
              Delete post?
            </h3>
            <p className="mt-2 text-sm text-[var(--tg-theme-hint-color,#999999)]">
              This action cannot be undone. The post will be removed from your feed.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="flex-1 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] py-2.5 text-sm font-medium text-[var(--tg-theme-text-color,#000000)]"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comment sheet */}
      <CommentSheet
        open={commentOpen}
        onClose={() => setCommentOpen(false)}
        postId={post.id}
        onCommentCreated={(change) => setCommentCount((c) => Math.max(0, c + change))}
      />
    </>
  );
}
