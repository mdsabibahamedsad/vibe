"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { StoriesBarData, StoryGroup, StoryItem } from "@/lib/stories/types";

interface UseStoriesReturn {
  /** StoriesBar data (grouped by author) */
  groups: StoryGroup[];
  /** Whether the current user has their own story */
  hasOwnStory: boolean;
  /** The user's own story group, if any */
  ownStoryGroup: StoryGroup | undefined;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Refresh stories */
  refresh: () => Promise<void>;
  /** Remove a story (optimistic update) */
  removeStory: (storyId: string) => void;
  /** Mark a story as viewed (optimistic update) */
  markViewed: (groupId: string, storyId: string) => void;
}

/**
 * Hook for fetching and managing the StoriesBar data.
 */
export function useStories(): UseStoriesReturn {
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [hasOwnStory, setHasOwnStory] = useState(false);
  const [ownStoryGroup, setOwnStoryGroup] = useState<StoryGroup | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const fetchStories = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000); // 15s timeout

    try {
      const res = await fetch("/api/stories", {
        signal: controller.signal,
      });

      if (!res.ok) {
        const result = await res.json().catch(() => ({ error: "Failed to load stories" }));
        throw new Error(result.error || "Failed to load stories");
      }

      const data: StoriesBarData = await res.json();

      setGroups(data.items);
      setHasOwnStory(data.hasOwnStory);
      setOwnStoryGroup(data.ownStoryGroup);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request timed out. Please try again.");
        logger.warn("Stories fetch timed out");
      } else {
        logger.error("Stories load error", {
          error: err instanceof Error ? err.message : "Unknown",
        });
        setError(err instanceof Error ? err.message : "Failed to load stories");
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  const removeStory = useCallback((storyId: string) => {
    // Remove from groups
    setGroups((prev) => {
      const updated = prev.map((group) => ({
        ...group,
        stories: group.stories.filter((s) => s.id !== storyId),
      }));
      return updated.filter((group) => group.stories.length > 0);
    });

    // Remove from own story group
    setOwnStoryGroup((prev) => {
      if (!prev) return prev;
      const filtered = prev.stories.filter((s) => s.id !== storyId);
      if (filtered.length === 0) {
        setHasOwnStory(false);
        return undefined;
      }
      return { ...prev, stories: filtered, storyCount: filtered.length };
    });
  }, []);

  const markViewed = useCallback((groupId: string, storyId: string) => {
    // Update in groups
    setGroups((prev) =>
      prev.map((group) => {
        if (group.authorId !== groupId) return group;
        const updatedStories = group.stories.map((s) =>
          s.id === storyId ? { ...s, isViewed: true } : s,
        );
        const allViewed = updatedStories.every((s) => s.isViewed);
        return { ...group, stories: updatedStories, allViewed };
      }),
    );
  }, []);

  return {
    groups,
    hasOwnStory,
    ownStoryGroup,
    loading,
    error,
    refresh: fetchStories,
    removeStory,
    markViewed,
  };
}

// ─── Single Author Stories ───────────────────────────────────────────────

interface UseAuthorStoriesReturn {
  stories: StoryItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching stories by a single author (for the viewer).
 */
export function useAuthorStories(
  authorId: string | null,
): UseAuthorStoriesReturn {
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStories = useCallback(async () => {
    if (!authorId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/stories?authorId=${authorId}`);

      if (!res.ok) {
        throw new Error("Failed to load stories");
      }

      const data = await res.json();
      setStories(data.stories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stories");
    } finally {
      setLoading(false);
    }
  }, [authorId]);

  useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  return {
    stories,
    loading,
    error,
    refresh: fetchStories,
  };
}
