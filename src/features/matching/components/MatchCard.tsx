"use client";

import { Avatar } from "@/components/ui";
import type { MatchItem } from "@/features/matching/services/match.service";
import { timeAgo } from "@/lib/utils";

interface MatchCardProps {
  match: MatchItem;
  onPress?: () => void;
}

/**
 * MatchCard — Displays a single match in the match list.
 *
 * Features:
 *  - Avatar with unread indicator ring
 *  - Display name, age, city
 *  - Match date (relative)
 *  - Unread dot indicator
 *  - Accessible touch target
 */
export function MatchCard({ match, onPress }: MatchCardProps) {
  const formatMatchDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = Date.now();
    const diff = now - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  };

  return (
    <button
      onClick={onPress}
      className="flex items-center gap-3 w-full px-4 py-3 surface-card rounded-2xl text-left transition-all duration-200 hover:shadow-lift"
      aria-label={`Open chat with ${match.user.displayName}`}
    >
      {/* Avatar with unread ring */}
      <div className="relative flex-shrink-0">
        <Avatar
          src={match.user.avatarUrl}
          alt={match.user.displayName}
          size="lg"
          fallback={match.user.displayName.charAt(0)}
          ring={match.unread}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-display font-semibold text-fg truncate">
            {match.user.displayName}
          </span>
          {match.user.age && (
            <span className="text-sm text-muted">
              {match.user.age}
            </span>
          )}
          {/* Unread dot */}
          {match.unread && (
            <span className="w-2 h-2 rounded-full bg-accent-500 shadow-[0_0_8px_var(--color-accent-500)] flex-shrink-0" aria-label="Unread" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {match.user.city && (
            <span className="text-xs text-muted truncate">
              {match.user.city}
            </span>
          )}
          <span className="text-xs text-subtle">
            Matched {formatMatchDate(match.matchedAt)}
          </span>
        </div>
      </div>

      {/* Chevron */}
      <svg
        className="w-4 h-4 text-muted flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
