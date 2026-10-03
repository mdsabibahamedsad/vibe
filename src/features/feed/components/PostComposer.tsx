"use client";

import { useCallback, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { useTranslation } from "@/lib/i18n/useTranslation";

interface PostComposerProps {
  userId: string;
  onPostCreated: (post: unknown) => void;
  onClose: () => void;
}

// Allowed MIME types for post media
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_IMAGES = 10;
const MAX_VIDEOS = 1;
const MAX_IMAGE_SIZE_MB = 10;
const MAX_VIDEO_SIZE_MB = 50;
/** Poll interval + cap for server-side media processing */
const PROCESS_POLL_MS = 1000;
const PROCESS_MAX_POLLS = 45;

type MediaStatus = "uploading" | "processing" | "ready" | "error";

interface MediaPreview {
  id: string;
  file: File;
  url: string;
  mediaType: "image" | "video";
  status: MediaStatus;
  /** Upload progress 0–100 */
  progress: number;
  /** Media record ID once the upload succeeds */
  mediaId?: string;
}

/**
 * Upload a file via XHR so we get real upload progress events.
 */
function uploadFile(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media/upload");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onerror = () => reject(new Error("network_error"));
    xhr.onload = () => {
      const body = (xhr.response ?? {}) as { success?: boolean; media?: { id: string }; error?: string };
      if (xhr.status >= 200 && xhr.status < 300 && body.success && body.media?.id) {
        resolve({ id: body.media.id });
      } else {
        reject(new Error(body.error || "upload_failed"));
      }
    };
    const formData = new FormData();
    formData.append("file", file);
    formData.append("purpose", "post");
    xhr.send(formData);
  });
}

/**
 * Poll the media status endpoint until server-side processing completes.
 */
async function waitForProcessing(mediaId: string): Promise<boolean> {
  for (let i = 0; i < PROCESS_MAX_POLLS; i++) {
    const res = await fetch(`/api/media/${mediaId}/status`);
    if (res.ok) {
      const data = (await res.json()) as { ready?: boolean; failed?: boolean };
      if (data.ready) return true;
      if (data.failed) return false;
    }
    await new Promise((r) => setTimeout(r, PROCESS_POLL_MS));
  }
  return false;
}

