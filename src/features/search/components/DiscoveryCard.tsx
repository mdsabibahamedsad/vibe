/**
 * DiscoveryCard — Reusable profile card for search + discovery results.
 *
 * Used by both social discovery (search/find people) and dating discovery (swipe).
 * Shows:
 *   - Avatar
 *   - Display name
 *   - Username / age / city / distance
 *   - Bio preview
 *   - Shared interests
 *   - Follow/like action buttons
 *
 * Usage:
 *   <DiscoveryCard
 *     profile={searchResult}
 *     mode="social"
 *     onFollow={(id) => ...}
 *   />
 */

"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import type { SearchProfileResult, DiscoveryCandidate } from "@/lib/discovery/schemas";

type ProfileItem = SearchProfileResult | DiscoveryCandidate;

interface DiscoveryCardProps {
  profile: ProfileItem;
  mode: "social" | "dating";
  onFollow?: (userId: string) => void;
  onLike?: (userId: string) => void;
  onPass?: (userId: string) => void;
  onViewProfile?: (userId: string) => void;
}

export function DiscoveryCard({
  profile,
  mode,
  onFollow,
  onLike,
  onPass,
  onViewProfile,
}: DiscoveryCardProps) {
  const [imageError, setImageError] = useState(false);

  const avatarUrl = "avatarUrl" in profile
    ? profile.avatarUrl
    : profile.photos?.[0]?.mediaId ?? null;

  const displayBio =
    "bio" in profile && profile.bio
      ? profile.bio.length > 100
        ? profile.bio.slice(0, 100) + "..."
        : profile.bio
      : null;

  const sharedInterests =
    "compatibility" in profile
      ? profile.compatibility?.sharedInterests ?? 0
      : "sharedInterests" in profile
        ? profile.sharedInterests ?? 0
        : 0;

  const ageDisplay =
    "age" in profile ? profile.age ?? null : null;

  const handleClick = () => {
    onViewProfile?.(profile.id);
  };

  return (
    <div
      className="bg-card rounded-xl border border-border overflow-hidden transition-all hover:shadow-md active:scale-[0.98] cursor-pointer"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Avatar */}
        <div className="flex-shrink-0">
          <Avatar
            src={avatarUrl && !imageError ? `/api/media/${avatarUrl}?derivative=thumbnail` : undefined}
            alt={profile.displayName}
            size="lg"
            fallback={profile.displayName.charAt(0).toUpperCase()}
            onError={() => setImageError(true)}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Name + Age + Distance */}
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm truncate">
              {profile.displayName}
              {profile.isVerified && (
                <span className="ml-1 text-primary" aria-label="Verified">
                  ✓
                </span>
              )}
            </h3>
            {ageDisplay && (
              <span className="text-sm text-muted-foreground">{ageDisplay}</span>
            )}
            {"username" in profile && profile.username && (
              <span className="text-xs text-muted-foreground/60">@{profile.username}</span>
            )}
          </div>

          {/* Location / Distance */}
          {"city" in profile && profile.city && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              📍 {profile.city}
              {"distanceKm" in profile && profile.distanceKm != null && (
                <span> · {Math.round(profile.distanceKm)} km away</span>
              )}
            </p>
          )}

          {/* Distance only (when no city) */}
          {(!profile.city || !("city" in profile)) && "distanceKm" in profile && profile.distanceKm != null && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              📍 {Math.round(profile.distanceKm)} km away
            </p>
          )}

          {/* Bio */}
          {displayBio && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
              {displayBio}
            </p>
          )}

          {/* Shared interests */}
          {sharedInterests > 0 && (
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-xs text-primary">
                {sharedInterests} shared interest{sharedInterests !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* Interests chips (for dating mode) */}
          {"interests" in profile && profile.interests && profile.interests.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {profile.interests.slice(0, 3).map((interest) => (
                <span
                  key={interest.id}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                >
                  {interest.name}
                </span>
              ))}
              {profile.interests.length > 3 && (
                <span className="text-[10px] px-2 py-0.5 text-muted-foreground/60">
                  +{profile.interests.length - 3} more
                </span>
              )}
            </div>
          )}

          {/* Dating intent */}
          {"intent" in profile && profile.intent && (
            <p className="text-[11px] text-muted-foreground/60 mt-1">
              Looking for: {profile.intent}
            </p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-3 pt-0 flex gap-2">
        {mode === "social" ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFollow?.(profile.id);
            }}
            className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Follow
          </button>
        ) : (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPass?.(profile.id);
              }}
              className="flex-1 h-9 rounded-lg border border-border text-muted-foreground text-sm hover:bg-muted transition-colors"
              aria-label="Pass"
            >
              ✕ Pass
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLike?.(profile.id);
              }}
              className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              aria-label="Like"
            >
              ❤️ Like
            </button>
          </>
        )}
      </div>
    </div>
  );
}
