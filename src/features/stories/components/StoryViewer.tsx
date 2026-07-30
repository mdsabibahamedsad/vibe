"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui";
import {
  STORY_IMAGE_DISPLAY_DURATION_MS,
  STORY_REACTION_TYPES,
} from "@/lib/stories/constants";
import type {
  StoryGroup,
  StoryItem,
  StoryReactionType,
} from "@/lib/stories/types";
import { timeAgo } from "@/lib/utils";

interface StoryViewerProps {
  story: StoryItem;
  group: StoryGroup;
  storyIndex: number;
  totalInGroup: number;
  allGroups: StoryGroup[];
  currentGroupIndex: number;
  currentUserId: string;
  onNext: () => void;
  onPrevious: () => void;
  onPause: () => void;
  onResume: () => void;
  onClose: () => void;
  onAddReaction: (reaction: StoryReactionType) => void;
  onRemoveReaction: () => void;
  onDelete: () => void;
}

/**
 * StoryViewer — Full-screen mobile story viewer.
 *
 * Features:
 *  - Full-screen media display
 *  - Progress bars at top
 *  - Author info overlay
 *  - Tap left/right to navigate
 *  - Hold to pause
 *  - Auto-progression for images
 *  - Video playback with mute/unmute
 *  - Reaction buttons
 *  - Close button
 *  - Delete button (owner only)
 */
