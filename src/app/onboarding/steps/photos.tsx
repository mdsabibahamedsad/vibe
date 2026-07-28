"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { Loading } from "@/components/ui";
import { PhotoPicker } from "@/components/shared/photo-picker";
import { logger } from "@/lib/logger";

interface StepProps {
  userId: string;
  onNext: () => void;
  onBack: () => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  error: string | null;
  setError: (v: string | null) => void;
  onComplete: () => void;
}

interface PhotoItem {
  id: string;
  mediaId: string | null;
  telegramFileId: string | null;
  url?: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

export function StepPhotos({ userId, onNext, setSaving, setError }: StepProps) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const fetchPhotos = async () => {
      try {
        const response = await fetch("/api/profile/media");
        const result = await response.json();
        if (result.media) {
          setPhotos(result.media);
        }
      } catch (err) {
        logger.error("Failed to load photos", {
          error: err instanceof Error ? err.message : "Unknown",
        });
      } finally {
        setLoading(false);
      }
    };
    fetchPhotos();
  }, []);

  const handleAdd = async (file: File) => {
    // Validate file
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Please upload a JPEG, PNG, or WebP image");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be less than 10MB");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // For Phase 1, we use a placeholder upload
      // In a real implementation, this would upload to Supabase Storage
      // or send the file to a Telegram bot for hosting.
      // For now, we create a media reference with a blob URL for preview.
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Create media record via API
      const response = await fetch("/api/profile/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType: "image",
          storageProvider: "supabase",
          storagePath: `profiles/${userId}/${Date.now()}_${file.name}`,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Failed to upload photo");
        return;
      }

      if (result.media) {
        setPhotos((prev) => [...prev, { ...result.media, url: dataUrl }]);
      }
    } catch (err) {
      logger.error("Photo upload error", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      setError("Failed to upload. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (photoId: string) => {
    try {
      const response = await fetch(`/api/profile/media?id=${photoId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error || "Failed to remove photo");
        return;
      }

      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch (err) {
      logger.error("Photo remove error", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      setError("Failed to remove photo");
    }
  };

  const handleReorder = async (items: { id: string; sortOrder: number }[]) => {
    try {
      const response = await fetch("/api/profile/media", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.media) setPhotos(result.media);
      }
    } catch (err) {
      logger.error("Photo reorder error", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  };

  const handleSetPrimary = async (photoId: string) => {
    try {
      const response = await fetch("/api/profile/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.media) setPhotos(result.media);
      }
    } catch (err) {
      logger.error("Set primary error", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  };

  const handleContinue = () => {
    if (photos.length < 1) {
      setError("Please add at least 1 photo");
      return;
    }
    onNext();
  };

  if (loading) return <Loading message="Loading photos..." />;

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold text-[var(--tg-theme-text-color,#000000)]">
          Your Photos
        </h2>
        <p className="text-sm text-[var(--tg-theme-hint-color,#999999)]">
          Add photos so people can see you (at least 1 required)
        </p>
      </div>

      <PhotoPicker
        photos={photos}
        maxPhotos={10}
        onAdd={handleAdd}
        onRemove={handleRemove}
        onReorder={handleReorder}
        onSetPrimary={handleSetPrimary}
        loading={uploading}
      />

      <Button onClick={handleContinue} fullWidth disabled={photos.length < 1} size="lg">
        {photos.length >= 1 ? "Continue" : "Add at least 1 photo to continue"}
      </Button>
    </div>
  );
}
