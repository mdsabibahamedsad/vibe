"use client";

import { useCallback } from "react";
import { Avatar } from "@/components/ui";
import type { StoryGroup } from "@/lib/stories/types";

interface StoriesBarProps {
  groups: StoryGroup[];
  hasOwnStory: boolean;
  ownStoryGroup?: StoryGroup;
  currentUserId: string;
  onStoryPress: (authorId: string) => void;
  onAddStory: () => void;
}

/**
 * StoriesBar — Horizontal scrollable bar showing story rings.
 *
 * Shows:
 *  - Your Story (with + button)
 *  - Followed users' active stories
 *  - Story ring (gradient if unviewed, gray if all viewed)
 *  - User avatar
 *
 * Designed for mobile Telegram Mini App UX.
 */
export function StoriesBar({
  groups = [],
  hasOwnStory,
  ownStoryGroup,
  currentUserId,
  onStoryPress,
  onAddStory,
}: StoriesBarProps) {
  const allViewed = ownStoryGroup?.allViewed ?? false;

  return (
    <div className="w-full overflow-x-auto scrollbar-hide">
      <div className="flex gap-3 px-4 py-3 min-w-min">
        {/* Your Story */}
        <button
          onClick={onAddStory}
          className="flex flex-col items-center gap-1 flex-shrink-0"
          aria-label="Add story"
        >
          <div className="relative">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center ${
                hasOwnStory
                  ? allViewed
                    ? "ring-2 ring-gray-300 p-0.5"
                    : "bg-gradient-to-br from-purple-500 to-pink-500 p-0.5"
                  : "ring-2 ring-gray-200"
              }`}
            >
              <div className="w-full h-full rounded-full bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] flex items-center justify-center overflow-hidden">
                <svg
                  className="w-8 h-8 text-[var(--tg-theme-button-color,#0088cc)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </div>
            </div>
            {/* Plus button overlay */}
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-[var(--tg-theme-button-color,#0088cc)] rounded-full flex items-center justify-center border-2 border-[var(--tg-theme-bg-color,#ffffff)]">
              <svg
                className="w-3 h-3 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </div>
          </div>
          <span className="text-xs text-[var(--tg-theme-text-color,#000000)] truncate max-w-16 text-center">
            {hasOwnStory ? "Your Story" : "Add Story"}
          </span>
        </button>

        {/* Story rings for each author */}
        {groups.map((group) => (
          <StoryRing
            key={group.authorId}
            group={group}
            onPress={() => onStoryPress(group.authorId)}
          />
        ))}

        {/* No stories placeholder */}
        {groups.length === 0 && hasOwnStory && (
          <div className="flex items-center justify-center px-4">
            <p className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
              No stories from people you follow
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Story Ring (Individual Author) ──────────────────────────────────────

interface StoryRingProps {
  group: StoryGroup;
  onPress: () => void;
}

function StoryRing({ group, onPress }: StoryRingProps) {
  return (
    <button
      onClick={onPress}
      className="flex flex-col items-center gap-1 flex-shrink-0 transition-transform active:scale-95"
      aria-label={`View ${group.author.displayName}'s story`}
    >
      <div className="relative">
        {/* Gradient ring */}
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center ${
            group.allViewed
              ? "ring-2 ring-gray-300 p-0.5"
              : "bg-gradient-to-br from-purple-500 to-pink-500 p-0.5"
          }`}
        >
          <div className="w-full h-full rounded-full overflow-hidden bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
            <Avatar
              src={group.author.avatarUrl}
              alt={group.author.displayName}
              size="lg"
              fallback={group.author.displayName?.charAt(0) ?? "?"}
              className="w-full h-full"
            />
          </div>
        </div>
      </div>
      <span className="text-xs text-[var(--tg-theme-text-color,#000000)] truncate max-w-16 text-center">
        {group.author.displayName}
      </span>
    </button>
  );
}
