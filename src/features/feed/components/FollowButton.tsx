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
    size === "sm" ? "px-3 py-1 text-xs rounded-full" : "px-4 py-2 text-sm rounded-full";

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
            ? "bg-danger text-white border border-transparent"
            : "bg-surface-2 border border-divider text-fg"
          : "bg-brand-gradient text-white shadow-glow hover:opacity-90 active:scale-95"
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
