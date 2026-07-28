"use client";

import { useState } from "react";

interface PhotoItem {
  id: string;
  url?: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

interface PhotoPickerProps {
  photos: PhotoItem[];
  maxPhotos?: number;
  onAdd: (file: File) => Promise<void>;
  onRemove: (photoId: string) => Promise<void>;
  onReorder: (items: { id: string; sortOrder: number }[]) => Promise<void>;
  onSetPrimary: (photoId: string) => Promise<void>;
  loading?: boolean;
}

export function PhotoPicker({
  photos,
  maxPhotos = 10,
  onAdd,
  onRemove,
  onReorder,
  onSetPrimary,
  loading = false,
}: PhotoPickerProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const sortedPhotos = [...photos].sort((a, b) => a.sortOrder - b.sortOrder);
  const canAdd = photos.length < maxPhotos;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await onAdd(file);
    e.target.value = "";
  };

  const handleRemove = async (photoId: string) => {
    setRemovingId(photoId);
    await onRemove(photoId);
    setRemovingId(null);
  };

  const handleSetPrimary = async (photoId: string) => {
    await onSetPrimary(photoId);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newItems = sortedPhotos.map((p, i) => ({
      id: p.id,
      sortOrder: i === index ? index - 1 : i === index - 1 ? index : i,
    }));
    onReorder(newItems);
  };

  const handleMoveDown = (index: number) => {
    if (index >= sortedPhotos.length - 1) return;
    const newItems = sortedPhotos.map((p, i) => ({
      id: p.id,
      sortOrder: i === index ? index + 1 : i === index + 1 ? index : i,
    }));
    onReorder(newItems);
  };

  return (
    <div className="space-y-3">
      {/* Photo grid */}
      <div className="grid grid-cols-3 gap-2">
        {/* Existing photos */}
        {sortedPhotos.map((photo, index) => (
          <div
            key={photo.id}
            className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
              photo.isPrimary
                ? "border-[var(--tg-theme-button-color,#0088cc)]"
                : "border-transparent"
            } ${removingId === photo.id ? "opacity-50 scale-95" : ""}`}
          >
            {photo.url ? (
              <img
                src={photo.url}
                alt={`Photo ${index + 1}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] flex items-center justify-center">
                <svg
                  className="h-6 w-6 text-[var(--tg-theme-hint-color,#999999)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}

            {/* Badges */}
            <div className="absolute top-1 left-1 flex gap-1">
              {photo.isPrimary && (
                <span className="rounded-full bg-[var(--tg-theme-button-color,#0088cc)] px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Primary
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="absolute bottom-1 right-1 flex gap-1">
              {!photo.isPrimary && (
                <button
                  onClick={() => handleSetPrimary(photo.id)}
                  className="rounded-full bg-black/50 p-1 text-white hover:bg-black/70 transition-colors"
                  title="Set as primary"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                    />
                  </svg>
                </button>
              )}
              <button
                onClick={() => handleRemove(photo.id)}
                className="rounded-full bg-black/50 p-1 text-white hover:bg-red-500/70 transition-colors"
                title="Remove"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Order buttons */}
            <div className="absolute left-1 bottom-1 flex gap-1">
              {index > 0 && (
                <button
                  onClick={() => handleMoveUp(index)}
                  className="rounded-full bg-black/50 p-1 text-white hover:bg-black/70 transition-colors"
                  title="Move up"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 15l7-7 7 7"
                    />
                  </svg>
                </button>
              )}
              {index < sortedPhotos.length - 1 && (
                <button
                  onClick={() => handleMoveDown(index)}
                  className="rounded-full bg-black/50 p-1 text-white hover:bg-black/70 transition-colors"
                  title="Move down"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Add photo button */}
        {canAdd && (
          <label className="aspect-square rounded-xl border-2 border-dashed border-[var(--tg-theme-hint-color,#999999)] flex items-center justify-center cursor-pointer hover:border-[var(--tg-theme-button-color,#0088cc)] transition-colors">
            <div className="flex flex-col items-center gap-1 text-[var(--tg-theme-hint-color,#999999)]">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span className="text-[10px]">Add</span>
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
              disabled={loading}
            />
          </label>
        )}
      </div>

      {loading && (
        <p className="text-center text-xs text-[var(--tg-theme-hint-color,#999999)]">
          Uploading...
        </p>
      )}

      <p className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
        {photos.length} of {maxPhotos} photos{photos.length === 0 ? " — Add at least 1 photo" : ""}
      </p>
    </div>
  );
}
