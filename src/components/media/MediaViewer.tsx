/**
 * MediaViewer — Full-screen media viewer for images and videos.
 *
 * Features:
 *   - Full-screen overlay
 *   - Image pinch-zoom (via CSS transform)
 *   - Video playback with audio
 *   - Tap to close / Escape key
 *   - Safe-area aware
 *   - Respects reduced motion
 *
 * Usage:
 *   <MediaViewer
 *     mediaId="uuid"
 *     mediaType="image"
 *     onClose={() => setViewerOpen(false)}
 *   />
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface MediaViewerProps {
  mediaId: string;
  mediaType: "image" | "video";
  onClose: () => void;
}

export function MediaViewer({ mediaId, mediaType, onClose }: MediaViewerProps) {
  const [zoomed, setZoomed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Close on overlay click (not on content)
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose],
  );

  // Respect reduced motion
  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      style={{
        animation: prefersReducedMotion ? "none" : "fadeIn 0.2s ease-out",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
        aria-label="Close viewer"
        style={{ top: "calc(env(safe-area-inset-top) + 16px)" }}
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
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Loading state */}
      {!loaded && (
        <div className="text-white/60 text-sm animate-pulse" role="status">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-2" />
          Loading...
        </div>
      )}

      {/* Image viewer */}
      {mediaType === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/media/${mediaId}?derivative=large`}
          alt=""
          className={`max-w-full max-h-full object-contain transition-transform duration-200 cursor-zoom-in ${
            loaded ? "opacity-100" : "opacity-0"
          } ${zoomed ? "scale-150 cursor-zoom-out" : ""}`}
          style={{
            maxWidth: "min(100vw, 100%)",
            maxHeight: "min(100vh, 100%)",
          }}
          onClick={() => setZoomed(!zoomed)}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      )}

      {/* Video viewer */}
      {mediaType === "video" && (
        <video
          src={`/api/media/${mediaId}?derivative=standard`}
          className={`max-w-full max-h-full ${loaded ? "opacity-100" : "opacity-0"}`}
          controls
          autoPlay
          playsInline
          style={{
            maxWidth: "min(100vw, 100%)",
            maxHeight: "min(100vh, 100%)",
          }}
          onLoadedData={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        >
          <track kind="captions" label="No captions" />
        </video>
      )}

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
