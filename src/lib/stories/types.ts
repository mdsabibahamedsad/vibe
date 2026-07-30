/**
 * TypeScript types for the Stories system.
 */

import type { AuthorSummary, MediaItem } from "@/features/feed/services/post.service";

/** Story visibility options */
export type StoryVisibility = "public" | "followers_only";

/** Story reaction types */
export type StoryReactionType = "like" | "love" | "haha" | "wow" | "sad";

/** Story status */
export type StoryStatus = "active" | "expired" | "archived" | "deleted";

/** A story as returned from the API */
export interface StoryItem {
  id: string;
  authorId: string;
  author: AuthorSummary | null;
  media: MediaItem;
  caption: string | null;
  visibility: StoryVisibility;
  processingStatus: string;
  status: StoryStatus;
  createdAt: string;
  expiresAt: string;
  /** Number of views (only visible to story owner) */
  viewCount?: number;
  /** Whether the current user has viewed this story */
  isViewed: boolean;
  /** Current user's reaction, if any */
  myReaction?: StoryReactionType | null;
  /** Reaction summary (counts) */
  reactionCounts?: Record<string, number>;
}

/** A group of stories by a single author, for the StoriesBar */
export interface StoryGroup {
  authorId: string;
  author: AuthorSummary;
  stories: StoryItem[];
  /** Whether all stories in this group have been viewed by the current user */
  allViewed: boolean;
  /** Number of active stories */
  storyCount: number;
}

/** StoriesBar data — list of story groups for the bar */
export interface StoriesBarData {
  items: StoryGroup[];
  /** Whether the current user has their own story to show */
  hasOwnStory: boolean;
  ownStoryGroup?: StoryGroup;
}

/** Story view record */
export interface StoryViewRecord {
  storyId: string;
  viewerId: string;
  viewer: AuthorSummary | null;
  viewedAt: string;
}

/** Story viewer list response (owner only) */
export interface StoryViewerListResponse {
  viewers: StoryViewRecord[];
  totalCount: number;
  nextCursor: string | null;
  hasMore: boolean;
}

/** API response for active stories */
export interface ActiveStoriesResponse {
  groups: StoryGroup[];
  hasOwnStory: boolean;
}

/** Single story response with navigation context */
export interface StoryViewerData {
  story: StoryItem;
  authorStories: StoryItem[];
  currentIndex: number;
  totalInGroup: number;
}
