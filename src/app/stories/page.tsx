"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useStories } from "@/features/stories/hooks/useStories";
import { useStoryViewer } from "@/features/stories/hooks/useStoryViewer";
import { StoriesBar } from "@/features/stories/components/StoriesBar";
import { StoryViewer } from "@/features/stories/components/StoryViewer";
import { StoryComposer } from "@/features/stories/components/StoryComposer";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState, ErrorState, StorySkeleton } from "@/components/ui";
import { AppHeader } from "@/components/app-header";
import { BottomNav, DesktopNav } from "@/components/bottom-nav";
import { useTranslation } from "@/lib/i18n/useTranslation";

/**
 * StoriesPage — Full-screen stories page accessible from navigation.
 * Supports deep-link story opening via ?authorId=xxx or ?storyId=xxx.
 */
export default function StoriesPage() {
  const { user, authenticated, loading: authLoading } = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation("stories");

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
      <div className="flex min-h-dvh flex-col">
        <AppHeader title={t("title")} />
        <StorySkeleton />
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader title={t("title")} />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title={t("title")}
            description="Connect with Telegram to see stories from people you follow."
          />
        </div>
        <BottomNav />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader title={t("title")} />
        <div className="flex flex-1 items-center justify-center">
          <ErrorState title={t("title")} message={error} onRetry={refresh} />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-dvh pb-safe">
      {/* Header */}
      <AppHeader
        title={t("title")}
        leading={
          <button
            onClick={() => router.back()}
            className="rounded-full p-2 -ms-2 text-muted transition-colors hover:text-fg"
            aria-label={t("goBack")}
          >
            <svg className="h-5 w-5 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        }
      />

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
        <div className="mt-12 px-4">
          <EmptyState
            title={t("title")}
            description="Share photos and videos that disappear after 24 hours."
            action={
              <button
                onClick={() => setComposerOpen(true)}
                className="mt-3 rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform active:scale-95"
              >
                {t("addStory")}
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

      <BottomNav />
      <DesktopNav />
    </div>
  );
}
