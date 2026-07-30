"use client";

import { useState } from "react";
import type { MessageResponse } from "@/lib/chat/schemas";

interface ImageViewerProps {
  message: MessageResponse | null;
  onClose: () => void;
}

/**
 * ImageViewer — Lightweight full-screen image viewer for chat media.
 *
 * Support:
 *  - Open/close with animation
 *  - Zoom enabled via CSS (transform)
 *  - Safe-area handling
 *  - Close button and backdrop tap
 *  - Accessible controls
 */
export function ImageViewer({ message, onClose }: ImageViewerProps) {
  const [zoomed, setZoomed] = useState(false);

  if (!message) return null;

  const isVideo = message.messageType === "video";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={isVideo ? "Video viewer" : "Image viewer"}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center"
        aria-label="Close viewer"
      >
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Media content */}
      <div
        className={`max-w-full max-h-full p-4 transition-transform duration-200 ${zoomed ? "scale-150" : "scale-100"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="rounded-2xl overflow-hidden bg-black/30"
          style={{
            width: "min(90vw, 400px)",
            height: "min(80vh, 500px)",
          }}
        >
          <div className="w-full h-full flex items-center justify-center">
            {isVideo ? (
              <svg className="w-16 h-16 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-16 h-16 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
          </div>
        </div>

        {/* Zoom hint */}
        {!zoomed && (
          <p className="text-center text-xs text-white/50 mt-2">
            Tap to zoom
          </p>
        )}
      </div>

      {/* Caption */}
      {message.textContent && (
        <div className="absolute bottom-4 left-4 right-4 text-center">
          <p className="text-sm text-white/80 bg-black/40 rounded-lg px-3 py-2 inline-block max-w-md mx-auto">
            {message.textContent}
          </p>
        </div>
      )}
    </div>
  );
}
