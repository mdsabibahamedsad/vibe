"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { MediaItem } from "@/features/feed/services/post.service";

interface PostMediaProps {
  media: MediaItem[];
  postType: string;
}

export function PostMedia({ media, postType }: PostMediaProps) {
  if (!media || media.length === 0) return null;

  if (postType === "video") {
    const videoMedia = media[0];
    return <VideoPlayer media={videoMedia} />;
  }

  if (media.length === 1) {
    return <SingleImage media={media[0]} />;
  }

  return <ImageGallery images={media} />;
}

// ─── Single Image ─────────────────────────────────────────────────────────

function SingleImage({ media }: { media: MediaItem }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Use a data URL or placeholder — in production, resolve CDN URL from media
  const imageUrl = media.thumbnailUrl || `/api/media/${media.mediaId}`;

  return (
    <div className="relative w-full overflow-hidden bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
      {!loaded && !error && (
        <div className="aspect-[4/3] animate-pulse bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)]" />
      )}
      {error ? (
        <div className="aspect-[4/3] flex items-center justify-center text-[var(--tg-theme-hint-color,#999999)] text-sm">
          Failed to load image
        </div>
      ) : (
        <img
          src={imageUrl}
          alt="Post image"
          className={`w-full object-cover transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0 absolute"
          }`}
          style={{ maxHeight: "70vh" }}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          loading="lazy"
        />
      )}
    </div>
  );
}

// ─── Image Gallery ────────────────────────────────────────────────────────

function ImageGallery({ images }: { images: MediaItem[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const handleSwipe = useCallback(() => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && activeIndex < images.length - 1) {
        setActiveIndex((prev) => prev + 1);
      } else if (diff < 0 && activeIndex > 0) {
        setActiveIndex((prev) => prev - 1);
      }
    }
  }, [activeIndex, images.length]);

  return (
    <div className="relative overflow-hidden bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
      <div
        className="flex transition-transform duration-200"
        style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          touchEndX.current = e.changedTouches[0].clientX;
          handleSwipe();
        }}
      >
        {images.map((img, index) => (
          <div key={index} className="w-full flex-shrink-0">
            <img
              src={img.thumbnailUrl || `/api/media/${img.mediaId}`}
              alt={`Post image ${index + 1}`}
              className="w-full object-cover"
              style={{ maxHeight: "70vh" }}
              loading="lazy"
            />
          </div>
        ))}
      </div>

      {/* Position indicator */}
      {images.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((_, index) => (
            <div
              key={index}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                index === activeIndex ? "bg-white w-4" : "bg-white/60"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Video Player ─────────────────────────────────────────────────────────

function VideoPlayer({ media }: { media: MediaItem }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting && playing) {
            videoRef.current?.pause();
            setPlaying(false);
          }
        });
      },
      { threshold: 0.5 },
    );

    observerRef.current.observe(videoRef.current);

    return () => observerRef.current?.disconnect();
  }, [playing]);

  const togglePlay = () => {
    if (!videoRef.current) return;

    if (playing) {
      videoRef.current.pause();
    } else {
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {});
    }
    setPlaying(!playing);
  };

  return (
    <div className="relative overflow-hidden bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
      <video
        ref={videoRef}
        src={media.thumbnailUrl || `/api/media/${media.mediaId}`}
        poster={media.thumbnailUrl || undefined}
        className="w-full object-cover"
        style={{ maxHeight: "70vh" }}
        muted
        playsInline
        loop
        onClick={togglePlay}
      />

      {/* Play/Pause overlay */}
      <button
        onClick={togglePlay}
        className="absolute inset-0 flex items-center justify-center"
        aria-label={playing ? "Pause" : "Play"}
      >
        {!playing && (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <svg className="h-6 w-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}
      </button>

      {/* Duration badge */}
      {media.durationSeconds && (
        <div className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
          {formatDuration(media.durationSeconds)}
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
