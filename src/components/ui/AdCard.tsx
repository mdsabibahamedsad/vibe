"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { OptimizedImage } from "@/components/media/OptimizedImage";
import { OptimizedVideo } from "@/components/media/OptimizedVideo";

/**
 * Simple UUID v4 generator (inline, no dependency needed).
 */
function generateId(): string {
  const hex = "0123456789abcdef";
  let id = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      id += "-";
    } else if (i === 14) {
      id += "4";
    } else if (i === 19) {
      id += hex[(Math.random() * 4) | 8];
    } else {
      id += hex[(Math.random() * 16) | 0];
    }
  }
  return id;
}

export interface AdCardProps {
  ad: {
    requestId: string;
    campaignId: string;
    creativeId: string;
    creativeType: string;
    headline: string;
    body: string | null;
    mediaId: string | null;
    thumbnailMediaId: string | null;
    destinationType: string;
    destinationUrl: string | null;
    destinationPage: string | null;
    cta: string;
    sponsoredLabel: string;
    isHouseCampaign: boolean;
    impressionEventId: string;
  };
  onError?: (error: string) => void;
}

/**
 * AdCard — Reusable ad component for displaying sponsored content.
 *
 * Handles impression tracking (viewability detection via IntersectionObserver)
 * and click tracking with idempotent event IDs.
 */
export function AdCard({ ad, onError }: AdCardProps) {
  const [impressionSent, setImpressionSent] = useState(false);
  const [clickSent, setClickSent] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const impressionEventId = useRef(ad.impressionEventId);
  const clickEventId = useRef(generateId());

  // Track impression when ad enters viewport
  useEffect(() => {
    if (impressionSent || !cardRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !impressionSent) {
            sendImpression();
            observer.disconnect();
          }
        }
      },
      { threshold: 0.5 }, // 50% visibility threshold
    );

    observer.observe(cardRef.current);

    return () => observer.disconnect();
  }, [impressionSent]);

  const sendImpression = useCallback(async () => {
    if (impressionSent) return;
    setImpressionSent(true);

    try {
      await fetch("/api/ad/impression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: ad.campaignId,
          creativeId: ad.creativeId,
          placement: "feed_inline",
          requestId: ad.requestId,
          eventId: impressionEventId.current,
          viewabilityPct: 100,
        }),
      });
    } catch {
      // Impression tracking failure is non-critical
    }
  }, [ad, impressionSent]);

  // Handle click/tap on CTA
  const handleClick = useCallback(async () => {
    if (clickSent || navigating) return;
    setClickSent(true);
    setNavigating(true);

    try {
      // Record click and get destination
      const res = await fetch("/api/ad/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: ad.campaignId,
          creativeId: ad.creativeId,
          placement: "feed_inline",
          requestId: ad.requestId,
          eventId: clickEventId.current,
          impressionEventId: impressionEventId.current,
        }),
      });

      const data = await res.json();

      if (data.success && data.destination) {
        // Navigate to safe destination based on type
        const dest = data.destination;

        switch (dest.type) {
          case "external_url":
            if (dest.url) {
              window.open(dest.url, "_blank", "noopener,noreferrer");
            }
            break;
          case "internal_page":
            if (dest.page) {
              window.location.href = dest.page;
            }
            break;
          case "internal_profile":
            if (dest.profileId) {
              window.location.href = `/profile/${dest.profileId}`;
            }
            break;
          default:
            setNavigating(false);
        }
      } else {
        setNavigating(false);
      }
    } catch {
      setNavigating(false);
      onError?.("Failed to process ad click");
    }
  }, [ad, clickSent, navigating, onError]);

  return (
    <div
      ref={cardRef}
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      {/* Sponsored label */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {ad.sponsoredLabel}
        </span>
        {ad.isHouseCampaign && (
          <span className="text-[10px] text-blue-500 font-medium">Vibe</span>
        )}
      </div>

      {/* Media */}
      {ad.mediaId && (
        <div className="px-4">
          {ad.creativeType === "video" ? (
            <OptimizedVideo
              mediaId={ad.mediaId}
              className="w-full aspect-video rounded-lg object-cover"
              posterMediaId={ad.thumbnailMediaId ?? undefined}
            />
          ) : (
            <OptimizedImage
              mediaId={ad.mediaId}
              alt={ad.headline}
              className="w-full aspect-video rounded-lg object-cover"
            />
          )}
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        <h3 className="text-sm font-semibold text-[var(--tg-theme-text-color,#000000)] leading-tight">
          {ad.headline}
        </h3>
        {ad.body && (
          <p className="mt-1 text-xs text-[var(--tg-theme-hint-color,#999999)] line-clamp-2">
            {ad.body}
          </p>
        )}

        {/* CTA Button */}
        <button
          onClick={handleClick}
          disabled={navigating}
          className="mt-3 w-full rounded-lg bg-[var(--tg-theme-button-color,#0088cc)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {navigating ? "Opening..." : ad.cta}
        </button>
      </div>
    </div>
  );
}