export function StoryViewer({
  story,
  group,
  storyIndex,
  totalInGroup,
  allGroups,
  currentGroupIndex,
  currentUserId,
  onNext,
  onPrevious,
  onPause,
  onResume,
  onClose,
  onAddReaction,
  onRemoveReaction,
  onDelete,
}: StoryViewerProps) {
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [showReactions, setShowReactions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressStartRef = useRef(Date.now());
  const navigationGuardRef = useRef(false); // Prevents double-navigation

  const isVideo = story.media.mediaType === "video";
  const isOwnStory = story.authorId === currentUserId;
  const displayDuration = isVideo
    ? (story.media.durationSeconds ?? 5) * 1000
    : STORY_IMAGE_DISPLAY_DURATION_MS;
  const imageUrl = story.media.thumbnailUrl || `/api/media/${story.media.mediaId}`;

  // ─── Progress Timer ──────────────────────────────────────────────────

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    progressStartRef.current = Date.now();
    setProgress(0);

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - progressStartRef.current;
      const pct = Math.min((elapsed / displayDuration) * 100, 99);

      setProgress(pct);

      if (elapsed >= displayDuration) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        onNext();
      }
    }, 100);
  }, [displayDuration, onNext]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Reset and restart timer when story changes
  useEffect(() => {
    if (!isVideo) {
      startTimer();
    } else if (videoRef.current) {
      // Video handles its own timing
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }

    setMediaLoaded(false);
    setMediaError(false);
    setShowReactions(false);
    setShowMenu(false);
    setShowDeleteConfirm(false);
    setShowReplyInput(false);

    return () => {
      stopTimer();
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
      }
    };
  }, [story.id, isVideo, startTimer, stopTimer]);

  // ─── Pause/Resume ───────────────────────────────────────────────────

  useEffect(() => {
    if (paused) {
      stopTimer();
      if (videoRef.current) videoRef.current.pause();
    } else {
      if (!isVideo) startTimer();
      if (isVideo && videoRef.current) {
        videoRef.current.play().catch(() => {});
      }
    }
  }, [paused, isVideo, startTimer, stopTimer]);

  // ─── Video Progress Tracking ─────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;

    const onTimeUpdate = () => {
      if (video.duration) {
        const pct = (video.currentTime / video.duration) * 100;
        setProgress(Math.min(pct, 99));
      }
    };

    const onEnded = () => {
      setProgress(100);
      onNext();
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
    };
  }, [isVideo, onNext]);

  // ─── Handle Visibility Change (pause when app hidden) ──────────────

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        stopTimer();
        if (videoRef.current) videoRef.current.pause();
      } else if (!paused) {
        if (!isVideo) startTimer();
        if (isVideo && videoRef.current) {
          videoRef.current.play().catch(() => {});
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [paused, isVideo, startTimer, stopTimer]);

  // ─── Touch/Swipe Handling ──────────────────────────────────────────

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndX = useRef(0);
  const touchEndY = useRef(0);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      setPaused(true);
      onPause();

      longPressRef.current = setTimeout(() => {
        // Long press detected
      }, 500);
    },
    [onPause],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      touchEndX.current = e.changedTouches[0].clientX;
      touchEndY.current = e.changedTouches[0].clientY;

      if (longPressRef.current) {
        clearTimeout(longPressRef.current);
        longPressRef.current = null;
      }

      const diffX = touchStartX.current - touchEndX.current;
      const diffY = touchStartY.current - touchEndY.current;

      // Set navigation guard to prevent subsequent tap from double-triggering
      navigationGuardRef.current = true;

      // Swipe right to go back
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
        if (diffX <= 0) {
          // Swipe right — previous
          onPrevious();
        }
        // Swipe left — handled by tap
      }

      // Clear guard after a short delay
      setTimeout(() => {
        navigationGuardRef.current = false;
      }, 300);

      setPaused(false);
      onResume();
    },
    [onPrevious, onResume],
  );

  // ─── Tap Navigation ────────────────────────────────────────────────

  const handleTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Prevent tap from firing after a swipe
      if (navigationGuardRef.current) return;

      if (showReactions || showMenu || showReplyInput) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;

      // Left third: go to previous
      if (x < width * 0.33) {
        onPrevious();
      }
      // Right third: go to next
      else if (x > width * 0.66) {
        onNext();
      }
      // Middle third: toggle reactions
      else {
        setShowReactions((prev) => !prev);
      }
    },
    [onPrevious, onNext, showReactions, showMenu, showReplyInput],
  );

  // ─── Keyboard Support ──────────────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          onPrevious();
          break;
        case "ArrowRight":
        case " ":
          onNext();
          break;
        case "Escape":
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onPrevious, onNext, onClose]);

  // ─── Reaction Handler ──────────────────────────────────────────────

  const handleReaction = useCallback(
    (reaction: StoryReactionType) => {
      onAddReaction(reaction);
      setShowReactions(false);
    },
    [onAddReaction],
  );

  // ─── Progress Bar Segments ─────────────────────────────────────────

  const progressSegments = allGroups.map((g, gIdx) => {
    return g.stories.map((s, sIdx) => {
      const isActive =
        gIdx === currentGroupIndex && sIdx === storyIndex;
      const isPast =
        gIdx < currentGroupIndex ||
        (gIdx === currentGroupIndex && sIdx < storyIndex);
      const pct = isActive ? progress : isPast ? 100 : 0;

      return {
        key: s.id,
        pct,
        isActive,
        isPast,
      };
    });
  });

  // Flatten segments
  const flatSegments = progressSegments.flat();

  return (
    <div
      className="fixed inset-0 z-50 bg-black touch-none select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleTap}
    >
      {/* ─── Progress Bars ─────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 px-2 pt-2">
        {flatSegments.map((seg, idx) => (
          <div
            key={seg.key}
            className="h-0.5 flex-1 rounded-full bg-white/30 overflow-hidden"
          >
            <div
              className={`h-full rounded-full transition-all duration-100 ease-linear ${
                seg.isPast ? "bg-white" : "bg-white"
              }`}
              style={{
                width: `${seg.pct}%`,
                transitionDuration: seg.isActive ? "100ms" : "0ms",
              }}
            />
          </div>
        ))}
      </div>

      {/* ─── Header Info ───────────────────────────────────────────── */}
      <div className="absolute top-4 left-0 right-0 z-10 flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <Avatar
            src={group.author.avatarUrl}
            alt={group.author.displayName}
            size="sm"
            fallback={group.author.displayName?.charAt(0) ?? "?"}
            className="ring-2 ring-white/50"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-white drop-shadow-sm">
                {group.author.displayName}
              </span>
              {group.author.age && (
                <span className="text-xs text-white/80">{group.author.age}</span>
              )}
            </div>
            <span className="text-xs text-white/60">
              {timeAgo(story.createdAt)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Menu (own stories) */}
          {isOwnStory && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu((prev) => !prev);
              }}
              className="rounded-full bg-white/20 p-2 backdrop-blur-sm transition-colors hover:bg-white/30"
              aria-label="Story options"
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01" />
              </svg>
            </button>
          )}

          {/* Close */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="rounded-full bg-white/20 p-2 backdrop-blur-sm transition-colors hover:bg-white/30"
            aria-label="Close story"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ─── Media Area ────────────────────────────────────────────── */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Loading indicator */}
        {!mediaLoaded && !mediaError && (
          <div className="flex items-center justify-center">
            <svg className="w-10 h-10 animate-spin text-white/50" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        )}

        {/* Error state */}
        {mediaError && (
          <div className="flex flex-col items-center gap-2 text-white/70">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-sm">Failed to load media</p>
          </div>
        )}

        {/* Image */}
        {!isVideo && (
          <img
            src={imageUrl}
            alt="Story"
            className={`max-w-full max-h-full object-contain transition-opacity duration-300 ${
              mediaLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setMediaLoaded(true)}
            onError={() => {
              setMediaError(true);
              setMediaLoaded(true);
            }}
            draggable={false}
          />
        )}

        {/* Video */}
        {isVideo && (
          <video
            ref={videoRef}
            src={imageUrl}
            className="max-w-full max-h-full"
            muted={muted}
            playsInline
            loop={false}
            onLoadedData={() => setMediaLoaded(true)}
            onError={() => {
              setMediaError(true);
              setMediaLoaded(true);
            }}
          />
        )}

        {/* Caption overlay */}
        {story.caption && (
          <div className="absolute bottom-24 left-0 right-0 px-6 text-center">
            <p className="text-sm text-white drop-shadow-lg bg-black/30 backdrop-blur-sm rounded-lg px-4 py-2 inline-block max-w-xs mx-auto">
              {story.caption}
            </p>
          </div>
        )}
      </div>

      {/* ─── Mute/Unmute Button (Video Only) ────────────────────────── */}
      {isVideo && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMuted((prev) => !prev);
          }}
          className="absolute bottom-20 right-4 z-10 rounded-full bg-white/20 p-2 backdrop-blur-sm transition-colors hover:bg-white/30"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          )}
        </button>
      )}

      {/* ─── Bottom Actions ─────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-safe pb-6">
        <div className="flex items-center justify-center gap-6">
          {/* Reaction button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowReactions((prev) => !prev);
            }}
            className="flex flex-col items-center gap-1"
            aria-label="React to story"
          >
            <div className="rounded-full bg-white/20 p-3 backdrop-blur-sm transition-colors hover:bg-white/30 active:scale-90">
              {story.myReaction ? (
                <span className="text-xl">{getReactionEmoji(story.myReaction)}</span>
              ) : (
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <span className="text-xs text-white/70">React</span>
          </button>

          {/* Reply button (foundation) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowReplyInput((prev) => !prev);
            }}
            className="flex flex-col items-center gap-1"
            aria-label="Reply to story"
          >
            <div className="rounded-full bg-white/20 p-3 backdrop-blur-sm transition-colors hover:bg-white/30 active:scale-90">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-xs text-white/70">Reply</span>
          </button>

          {/* Share button */}
          {!isOwnStory && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Share via deep-link utility
                try {
                  const { shareDeepLink } = require("@/lib/utils/deep-link");
                  shareDeepLink("story", story.id);
                } catch {}
              }}
              className="flex flex-col items-center gap-1"
              aria-label="Share story"
            >
              <div className="rounded-full bg-white/20 p-3 backdrop-blur-sm transition-colors hover:bg-white/30 active:scale-90">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </div>
              <span className="text-xs text-white/70">Share</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Reaction Picker ─────────────────────────────────────────── */}
      {showReactions && (
        <div
          className="absolute inset-0 z-20 flex items-end justify-center pb-32"
          onClick={(e) => {
            e.stopPropagation();
            setShowReactions(false);
          }}
        >
          <div
            className="flex gap-4 p-4 bg-white/10 backdrop-blur-xl rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {STORY_REACTION_TYPES.map((reaction) => (
              <button
                key={reaction}
                onClick={(e) => {
                  e.stopPropagation();
                  if (story.myReaction === reaction) {
                    onRemoveReaction();
                  } else {
                    handleReaction(reaction);
                  }
                }}
                className={`text-3xl transition-all hover:scale-125 active:scale-90 ${
                  story.myReaction === reaction
                    ? "scale-125 drop-shadow-lg"
                    : "hover:drop-shadow-md"
                }`}
                aria-label={`React with ${reaction}`}
              >
                {getReactionEmoji(reaction)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Context Menu (Own Stories) ─────────────────────────────── */}
      {showMenu && (
        <div
          className="absolute inset-0 z-20 flex items-end justify-center pb-32"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(false);
          }}
        >
          <div
            className="w-64 p-4 bg-[var(--tg-theme-bg-color,#ffffff)] dark:bg-gray-800 rounded-2xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                setShowDeleteConfirm(true);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-500 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Story
            </button>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation ────────────────────────────────────── */}
      {showDeleteConfirm && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/60"
          onClick={(e) => {
            e.stopPropagation();
            setShowDeleteConfirm(false);
          }}
        >
          <div
            className="mx-6 w-full max-w-xs rounded-2xl bg-[var(--tg-theme-bg-color,#ffffff)] dark:bg-gray-800 p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
              Delete story?
            </h3>
            <p className="mt-2 text-sm text-[var(--tg-theme-hint-color,#999999)]">
              This will remove your story. Your story will no longer be visible to others.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] py-2.5 text-sm font-medium text-[var(--tg-theme-text-color,#000000)]"
              >
                Cancel
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Reply Input (Foundation) ───────────────────────────────── */}
      {showReplyInput && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 bg-[var(--tg-theme-bg-color,#ffffff)] dark:bg-gray-800 p-4 rounded-t-2xl shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Send a message..."
                className="w-full rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-4 py-2.5 text-sm text-[var(--tg-theme-text-color,#000000)] outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50"
                autoFocus
              />
            </div>
            <button className="rounded-xl bg-[var(--tg-theme-button-color,#0088cc)] p-2.5 text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--tg-theme-hint-color,#999999)] text-center">
            Reply will be sent as a message
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Emoji Helper ───────────────────────────────────────────────────────

function getReactionEmoji(reaction: StoryReactionType): string {
  const emojis: Record<StoryReactionType, string> = {
    like: "👍",
    love: "❤️",
    haha: "😂",
    wow: "😮",
    sad: "😢",
  };
  return emojis[reaction] ?? "👍";
}
