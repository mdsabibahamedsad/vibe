/**
 * MediaUploader — Reusable media upload component.
 *
 * Supports:
 *   - Image and video upload
 *   - File picker / drag-and-drop
 *   - Upload progress indicator
 *   - Processing status tracking
 *   - Cancel / retry
 *   - Previews
 *
 * Usage:
 *   <MediaUploader
 *     purpose="post"
 *     entityType="post"
 *     entityId={postId}
 *     onUploadComplete={(result) => setMediaId(result.id)}
 *     maxFileSize={10 * 1024 * 1024}
 *     accept="image/*,video/*"
 *   />
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { logger } from "@/lib/logger";

interface MediaUploaderProps {
  purpose: string;
  entityType?: string;
  entityId?: string;
  onUploadComplete?: (result: MediaUploadResult) => void;
  onUploadError?: (error: string) => void;
  maxFileSize?: number;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
}

interface MediaUploadResult {
  id: string;
  mediaType: string;
  mimeType: string;
  processingStatus: string;
  url: string;
  thumbnailUrl: string | null;
}

type UploadState = "idle" | "uploading" | "processing" | "ready" | "failed";

export function MediaUploader({
  purpose,
  entityType,
  entityId,
  onUploadComplete,
  onUploadError,
  maxFileSize = 10 * 1024 * 1024, // 10 MB default
  accept = "image/jpeg,image/png,image/webp,video/mp4,video/webm",
  multiple = false,
  disabled = false,
  label = "Upload",
}: MediaUploaderProps) {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [results, setResults] = useState<MediaUploadResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setUploadState("idle");
    setProgress(0);
    setError(null);
    abortRef.current = null;
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      setError(null);

      for (const file of files) {
        // Client-side validation
        if (file.size > maxFileSize) {
          const maxMb = Math.round(maxFileSize / (1024 * 1024));
          const errMsg = `File too large. Maximum size is ${maxMb}MB.`;
          setError(errMsg);
          onUploadError?.(errMsg);
          continue;
        }

        // Create preview
        const previewUrl = URL.createObjectURL(file);
        setPreviews((prev) => [...prev, previewUrl]);

        try {
          await uploadFile(file, previewUrl);
        } catch (err) {
          // Error already handled in uploadFile
        }
      }

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [maxFileSize, purpose, entityType, entityId, onUploadComplete, onUploadError],
  );

  const uploadFile = useCallback(
    async (file: File, previewUrl: string) => {
      setUploadState("uploading");
      setProgress(0);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("purpose", purpose);
      if (entityType) formData.append("entityType", entityType);
      if (entityId) formData.append("entityId", entityId);

      abortRef.current = new AbortController();

      try {
        // Simulated progress (XHR doesn't support upload progress easily with fetch)
        setProgress(30);

        const response = await fetch("/api/media/upload", {
          method: "POST",
          body: formData,
          signal: abortRef.current.signal,
        });

        setProgress(70);

        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(errData.error || `Upload failed with status ${response.status}`);
        }

        const data = await response.json();
        const result: MediaUploadResult = data.media;

        setProgress(100);

        if (result.processingStatus === "pending") {
          setUploadState("processing");
          // Poll for processing status
          pollProcessingStatus(result.id);
        } else {
          setUploadState("ready");
          setResults((prev) => [...prev, result]);
          onUploadComplete?.(result);
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          setUploadState("idle");
          setProgress(0);
          return;
        }

        const errMsg = err.message || "Upload failed";
        setError(errMsg);
        setUploadState("failed");
        onUploadError?.(errMsg);
        logger.error("Upload failed", { error: errMsg });
      }
    },
    [purpose, entityType, entityId, onUploadComplete, onUploadError],
  );

  // Track interval ID for cleanup
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current !== null) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  const pollProcessingStatus = useCallback(
    (mediaId: string) => {
      let attempts = 0;
      const maxAttempts = 30; // 30 * 2s = 60s timeout

      // Clear any existing poll
      if (pollingRef.current !== null) {
        clearInterval(pollingRef.current);
      }

      pollingRef.current = setInterval(async () => {
        attempts++;

        try {
          const response = await fetch(`/api/media/${mediaId}/status`);
          if (!response.ok) {
            clearInterval(pollingRef.current!);
            pollingRef.current = null;
            setUploadState("failed");
            return;
          }

          const data = await response.json();

          if (data.ready) {
            clearInterval(pollingRef.current!);
            pollingRef.current = null;
            setUploadState("ready");
            const result: MediaUploadResult = {
              id: mediaId,
              mediaType: data.mediaType,
              mimeType: "",
              processingStatus: "ready",
              url: `/api/media/${mediaId}`,
              thumbnailUrl: null,
            };
            setResults((prev) => [...prev, result]);
            onUploadComplete?.(result);
          } else if (data.failed) {
            clearInterval(pollingRef.current!);
            pollingRef.current = null;
            setUploadState("failed");
            setError(data.error || "Processing failed");
            onUploadError?.("Processing failed");
          }
        } catch {
          // Continue polling
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setUploadState("failed");
          setError("Processing timed out");
          onUploadError?.("Processing timed out");
        }
      }, 2000);
    },
    [onUploadComplete, onUploadError],
  );

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    reset();
  }, [reset]);

  const handleRetry = useCallback(() => {
    reset();
    fileInputRef.current?.click();
  }, [reset]);

  return (
    <div className="w-full">
      {/* Upload area */}
      <div
        onClick={() => !disabled && uploadState === "idle" && fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files);
          if (files.length > 0 && fileInputRef.current) {
            const dt = new DataTransfer();
            files.forEach((f) => dt.items.add(f));
            fileInputRef.current.files = dt.files;
            fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          disabled || uploadState !== "idle"
            ? "border-muted cursor-not-allowed opacity-60"
            : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30"
        }`}
        role="button"
        tabIndex={0}
        aria-label={label}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        {/* State-specific content */}
        {uploadState === "idle" && (
          <div className="space-y-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mx-auto text-muted-foreground"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-sm text-muted-foreground">
              {label} — tap or drag & drop
            </p>
            <p className="text-xs text-muted-foreground/60">
              {accept.includes("video") ? "Images & short videos" : "Images only"} • Max{" "}
              {Math.round(maxFileSize / (1024 * 1024))}MB
            </p>
          </div>
        )}

        {uploadState === "uploading" && (
          <div className="space-y-2">
            <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Uploading... {progress}%</p>
            <div className="w-full max-w-xs mx-auto h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <button
              onClick={handleCancel}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Cancel
            </button>
          </div>
        )}

        {uploadState === "processing" && (
          <div className="space-y-2">
            <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Processing media...</p>
          </div>
        )}

        {uploadState === "failed" && (
          <div className="space-y-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mx-auto text-destructive"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <p className="text-sm text-destructive">{error || "Upload failed"}</p>
            <button
              onClick={handleRetry}
              className="text-sm text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileSelect}
        className="hidden"
        aria-hidden="true"
      />

      {/* Preview thumbnails */}
      {(previews.length > 0 || results.length > 0) && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {previews.map((previewUrl, i) => (
            <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={`Preview ${i + 1}`}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
