"use client";

import { useCallback, useRef, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useStories } from "@/features/stories/hooks/useStories";
import { useStoryViewer } from "@/features/stories/hooks/useStoryViewer";
import { StoriesBar } from "@/features/stories/components/StoriesBar";
import { StoryViewer } from "@/features/stories/components/StoryViewer";
import { StoryComposer } from "@/features/stories/components/StoryComposer";
import { Loading, EmptyState, ErrorState } from "@/components/ui";

interface StoriesSectionProps {
  onStoryCreate?: () => void;
}

/**
 * StoriesSection — Full stories system component.
 * Renders the StoriesBar and manages the viewer and composer.
 */
export function StoriesSection({ onStoryCreate }: StoriesSectionProps) {
  const { user } = useCurrentUser();
  const {
    groups,
    hasOwnStory,
    ownStoryGroup,
    loading,
    error,
    refresh,
    removeStory,
    markViewed,
  } = useStories();

  const [composerOpen, setComposerOpen] = useState(false);

  const handleClose = useCallback(() => {
    // Refresh stories when viewer closes
    refresh();
  }, [refresh]);

  const {
    open: viewerOpen,
    currentStory,
    currentGroup,
    currentStoryIndex,
    currentGroupIndex,
    allGroups,
    openViewer,
    goNext,
    goPrevious,
    pause,
    resume,
    close: closeViewer,
    addReaction,
    removeReaction,
    deleteCurrentStory,
  } = useStoryViewer({
    groups,
    ownStoryGroup,
    onClose: handleClose,
    onMarkViewed: markViewed,
  });

  const handleStoryCreated = useCallback(() => {
    setComposerOpen(false);
    refresh();
    onStoryCreate?.();
  }, [refresh, onStoryCreate]);

  if (loading) {
    return <Loading message="Loading stories..." />;
  }

  if (error) {
    return <ErrorState title="Failed to load stories" message={error} onRetry={refresh} />;
  }

  const hasStories = hasOwnStory || groups.length > 0;

  if (!hasStories) {
    return (
      <div className="px-4 py-3">
        <EmptyState
          title="No stories yet"
          description="Be the first to share a story!"
          action={
            <button
              onClick={() => setComposerOpen(true)}
              className="mt-2 rounded-lg bg-[var(--tg-theme-button-color,#0088cc)] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Add Story
            </button>
          }
        />
      </div>
    );
  }

  return (
    <>
      {/* Stories Bar */}
      <StoriesBar
        groups={groups}
        hasOwnStory={hasOwnStory}
        ownStoryGroup={ownStoryGroup}
        currentUserId={user?.id ?? ""}
        onStoryPress={(authorId) => openViewer(authorId)}
        onAddStory={() => setComposerOpen(true)}
      />

      {/* Story Viewer (full-screen) */}
      {viewerOpen && currentStory && currentGroup && (
        <StoryViewer
          key={`${currentGroupIndex}-${currentStoryIndex}`}
          story={currentStory}
          group={currentGroup}
          storyIndex={currentStoryIndex}
          totalInGroup={currentGroup.stories.length}
          allGroups={allGroups}
          currentGroupIndex={currentGroupIndex}
          currentUserId={user?.id ?? ""}
          onNext={goNext}
          onPrevious={goPrevious}
          onPause={pause}
          onResume={resume}
          onClose={closeViewer}
          onAddReaction={addReaction}
          onRemoveReaction={removeReaction}
          onDelete={deleteCurrentStory}
        />
      )}

      {/* Story Composer (bottom sheet / modal) */}
      <StoryComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onSuccess={handleStoryCreated}
      />
    </>
  );
}
