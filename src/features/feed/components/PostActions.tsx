"use client";

import { useState } from "react";

interface PostActionsProps {
  postId: string;
  isLiked: boolean;
  likeCount: number;
  commentCount: number;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  liking?: boolean;
}

export function PostActions({
  postId,
  isLiked,
  likeCount,
  commentCount,
  onLike,
  onComment,
  onShare,
  liking = false,
}: PostActionsProps) {
  const [animated, setAnimated] = useState(false);

  const handleLike = () => {
    if (liking) return;
    setAnimated(true);
    onLike();
    setTimeout(() => setAnimated(false), 300);
  };

  return (
    <div className="flex items-center gap-5 px-4 py-2">
      {/* Like */}
      <button
        onClick={handleLike}
        disabled={liking}
        className={`flex items-center gap-1.5 transition-all duration-200 active:scale-90 ${
          isLiked
            ? "text-accent-500 drop-shadow-[0_0_12px_rgba(236,72,153,0.55)]"
            : "text-muted hover:text-fg"
        } ${animated ? "scale-125" : ""}`}
        aria-label={isLiked ? "Unlike" : "Like"}
      >
        <svg
          className="h-5 w-5 transition-transform"
          fill={isLiked ? "currentColor" : "none"}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </svg>
        {likeCount > 0 && <span className="text-xs font-medium">{likeCount}</span>}
      </button>

      {/* Comment */}
      <button
        onClick={onComment}
        className="flex items-center gap-1.5 text-muted hover:text-fg transition-colors"
        aria-label="Comment"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        {commentCount > 0 && <span className="text-xs font-medium">{commentCount}</span>}
      </button>

      {/* Share */}
      <button
        onClick={onShare}
        className="flex items-center gap-1.5 text-muted hover:text-fg transition-colors ml-auto"
        aria-label="Share"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
        </svg>
      </button>
    </div>
  );
}
