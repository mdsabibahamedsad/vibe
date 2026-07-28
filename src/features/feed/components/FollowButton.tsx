"use client";

import { useState, useCallback } from "react";

interface FollowButtonProps {
  userId: string;
  isFollowing: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  size?: "sm" | "md";
}

export function FollowButton({
  userId,
  isFollowing,
  onFollow,
  onUnfollow,
  size = "sm",
}: FollowButtonProps) {
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(isFollowing);
  const [hovering, setHovering] = useState(false);

  const handleClick = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    try {
      if (following) {
        await onUnfollow();
        setFollowing(false);
      } else {
        await onFollow();
        setFollowing(true);
      }
    } finally {
      setLoading(false);
    }
  }, [loading, following, onFollow, onUnfollow]);

  const sizeClasses =
    size === "sm" ? "px-3 py-1 text-xs rounded-full" : "px-4 py-2 text-sm rounded-lg";

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={`font-medium transition-all duration-150 ${sizeClasses} ${
        loading ? "opacity-50" : ""
      } ${
        following
          ? hovering
            ? "bg-red-50 text-red-500 border border-red-200"
            : "bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] text-[var(--tg-theme-text-color,#000000)] border border-transparent"
          : "bg-[var(--tg-theme-button-color,#0088cc)] text-white hover:opacity-90"
      }`}
      aria-label={following ? "Unfollow" : "Follow"}
    >
      {loading ? (
        <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : following ? (
        hovering ? (
          "Unfollow"
        ) : (
          "Following"
        )
      ) : (
        "Follow"
      )}
    </button>
  );
}
