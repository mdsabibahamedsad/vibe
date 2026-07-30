/**
 * OptimizedVideo — Short-video component optimized for mobile Telegram Mini App.
 *
 * Features:
 *   - Poster-first loading (thumbnail before video)
 *   - Lazy video loading via IntersectionObserver
 *   - Muted autoplay when in viewport
 *   - Pauses when leaving viewport
 *   - Small footprint (no full resolution until playback)
 *
 * Usage:
 *   <OptimizedVideo
 *     mediaId="uuid"
 *     posterMediaId="uuid"  // thumbnail/poster media id
 *     className="rounded-lg"
 *   />
 */

"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface OptimizedVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  mediaId: string;
  posterMediaId?: string;
  posterUrl?: string;
  priority?: boolean;
}

const POSTER_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%23e2e8f0'/%3E%3C/svg%3E";

export function OptimizedVideo({
  mediaId,
  posterMediaId,
  posterUrl,
  priority = false,
  className = "",
  controls = true,
  muted: initialMuted,
  autoPlay: initialAutoPlay,
  preload = "metadata",
  ...videoProps
}: OptimizedVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(priority);
  const [videoSrc, setVideoSrc] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Resolve poster URL
  const resolvedPoster = posterUrl
    ? posterUrl
    : posterMediaId
      ? `/api/media/${posterMediaId}?derivative=poster`
      : POSTER_PLACEHOLDER;

  // Intersection Observer for visibility tracking
  useEffect(() => {
    if (priority) {
      setIsVisible(true);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsVisible(entry.isIntersecting);
        });
      },
      {
        rootMargin: "200px 0px",
        threshold: 0.1,
      },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [priority]);

  // Load video source when visible
  useEffect(() => {
    if (!isVisible || videoSrc) return;

    const srcUrl = `/api/media/${mediaId}?derivative=mobile`;
    setVideoSrc(srcUrl);
  }, [isVisible, mediaId, videoSrc]);

  // Autoplay when in viewport
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isLoaded || !isVisible) return;

    if (isVisible && !isPlaying) {
      video.play().catch(() => {
        // Autoplay may be blocked — that's OK
      });
    } else if (!isVisible && isPlaying) {
      video.pause();
    }
  }, [isVisible, isLoaded, isPlaying]);

  const handleLoaded = useCallback(() => {
    setIsLoaded(true);
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => setIsPlaying(false), []);

  const showVideo = isVisible && videoSrc && !hasError;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-muted ${className}`}
      style={{ aspectRatio: "16/9" }}
    >
      {/* Poster image (always visible until video plays) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolvedPoster}
        alt=""
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isPlaying ? "opacity-0" : "opacity-100"}`}
        aria-hidden="true"
      />

      {/* Play button overlay (before autoplay) */}
      {showVideo && !isPlaying && (
        <button
          onClick={() => videoRef.current?.play()}
          className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30 z-10"
          aria-label="Play video"
        >
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-foreground ml-0.5"
            >
              <polygon points="8,5 19,12 8,19" />
            </svg>
          </div>
        </button>
      )}

      {/* Video element */}
      {showVideo && (
        <video
          ref={videoRef}
          src={videoSrc}
          muted
          playsInline
          loop
          preload="metadata"
          onLoadedData={handleLoaded}
          onError={handleError}
          onPlay={handlePlay}
          onPause={handlePause}
          className="absolute inset-0 w-full h-full object-cover"
          controls={controls}
          {...videoProps}
        />
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50" role="alert">
          <div className="text-center text-muted-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mx-auto mb-1 opacity-50"
            >
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            <p className="text-xs">Video unavailable</p>
          </div>
        </div>
      )}
    </div>
  );
}
