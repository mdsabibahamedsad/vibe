"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { StoryGroup, StoryItem, StoryReactionType } from "@/lib/stories/types";

interface UseStoryViewerOptions {
  /** Groups of stories from StoriesBar */
  groups: StoryGroup[];
  /** The user's own story group */
  ownStoryGroup?: StoryGroup;
  /** Callback when viewer closes */
  onClose: () => void;
  /** Callback when a story is marked as viewed */
  onMarkViewed: (groupId: string, storyId: string) => void;
}

interface UseStoryViewerReturn {
  /** Current group being viewed */
  currentGroup: StoryGroup | null;
  /** All groups flattened for navigation */
  allGroups: StoryGroup[];
  /** Current story index within the current group */
  currentStoryIndex: number;
  /** Current group index in the flattened list */
  currentGroupIndex: number;
  /** Current story being displayed */
  currentStory: StoryItem | null;
  /** Whether the viewer is open */
  open: boolean;
  /** Open viewer for a specific author */
  openViewer: (authorId: string) => void;
  /** Navigate to next story */
  goNext: () => void;
  /** Navigate to previous story */
  goPrevious: () => void;
  /** Navigate to next author's stories */
  goNextAuthor: () => void;
  /** Navigate to previous author's stories */
  goPreviousAuthor: () => void;
  /** Pause the story timer */
  pause: () => void;
  /** Resume the story timer */
  resume: () => void;
  /** Close viewer */
  close: () => void;
  /** Add a reaction to current story */
  addReaction: (reaction: StoryReactionType) => Promise<void>;
  /** Remove reaction from current story */
  removeReaction: () => Promise<void>;
  /** Delete current story (owner only) */
  deleteCurrentStory: () => Promise<void>;
}

/**
 * Hook for managing the full-screen story viewer state.
 *
 * Handles:
 *  - Group navigation (between authors)
 *  - Story navigation (within an author's stories)
 *  - Pause/resume (for progress timer)
 *  - Reactions
 *  - Deletion
 */
