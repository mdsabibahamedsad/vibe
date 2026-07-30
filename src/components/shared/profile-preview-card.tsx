"use client";

import { Avatar } from "@/components/ui";

interface ProfilePreviewCardProps {
  displayName: string;
  age?: number | null;
  city?: string | null;
  country?: string | null;
  bio?: string | null;
  datingIntent?: string | null;
  interests?: { name: string; slug?: string }[];
  photoUrl?: string | null;
  photosCount?: number;
  isCompact?: boolean;
}

const INTENT_LABELS: Record<string, string> = {
  dating: "Dating",
  friendship: "Friendship",
  chat: "Chat",
  relationship: "Relationship",
  not_sure: "Not sure yet",
};

export function ProfilePreviewCard({
  displayName,
  age,
  city,
  country,
  bio,
  datingIntent,
  interests = [],
  photoUrl,
  photosCount = 0,
  isCompact = false,
}: ProfilePreviewCardProps) {
  const location = [city, country].filter(Boolean).join(", ");
  const intentLabel = datingIntent ? (INTENT_LABELS[datingIntent] ?? datingIntent) : null;

  return (
    <div className="surface-card overflow-hidden rounded-3xl">
      {/* Photo area */}
      <div className="aspect-[3/4] bg-surface-2 flex items-center justify-center relative">
        {photoUrl ? (
          <img src={photoUrl} alt={displayName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            {photosCount > 0 && (
              <span className="text-xs">
                {photosCount} photo{photosCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-5 space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-xl font-semibold text-fg tracking-tight">
            {displayName}
          </h3>
          {age && (
            <span className="text-xl text-muted">, {age}</span>
          )}
          {!isCompact && (
            <svg
              className="h-4 w-4 text-accent-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>

        {location && (
          <p className="flex items-center gap-1 text-sm text-muted">
            <svg className="h-3.5 w-3.5 text-accent-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            {location}
          </p>
        )}

        {!isCompact && interests.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {interests.slice(0, 5).map((interest) => (
              <span
                key={interest.slug ?? interest.name}
                className="rounded-full bg-surface-2 border border-divider px-2.5 py-1 text-xs font-medium text-fg"
              >
                {interest.name}
              </span>
            ))}
            {interests.length > 5 && (
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">
                +{interests.length - 5}
              </span>
            )}
          </div>
        )}

        {bio && !isCompact && (
          <p className="text-sm text-fg leading-relaxed pt-1">
            {bio}
          </p>
        )}

        {intentLabel && !isCompact && (
          <div className="flex items-center gap-1.5 pt-1 text-xs text-muted">
            <span>Looking for:</span>
            <span className="font-semibold text-gradient">
              {intentLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
