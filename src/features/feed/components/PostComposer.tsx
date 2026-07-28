"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui";
import { logger } from "@/lib/logger";

interface PostComposerProps {
  userId: string;
  onPostCreated: (post: any) => void;
  onClose: () => void;
}

// Allowed MIME types for post media
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_IMAGES = 10;
const MAX_VIDEOS = 1;
const MAX_IMAGE_SIZE_MB = 10;
const MAX_VIDEO_SIZE_MB = 50;

interface MediaPreview {
  id: string;
  file: File;
  url: string;
  mediaType: "image" | "video";
}

export function PostComposer({ userId, onPostCreated, onClose }: PostComposerProps) {
  const [caption, setCaption] = useState("");
  const [mediaPreviews, setMediaPreviews] = useState<MediaPreview[]>([]);
  const [visibility, setVisibility] = useState<"public" | "followers_only" | "private">("public");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setError(null);

    for (const file of Array.from(files)) {
      // Check limits
      if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
        const currentImages = mediaPreviews.filter((m) => m.mediaType === "image").length;
        if (currentImages >= MAX_IMAGES) {
          setError(`Maximum ${MAX_IMAGES} images allowed`);
          break;
        }
        if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
          setError(`Image must be less than ${MAX_IMAGE_SIZE_MB}MB`);
          continue;
        }
      } else if (ALLOWED_VIDEO_TYPES.includes(file.type)) {
        const currentVideos = mediaPreviews.filter((m) => m.mediaType === "video").length;
        if (currentVideos >= MAX_VIDEOS) {
          setError(`Maximum ${MAX_VIDEOS} video allowed`);
          break;
        }
        if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
          setError(`Video must be less than ${MAX_VIDEO_SIZE_MB}MB`);
          continue;
        }
      } else {
        setError("Unsupported file type. Please upload JPEG, PNG, WebP, or MP4.");
        continue;
      }

      const mediaType = ALLOWED_IMAGE_TYPES.includes(file.type) ? "image" : "video";
      const preview: MediaPreview = {
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
        mediaType,
      };
      setMediaPreviews((prev) => [...prev, preview]);
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeMedia = (id: string) => {
    setMediaPreviews((prev) => {
      const item = prev.find((m) => m.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((m) => m.id !== id);
    });
  };

  const handlePublish = async () => {
    if (!caption.trim() && mediaPreviews.length === 0) {
      setError("Add a caption or media to your post");
      return;
    }

    setPublishing(true);
    setError(null);

    try {
      const postType =
        mediaPreviews.length > 0
          ? mediaPreviews[0].mediaType === "video"
            ? "video"
            : "image"
          : "text";

      // Phase 1: Create post with metadata only (actual file upload comes in a later phase)
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption: caption.trim(),
          postType,
          visibility,
          mediaIds: [], // Phase 2: real file upload goes here
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create post");
      }

      onPostCreated(data.post);
    } catch (err) {
      logger.error("Publish error", { error: err instanceof Error ? err.message : "Unknown" });
      setError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--tg-theme-bg-color,#ffffff)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)]">
        <button
          onClick={onClose}
          className="text-sm text-[var(--tg-theme-hint-color,#999999)] hover:text-[var(--tg-theme-text-color,#000000)]"
        >
          Cancel
        </button>
        <h1 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
          New Post
        </h1>
        <Button
          onClick={handlePublish}
          loading={publishing}
          disabled={(!caption.trim() && mediaPreviews.length === 0) || publishing}
          size="sm"
        >
          Publish
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-medium">
            ×
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 p-4 space-y-4">
        {/* Caption */}
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="What's on your mind?"
          maxLength={2000}
          rows={4}
          className="w-full resize-none rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-4 py-3 text-sm text-[var(--tg-theme-text-color,#000000)] placeholder:text-[var(--tg-theme-hint-color,#999999)] focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50"
        />
        <p className="text-xs text-[var(--tg-theme-hint-color,#999999)] text-right">
          {caption.length}/2000
        </p>

        {/* Media previews */}
        {mediaPreviews.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {mediaPreviews.map((media) => (
              <div key={media.id} className="relative">
                {media.mediaType === "image" ? (
                  <img
                    src={media.url}
                    alt="Preview"
                    className="h-20 w-20 rounded-xl object-cover"
                  />
                ) : (
                  <video src={media.url} className="h-20 w-20 rounded-xl object-cover" />
                )}
                <button
                  onClick={() => removeMedia(media.id)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-xs"
                  aria-label="Remove media"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add media button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] px-4 py-3 text-sm text-[var(--tg-theme-text-color,#000000)] hover:opacity-80 transition-opacity"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          Add Photo / Video
        </button>

        {/* Visibility selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-[var(--tg-theme-text-color,#000000)]">
            Visibility
          </label>
          <div className="flex gap-2">
            {(
              [
                { value: "public", label: "Public" },
                { value: "followers_only", label: "Followers" },
                { value: "private", label: "Private" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                onClick={() => setVisibility(option.value)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  visibility === option.value
                    ? "bg-[var(--tg-theme-button-color,#0088cc)] text-white"
                    : "bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] text-[var(--tg-theme-text-color,#000000)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
