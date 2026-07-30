/**
 * OptimizedImage — Responsive image component that uses the media service.
 *
 * Automatically selects the best derivative size based on the display context.
 * Supports lazy loading, aspect-ratio preservation, and fallback placeholders.
 *
 * Usage:
 *   <OptimizedImage
 *     mediaId="uuid"
 *     alt="Description"
 *     derivative="medium"
 *     className="w-full rounded-lg"
 *   />
 *
 * Props:
 *   mediaId   — UUID of the media record
 *   alt       — Alt text (required for accessibility)
 *   derivative— Which derivative to use (thumbnail, small, medium, large)
 *   fill      — Whether to fill the parent container (like next/image)
 *   width     — Explicit width
 *   height    — Explicit height
 *   priority  — Skip lazy loading (for above-the-fold images)
 *   className — Extra CSS classes
 *   fallback  — Fallback src if media fails to load
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { DERIVATIVE_TYPES } from "@/lib/media/constants";
import type { DerivativeType } from "@/lib/media/constants";

interface OptimizedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> {
  mediaId: string;
  derivative?: DerivativeType;
  fill?: boolean;
  width?: number;
  height?: number;
  priority?: boolean;
  fallback?: string;
}

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23e2e8f0'/%3E%3C/svg%3E";

export function OptimizedImage({
  mediaId,
  alt = "",
  derivative = DERIVATIVE_TYPES.MEDIUM,
  fill = false,
  width,
  height,
  priority = false,
  fallback,
  className = "",
  style,
  ...imgProps
}: OptimizedImageProps) {
  const [src, setSrc] = useState<string>(PLACEHOLDER);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const loadedRef = useRef(false);

  // Build the media URL
  useEffect(() => {
    if (loadedRef.current) return;

    const loadUrl = `/api/media/${mediaId}?derivative=${derivative}`;
    setSrc(loadUrl);
  }, [mediaId, derivative]);

  const handleLoad = useCallback(() => {
    setLoading(false);
    setError(false);
    loadedRef.current = true;
  }, []);

  const handleError = useCallback(() => {
    setLoading(false);
    setError(true);
    if (fallback) {
      setSrc(fallback);
    }
  }, [fallback]);

  const imgStyle: React.CSSProperties = {
    ...(fill ? { objectFit: "cover", width: "100%", height: "100%" } : {}),
    ...(loading ? { opacity: 0.5 } : { opacity: 1 }),
    transition: "opacity 0.2s ease-in-out",
    ...style,
  };

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        ...(fill ? { position: "relative", width: "100%", height: "100%" } : {}),
        ...(width && !fill ? { width, minWidth: width } : {}),
        ...(height && !fill ? { height, minHeight: height } : {}),
        aspectRatio: !fill && width && height ? `${width}/${height}` : undefined,
      }}
    >
      {/* Loading skeleton */}
      {loading && (
        <div
          className="absolute inset-0 animate-pulse bg-muted rounded-inherit"
          aria-hidden="true"
        />
      )}

      {/* Error state */}
      {error && !fallback && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-muted/50 text-muted-foreground text-sm"
          role="img"
          aria-label="Image failed to load"
        >
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
            className="opacity-50"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
      )}

      {/* Actual image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        width={!fill ? width : undefined}
        height={!fill ? height : undefined}
        loading={priority ? "eager" : "lazy"}
        onLoad={handleLoad}
        onError={handleError}
        style={imgStyle}
        className={`${fill ? "absolute inset-0 w-full h-full object-cover" : ""} ${error && !fallback ? "hidden" : ""}`}
        {...imgProps}
      />
    </div>
  );
}