export function PostComposer({ userId, onPostCreated, onClose }: PostComposerProps) {
  const { t } = useTranslation("feed");
  const [caption, setCaption] = useState("");
  const [mediaPreviews, setMediaPreviews] = useState<MediaPreview[]>([]);
  const [visibility, setVisibility] = useState<"public" | "followers_only" | "private">("public");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updatePreview = useCallback((id: string, patch: Partial<MediaPreview>) => {
    setMediaPreviews((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setError(null);

    for (const file of Array.from(files)) {
      // Check limits
      if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
        const currentImages = mediaPreviews.filter((m) => m.mediaType === "image").length;
        if (currentImages >= MAX_IMAGES) {
          setError(t("composer.maxImages", { max: MAX_IMAGES }));
          break;
        }
        if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
          setError(t("composer.imageTooLarge", { max: MAX_IMAGE_SIZE_MB }));
          continue;
        }
      } else if (ALLOWED_VIDEO_TYPES.includes(file.type)) {
        const currentVideos = mediaPreviews.filter((m) => m.mediaType === "video").length;
        if (currentVideos >= MAX_VIDEOS) {
          setError(t("composer.maxVideos", { max: MAX_VIDEOS }));
          break;
        }
        if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
          setError(t("composer.videoTooLarge", { max: MAX_VIDEO_SIZE_MB }));
          continue;
        }
      } else {
        setError(t("composer.unsupportedType"));
        continue;
      }

      const mediaType = ALLOWED_IMAGE_TYPES.includes(file.type) ? "image" : "video";
      const preview: MediaPreview = {
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
        mediaType,
        status: "uploading",
        progress: 0,
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

  /**
   * Upload one preview item, polling until processing completes.
   * Resolves the media ID, or throws.
   */
  const uploadPreview = async (preview: MediaPreview): Promise<string> => {
    updatePreview(preview.id, { status: "uploading", progress: 0, mediaId: undefined });
    try {
      const { id } = await uploadFile(preview.file, (pct) =>
        updatePreview(preview.id, { progress: pct }),
      );
      updatePreview(preview.id, { mediaId: id, status: "processing", progress: 100 });
      const ok = await waitForProcessing(id);
      if (!ok) throw new Error("processing_failed");
      updatePreview(preview.id, { status: "ready" });
      return id;
    } catch (err) {
      logger.error("Media upload failed", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      updatePreview(preview.id, { status: "error" });
      throw err;
    }
  };

  const retryUpload = async (preview: MediaPreview) => {
    setError(null);
    try {
      await uploadPreview(preview);
    } catch {
      setError(t("composer.uploadFailed"));
    }
  };

  const handlePublish = async () => {
    if (!caption.trim() && mediaPreviews.length === 0) {
      setError(t("composer.needContent"));
      return;
    }

    setPublishing(true);
    setError(null);

    try {
      // Upload any media that is not ready yet, in selection order
      const mediaIds: string[] = [];
      for (const preview of mediaPreviews) {
        if (preview.status === "ready" && preview.mediaId) {
          mediaIds.push(preview.mediaId);
          continue;
        }
        if (preview.status === "error" || preview.status === "uploading" || preview.status === "processing") {
          const id = await uploadPreview(preview);
          mediaIds.push(id);
        }
      }

      const postType =
        mediaPreviews.length > 0
          ? mediaPreviews[0].mediaType === "video"
            ? "video"
            : "image"
          : "text";

      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption: caption.trim(),
          postType,
          visibility,
          mediaIds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create post");
      }

      onPostCreated(data.post);
    } catch (err) {
      logger.error("Publish error", { error: err instanceof Error ? err.message : "Unknown" });
      setError(err instanceof Error ? err.message : t("composer.uploadFailed"));
    } finally {
      setPublishing(false);
    }
  };

  const canPublish =
    (!caption.trim() && mediaPreviews.length === 0) ||
    publishing ||
    mediaPreviews.some((m) => m.status === "error");

  return (
    <div className="glass flex min-h-dvh flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
        <button
          onClick={onClose}
          className="text-sm text-muted transition-colors hover:text-fg"
        >
          {t("composer.cancel")}
        </button>
        <h1 className="font-display text-lg font-semibold text-fg">
          {t("composer.newPost")}
        </h1>
        <button
          onClick={handlePublish}
          disabled={canPublish}
          className={`rounded-full px-5 py-2 text-sm font-medium transition active:scale-95 ${
            canPublish
              ? "bg-surface-2 text-muted"
              : "bg-brand-gradient text-white shadow-glow"
          }`}
        >
          {publishing ? t("composer.publishing") : t("composer.publish")}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-medium" aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 space-y-4 p-4">
        {/* Caption */}
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder={t("postPlaceholder")}
          maxLength={2000}
          rows={4}
          className="w-full resize-none rounded-2xl bg-surface-2 px-4 py-3 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <p className="text-right text-xs text-muted">
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
                {/* Status overlay */}
                {media.status !== "ready" && (
                  <div className="absolute inset-0 flex h-20 w-20 flex-col items-center justify-center rounded-xl bg-black/60 text-[10px] font-medium text-white">
                    {media.status === "uploading" && <span>{media.progress}%</span>}
                    {media.status === "processing" && <span>{t("composer.processing")}</span>}
                    {media.status === "error" && (
                      <button
                        onClick={() => retryUpload(media)}
                        className="rounded-full bg-danger px-2 py-0.5"
                      >
                        {t("composer.retry")}
                      </button>
                    )}
                  </div>
                )}
                {/* Upload progress bar */}
                {media.status === "uploading" && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b-xl bg-white/20">
                    <div
                      className="h-full bg-brand-gradient transition-all"
                      style={{ width: `${media.progress}%` }}
                    />
                  </div>
                )}
                <button
                  onClick={() => removeMedia(media.id)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-xs text-white shadow-soft"
                  aria-label={t("composer.removeMedia")}
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
          aria-hidden
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-fg transition-all hover:bg-surface hover:shadow-soft"
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
          {t("composer.addMedia")}
        </button>

        {/* Visibility selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-fg">
            {t("composer.visibility")}
          </label>
          <div className="flex gap-2">
            {(
              [
                { value: "public", label: t("composer.visibilityPublic") },
                { value: "followers_only", label: t("composer.visibilityFollowers") },
                { value: "private", label: t("composer.visibilityPrivate") },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                onClick={() => setVisibility(option.value)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all active:scale-95 ${
                  visibility === option.value
                    ? "bg-brand-gradient text-white shadow-glow"
                    : "bg-surface-2 text-fg hover:bg-surface"
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