export function useStoryViewer({
  groups,
  ownStoryGroup,
  onClose,
  onMarkViewed,
}: UseStoryViewerOptions): UseStoryViewerReturn {
  const [open, setOpen] = useState(false);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const viewedStories = useRef(new Set<string>());

  // Flatten all groups including own story at position 0
  // NOTE: allGroups is recreated each render, but its identity is stable when groups/ownStoryGroup change.
  // The currentGroup/currentStory derivations read from the latest value each render.
  const allGroups = useMemo(() => {
    return ownStoryGroup ? [ownStoryGroup, ...groups] : groups;
  }, [ownStoryGroup, groups]);

  // Track pending reactions for optimistic updates
  const [pendingReactions, setPendingReactions] = useState<Map<string, StoryReactionType>>(new Map());

  const currentGroup = allGroups[currentGroupIndex] ?? null;
  const rawStory = currentGroup?.stories[currentStoryIndex] ?? null;

  // Merge pending reactions into the current story for optimistic display
  const currentStory = rawStory && pendingReactions.has(rawStory.id)
    ? { ...rawStory, myReaction: pendingReactions.get(rawStory.id)! as StoryReactionType }
    : rawStory;

  // Record view when story changes
  useEffect(() => {
    if (!currentStory || !open) return;
    if (viewedStories.current.has(currentStory.id)) return;

    viewedStories.current.add(currentStory.id);

    // Mark as viewed in StoriesBar
    if (currentGroup) {
      onMarkViewed(currentGroup.authorId, currentStory.id);
    }

    // Record view server-side
    fetch(`/api/stories/${currentStory.id}/view`, {
      method: "POST",
    }).catch(() => {
      // Best-effort
    });

    // Note: Analytics are tracked server-side in recordStoryView()
  }, [currentStory?.id, open, currentGroup, onMarkViewed]);

  const openViewer = useCallback(
    (authorId: string) => {
      const index = allGroups.findIndex((g) => g.authorId === authorId);
      if (index >= 0) {
        setCurrentGroupIndex(index);
        setCurrentStoryIndex(0);
        setOpen(true);
        setPaused(false);
      }
    },
    [allGroups],
  );

  const goNext = useCallback(() => {
    if (!currentGroup) return;

    if (currentStoryIndex < currentGroup.stories.length - 1) {
      // Next story in same group
      setCurrentStoryIndex((prev) => prev + 1);
    } else if (currentGroupIndex < allGroups.length - 1) {
      // Next author's stories
      setCurrentGroupIndex((prev) => prev + 1);
      setCurrentStoryIndex(0);
    } else {
      // End of all stories — close
      setOpen(false);
      onClose();
    }
  }, [currentGroup, currentStoryIndex, currentGroupIndex, allGroups, onClose]);

  const goPrevious = useCallback(() => {
    if (currentStoryIndex > 0) {
      // Previous story in same group
      setCurrentStoryIndex((prev) => prev - 1);
    } else if (currentGroupIndex > 0) {
      // Previous author's stories
      setCurrentGroupIndex((prev) => prev - 1);
      const prevGroup = allGroups[currentGroupIndex - 1];
      setCurrentStoryIndex(prevGroup ? Math.max(0, prevGroup.stories.length - 1) : 0);
    }
  }, [currentStoryIndex, currentGroupIndex, allGroups]);

  const goNextAuthor = useCallback(() => {
    if (currentGroupIndex < allGroups.length - 1) {
      setCurrentGroupIndex((prev) => prev + 1);
      setCurrentStoryIndex(0);
    } else {
      setOpen(false);
      onClose();
    }
  }, [currentGroupIndex, allGroups, onClose]);

  const goPreviousAuthor = useCallback(() => {
    if (currentGroupIndex > 0) {
      setCurrentGroupIndex((prev) => prev - 1);
      setCurrentStoryIndex(0);
    }
  }, [currentGroupIndex]);

  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);

  const close = useCallback(() => {
    setOpen(false);
    onClose();
  }, [onClose]);

  const addReaction = useCallback(
    async (reaction: StoryReactionType) => {
      if (!currentStory) return;

      // Optimistic update: store reaction locally immediately
      setPendingReactions((prev) => {
        const next = new Map(prev);
        next.set(currentStory.id, reaction);
        return next;
      });

      try {
        const res = await fetch(
          `/api/stories/${currentStory.id}/reactions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reaction }),
          },
        );

        if (!res.ok) throw new Error("Failed to add reaction");
      } catch (err) {
        // Rollback on failure
        setPendingReactions((prev) => {
          const next = new Map(prev);
          next.delete(currentStory.id);
          return next;
        });
        logger.error("Failed to add reaction", {
          error: err instanceof Error ? err.message : "Unknown",
        });
      }
    },
    [currentStory],
  );

  const removeReaction = useCallback(async () => {
    if (!currentStory) return;

    // Optimistic update: remove reaction locally immediately
    setPendingReactions((prev) => {
      const next = new Map(prev);
      next.delete(currentStory.id);
      return next;
    });

    try {
      const res = await fetch(
        `/api/stories/${currentStory.id}/reactions`,
        {
          method: "DELETE",
        },
      );

      if (!res.ok) throw new Error("Failed to remove reaction");
    } catch (err) {
      // Rollback is complex without knowing the original reaction
      logger.error("Failed to remove reaction", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  }, [currentStory]);

  const deleteCurrentStory = useCallback(async () => {
    if (!currentStory) return;

    try {
      const res = await fetch(`/api/stories/${currentStory.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete story");

      // Navigate to next story or close
      if (currentGroup && currentGroup.stories.length <= 1) {
        // This was the last story in the group — go to next author
        goNextAuthor();
      } else {
        goNext();
      }
    } catch (err) {
      logger.error("Failed to delete story", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  }, [currentStory, currentGroup, goNext, goNextAuthor]);

  return {
    currentGroup,
    allGroups,
    currentStoryIndex,
    currentGroupIndex,
    currentStory,
    open,
    openViewer,
    goNext,
    goPrevious,
    goNextAuthor,
    goPreviousAuthor,
    pause,
    resume,
    close,
    addReaction,
    removeReaction,
    deleteCurrentStory,
  };
}
