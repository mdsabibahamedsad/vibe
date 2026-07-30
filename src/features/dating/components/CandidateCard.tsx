"use client";

import { useCallback, useRef, useState } from "react";
import { Avatar, Button } from "@/components/ui";
import type { DiscoveryCandidate } from "@/lib/discovery/schemas";
import { timeAgo } from "@/lib/utils";

interface CandidateCardProps {
  candidate: DiscoveryCandidate;
  onLike: () => void;
  onPass: () => void;
  onSuperLike: () => void;
  actionLoading: boolean;
}

/**
 * CandidateCard — Mobile-first dating profile card.
 *
 * Features:
 *  - Photo carousel with dots indicator
 *  - Name, age, city, distance
 *  - Bio
 *  - Interests as tags
 *  - Dating intent
 *  - Compatibility info
 *  - Like/Pass/Super Like action buttons
 */
export function CandidateCard({
  candidate,
  onLike,
  onPass,
  onSuperLike,
  actionLoading,
}: CandidateCardProps) {
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const photos = candidate.photos;
  const hasMultiplePhotos = photos.length > 1;
  const photoUrl = photos[activePhotoIndex]?.mediaId
    ? `/api/media/${photos[activePhotoIndex].mediaId}`
    : null;

  // ─── Touch/Swipe handling ─────────────────────────────────────────

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    },
    [],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const diffX = e.touches[0].clientX - touchStartX.current;
      const diffY = e.touches[0].clientY - touchStartY.current;

      // Only track horizontal swipes
      if (Math.abs(diffX) > Math.abs(diffY)) {
        setSwiping(true);
        setSwipeOffset(diffX);
      }
    },
    [],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const diffX = e.changedTouches[0].clientX - touchStartX.current;
      const threshold = window.innerWidth * 0.25;

      if (swiping) {
        if (diffX > threshold) {
          // Swipe right → like
          onLike();
        } else if (diffX < -threshold) {
          // Swipe left → pass
          onPass();
        }
      }

      setSwiping(false);
      setSwipeOffset(0);
    },
    [swiping, onLike, onPass],
  );

  // ─── Photo navigation ─────────────────────────────────────────────

  const handlePhotoTap = useCallback(
    (e: React.MouseEvent) => {
      if (!hasMultiplePhotos) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;

      if (x < rect.width * 0.33 && activePhotoIndex > 0) {
        setActivePhotoIndex((prev) => prev - 1);
      } else if (x > rect.width * 0.66 && activePhotoIndex < photos.length - 1) {
        setActivePhotoIndex((prev) => prev + 1);
      }
    },
    [hasMultiplePhotos, activePhotoIndex, photos.length],
  );

  // ─── Intent display label ─────────────────────────────────────────

  const intentLabels: Record<string, string> = {
    dating: "Looking to date",
    friendship: "Open to friendship",
    chat: "Here to chat",
    relationship: "Looking for a relationship",
    not_sure: "Still figuring it out",
  };

  return (
    <div
      className="relative w-full max-w-sm mx-auto select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Swipe indicator */}
      {swiping && (
        <div
          className={`absolute inset-0 z-20 rounded-2xl border-4 pointer-events-none transition-opacity ${
            swipeOffset > 0
              ? "border-green-500 bg-green-500/10"
              : "border-red-500 bg-red-500/10"
          }`}
        >
          <div
            className={`absolute top-8 text-2xl font-bold px-4 py-2 rounded-lg ${
              swipeOffset > 0
                ? "right-4 text-green-500 bg-white/90"
                : "left-4 text-red-500 bg-white/90"
            }`}
          >
            {swipeOffset > 0 ? "LIKE" : "PASS"}
          </div>
        </div>
      )}

      {/* Card */}
      <div
        className={`rounded-2xl overflow-hidden bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] shadow-lg transition-transform duration-200 ${
          swiping ? "scale-95" : ""
        }`}
        style={{
          transform: swiping ? `translateX(${swipeOffset * 0.5}px)` : undefined,
        }}
      >
        {/* ─── Photo Area ─────────────────────────────────────────── */}
        <div
          className="relative aspect-[3/4] bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] overflow-hidden"
          onClick={handlePhotoTap}
        >
          {photoUrl && !imgError ? (
            <img
              src={photoUrl}
              alt={`${candidate.displayName}'s photo`}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Avatar
                src={null}
                alt={candidate.displayName}
                size="xl"
                fallback={candidate.displayName.charAt(0)}
              />
            </div>
          )}

          {/* Photo dots indicator */}
          {hasMultiplePhotos && (
            <div className="absolute top-2 left-2 right-2 flex gap-1">
              {photos.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-0.5 flex-1 rounded-full transition-colors ${
                    idx === activePhotoIndex ? "bg-white" : "bg-white/40"
                  }`}
                />
              ))}
            </div>
          )}

          {/* Tap hint */}
          {hasMultiplePhotos && (
            <div className="absolute bottom-2 left-0 right-0 flex justify-center">
              <div className="flex gap-1.5">
                {photos.map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      idx === activePhotoIndex ? "bg-white w-3" : "bg-white/50"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Verification badge */}
          {candidate.isVerified && (
            <div className="absolute top-3 right-3 bg-blue-500 rounded-full p-1 shadow">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          )}
        </div>

        {/* ─── Info Area ──────────────────────────────────────────── */}
        <div className="p-4 space-y-3">
          {/* Name, Age, Location */}
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[var(--tg-theme-text-color,#000000)] truncate">
                  {candidate.displayName}
                </h2>
                <span className="text-lg text-[var(--tg-theme-text-color,#000000)]">
                  {candidate.age}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                {candidate.city && (
                  <span className="text-sm text-[var(--tg-theme-hint-color,#999999)]">
                    📍 {candidate.city}
                  </span>
                )}
                {candidate.distanceKm !== null && (
                  <span className="text-sm text-[var(--tg-theme-hint-color,#999999)]">
                    {candidate.city ? " · " : ""}
                    {candidate.distanceKm < 1
                      ? "Less than 1 km away"
                      : `${Math.round(candidate.distanceKm)} km away`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Intent */}
          <div className="inline-block rounded-full bg-[var(--tg-theme-button-color,#0088cc)]/10 px-3 py-1">
            <span className="text-xs font-medium text-[var(--tg-theme-button-color,#0088cc)]">
              {(candidate.intent ? intentLabels[candidate.intent] : null) ?? candidate.intent ?? ""}
            </span>
          </div>

          {/* Compatibility info */}
          {(candidate.compatibility.sharedInterests > 0 || candidate.compatibility.intentMatch) && (
            <div className="flex flex-wrap gap-2">
              {candidate.compatibility.intentMatch && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2.5 py-0.5 text-xs text-green-700 dark:text-green-300">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Looking for the same thing
                </span>
              )}
              {candidate.compatibility.sharedInterests > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 dark:bg-purple-900/30 px-2.5 py-0.5 text-xs text-purple-700 dark:text-purple-300">
                  🎯 {candidate.compatibility.sharedInterests} shared interest
                  {candidate.compatibility.sharedInterests !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}

          {/* Bio */}
          {candidate.bio && (
            <p className="text-sm text-[var(--tg-theme-text-color,#000000)] leading-relaxed line-clamp-3">
              {candidate.bio}
            </p>
          )}

          {/* Interests */}
          {candidate.interests.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {candidate.interests.slice(0, 8).map((interest) => (
                <span
                  key={interest.id}
                  className="rounded-full bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-2.5 py-1 text-xs text-[var(--tg-theme-text-color,#000000)]"
                >
                  {interest.name}
                </span>
              ))}
              {candidate.interests.length > 8 && (
                <span className="rounded-full bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-2.5 py-1 text-xs text-[var(--tg-theme-hint-color,#999999)]">
                  +{candidate.interests.length - 8} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Action Buttons ────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-4 mt-4 pb-4">
        {/* Pass */}
        <button
          onClick={onPass}
          disabled={actionLoading}
          className="flex items-center justify-center w-14 h-14 rounded-full bg-white shadow-lg border-2 border-gray-200 text-red-500 hover:bg-red-50 active:scale-90 transition-all disabled:opacity-50"
          aria-label="Pass"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Super Like */}
        <button
          onClick={onSuperLike}
          disabled={actionLoading}
          className="flex items-center justify-center w-12 h-12 rounded-full bg-white shadow-lg border-2 border-blue-200 text-blue-500 hover:bg-blue-50 active:scale-90 transition-all disabled:opacity-50"
          aria-label="Super Like"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>

        {/* Like */}
        <button
          onClick={onLike}
          disabled={actionLoading}
          className="flex items-center justify-center w-14 h-14 rounded-full bg-white shadow-lg border-2 border-green-200 text-green-500 hover:bg-green-50 active:scale-90 transition-all disabled:opacity-50"
          aria-label="Like"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
      </div>

      {/* Loading overlay */}
      {actionLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10 rounded-2xl">
          <svg className="w-8 h-8 animate-spin text-[var(--tg-theme-button-color,#0088cc)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      )}
    </div>
  );
}
