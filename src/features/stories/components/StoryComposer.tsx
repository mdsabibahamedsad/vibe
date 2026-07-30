"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui";
import { logger } from "@/lib/logger";
import { STORY_VISIBILITY_OPTIONS } from "@/lib/stories/constants";
import type { StoryVisibility } from "@/lib/stories/types";

interface StoryComposerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * StoryComposer — Create a new story with media.
 *
 * Steps:
 *  1. Select photo or video
 *  2. Preview with optional text caption
 *  3. Choose visibility (public / followers_only)
 *  4. Publish
 */
export function StoryComposer({ open, onClose, onSuccess }: StoryComposerProps) {
  const [step, setStep] = useState<"select" | "preview" | "publishing">("select");
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<StoryVisibility>("followers_only");
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Reset when opening
  const resetAndClose = useCallback(() => {
    setStep("select");
    setMediaType(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setCaption("");
    setVisibility("followers_only");
    setError(null);
    setUploadProgress(0);
    onClose();
  }, [onClose]);

  if (!open) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      setError("Please select a photo or video");
      return;
    }

    // Basic size validation
    const maxSize = isImage ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setError(`File too large. Maximum size: ${isImage ? "10MB" : "50MB"}`);
      return;
    }

    setMediaType(isImage ? "image" : "video");
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setStep("preview");
    setError(null);
  };

  const handleRemoveMedia = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setMediaType(null);
    setStep("select");
    setError(null);
  };

  const handlePublish = async () => {
    if (!selectedFile || !mediaType) return;

    setStep("publishing");
    setError(null);
    setUploadProgress(10);

    try {
      // Step 1: Upload media to get a media record
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("mediaType", mediaType);

      setUploadProgress(30);

      const uploadRes = await fetch("/api/stories/media", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to upload media");
      }

      const { media } = await uploadRes.json();

      setUploadProgress(60);

      // Step 2: Create the story
      const storyRes = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaId: media.id,
          caption: caption.trim() || undefined,
          visibility,
        }),
      });

      if (!storyRes.ok) {
        const errData = await storyRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create story");
      }

      setUploadProgress(100);

      // Success
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      onSuccess();
    } catch (err) {
      logger.error("Failed to publish story", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      setError(err instanceof Error ? err.message : "Failed to publish story");
      setStep("preview");
      setUploadProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 transition-opacity" onClick={resetAndClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-[var(--tg-theme-bg-color,#ffffff)] dark:bg-gray-800 p-6 shadow-xl animate-slide-up">
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-300" />

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
            {step === "select"
              ? "Add Story"
              : step === "preview"
              ? "Preview Story"
              : "Publishing..."}
          </h2>
          <button
            onClick={resetAndClose}
            className="rounded-full p-1 text-[var(--tg-theme-hint-color,#999999)] hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step: Select Media */}
        {step === "select" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4 py-8">
              {/* Media upload area */}
              <label className="flex flex-col items-center gap-3 cursor-pointer">
                <div className="w-24 h-24 rounded-full bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  <svg className="w-10 h-10 text-[var(--tg-theme-button-color,#0088cc)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-[var(--tg-theme-button-color,#0088cc)]">
                  Choose Photo or Video
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </label>

              <p className="text-xs text-[var(--tg-theme-hint-color,#999999)] text-center max-w-xs">
                Photos up to 10MB, videos up to 50MB (max 60 seconds)
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={resetAndClose}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && previewUrl && (
          <div className="space-y-4">
            {/* Media preview */}
            <div className="relative aspect-[9/16] max-h-80 rounded-xl overflow-hidden bg-black">
              {mediaType === "image" ? (
                <img
                  src={previewUrl}
                  alt="Story preview"
                  className="w-full h-full object-contain"
                />
              ) : (
                <video
                  src={previewUrl}
                  className="w-full h-full object-contain"
                  muted
                  playsInline
                  autoPlay
                  loop
                />
              )}

              {/* Remove button */}
              <button
                onClick={handleRemoveMedia}
                className="absolute top-2 right-2 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
                aria-label="Remove media"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Caption input */}
            <div>
              <input
                type="text"
                placeholder="Add a caption..."
                value={caption}
                onChange={(e) => setCaption(e.target.value.slice(0, 200))}
                className="w-full rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] dark:bg-gray-700 px-4 py-2.5 text-sm text-[var(--tg-theme-text-color,#000000)] outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50"
                maxLength={200}
              />
              <p className="mt-1 text-xs text-[var(--tg-theme-hint-color,#999999)] text-right">
                {caption.length}/200
              </p>
            </div>

            {/* Visibility picker */}
            <div>
              <label className="text-sm font-medium text-[var(--tg-theme-text-color,#000000)] mb-2 block">
                Who can see this story?
              </label>
              <div className="flex gap-2">
                {STORY_VISIBILITY_OPTIONS.map((option) => (
                  <button
                    key={option}
                    onClick={() => setVisibility(option)}
                    className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-all ${
                      visibility === option
                        ? "bg-[var(--tg-theme-button-color,#0088cc)] text-white"
                        : "bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] dark:bg-gray-700 text-[var(--tg-theme-text-color,#000000)]"
                    }`}
                  >
                    {option === "public" ? "Everyone" : "Followers Only"}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={resetAndClose} fullWidth>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handlePublish}
                fullWidth
              >
                Publish
              </Button>
            </div>
          </div>
        )}

        {/* Step: Publishing progress */}
        {step === "publishing" && (
          <div className="py-8 space-y-4">
            <div className="flex flex-col items-center gap-3">
              <svg
                className="w-10 h-10 animate-spin text-[var(--tg-theme-button-color,#0088cc)]"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <p className="text-sm text-[var(--tg-theme-text-color,#000000)] font-medium">
                Publishing your story...
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--tg-theme-button-color,#0088cc)] transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
