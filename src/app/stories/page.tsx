"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useStories } from "@/features/stories/hooks/useStories";
import { useStoryViewer } from "@/features/stories/hooks/useStoryViewer";
import { StoriesBar } from "@/features/stories/components/StoriesBar";
import { StoryViewer } from "@/features/stories/components/StoryViewer";
import { StoryComposer } from "@/features/stories/components/StoryComposer";
import { useRouter, useSearchParams } from "next/navigation";
import { Loading, EmptyState, ErrorState } from "@/components/ui";

/**
 * StoriesPage — Full-screen stories page accessible from navigation.
 * Supports deep-link story opening via ?authorId=xxx or ?storyId=xxx.
 */
export default function StoriesPage() {
  const { user, authenticated, loading: authLoading } = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();

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

  // Handle deep-link: open viewer for specific author or story
  useEffect(() => {
    if (!loading && !authLoading && allGroups.length > 0) {
      const authorId = searchParams.get("authorId");
      const storyId = searchParams.get("storyId");

      if (authorId) {
        openViewer(authorId);
      } else if (storyId) {
        // Find which group this story belongs to
        for (const group of allGroups) {
          if (group.stories.some((s) => s.id === storyId)) {
            openViewer(group.authorId);
            break;
          }
        }
      }
    }
  }, [loading, authLoading, allGroups, searchParams, openViewer]);

  const handleStoryCreated = useCallback(() => {
    setComposerOpen(false);
    refresh();
  }, [refresh]);

  if (authLoading || loading) {
    return (
      <div className="min-h-dvh bg-[var(--tg-theme-bg-color,#ffffff)]">
        <Loading fullScreen message="Loading stories..." />
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <div className="min-h-dvh bg-[var(--tg-theme-bg-color,#ffffff)] flex items-center justify-center">
        <EmptyState
          title="Sign in to view stories"
          description="Connect with Telegram to see stories from people you follow."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-[var(--tg-theme-bg-color,#ffffff)] flex items-center justify-center">
        <ErrorState title="Failed to load stories" message={error} onRetry={refresh} />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--tg-theme-bg-color,#ffffff)] pb-safe">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--tg-theme-bg-color,#ffffff)]/80 backdrop-blur-md border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => router.back()}
            className="rounded-full p-1 text-[var(--tg-theme-text-color,#000000)] hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Go back"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
            Stories
          </h1>
          <div className="w-10" /> {/* Spacer */}
        </div>
      </div>

      {/* Stories Bar */}
      {(hasOwnStory || groups.length > 0) && (
        <StoriesBar
          groups={groups}
          hasOwnStory={hasOwnStory}
          ownStoryGroup={ownStoryGroup}
          currentUserId={user.id}
          onStoryPress={(authorId) => openViewer(authorId)}
          onAddStory={() => setComposerOpen(true)}
        />
      )}

      {/* Empty state */}
      {!hasOwnStory && groups.length === 0 && (
        <div className="px-4 mt-12">
          <EmptyState
            title="No stories yet"
            description="Share photos and videos that disappear after 24 hours."
            action={
              <button
                onClick={() => setComposerOpen(true)}
                className="mt-3 rounded-lg bg-[var(--tg-theme-button-color,#0088cc)] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Add Story
              </button>
            }
          />
        </div>
      )}

      {/* Story Viewer */}
      {viewerOpen && currentStory && currentGroup && (
        <StoryViewer
          key={`${currentGroupIndex}-${currentStoryIndex}`}
          story={currentStory}
          group={currentGroup}
          storyIndex={currentStoryIndex}
          totalInGroup={currentGroup.stories.length}
          allGroups={allGroups}
          currentGroupIndex={currentGroupIndex}
          currentUserId={user.id}
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

      {/* Story Composer */}
      <StoryComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onSuccess={handleStoryCreated}
      />
    </div>
  );
}
