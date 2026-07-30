"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { useDiscoveryFilters } from "@/features/dating/hooks/useDiscoveryFilters";
import { Loading } from "@/components/ui";

interface DiscoveryFiltersProps {
  open: boolean;
  onClose: () => void;
  onFiltersApplied: () => void;
}

const GENDER_LABELS: Record<string, string> = {
  male: "Men",
  female: "Women",
  non_binary: "Non-binary",
  prefer_not_to_say: "Rather not say",
};

const INTENT_LABELS: Record<string, string> = {
  dating: "Dating",
  friendship: "Friendship",
  chat: "Chat",
  relationship: "Relationship",
  not_sure: "Not sure yet",
};

/**
 * DiscoveryFilters — Bottom sheet for editing discovery filter preferences.
 *
 * Features:
 *  - Age range slider/inputs
 *  - Gender preference multi-select
 *  - Maximum distance slider
 *  - Dating intent filter
 *  - Persists changes to server
 */
export function DiscoveryFilters({
  open,
  onClose,
  onFiltersApplied,
}: DiscoveryFiltersProps) {
  const { filters, loading, saving, error, saveFilters } = useDiscoveryFilters();

  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(60);
  const [preferredGenders, setPreferredGenders] = useState<string[]>([]);
  const [maxDistanceKm, setMaxDistanceKm] = useState(100);
  const [datingIntent, setDatingIntent] = useState<string | undefined>(undefined);
  const [localError, setLocalError] = useState<string | null>(null);

  // Initialize local state from loaded filters
  useEffect(() => {
    if (filters) {
      setMinAge(filters.minAge ?? 18);
      setMaxAge(filters.maxAge ?? 60);
      setPreferredGenders(filters.preferredGenders ?? []);
      setMaxDistanceKm(filters.maxDistanceKm ?? 100);
      setDatingIntent(filters.datingIntent ?? undefined);
    }
  }, [filters]);

  const toggleGender = useCallback((gender: string) => {
    setPreferredGenders((prev) => {
      if (prev.includes(gender)) {
        return prev.filter((g) => g !== gender);
      }
      return [...prev, gender];
    });
  }, []);

  const handleSave = useCallback(async () => {
    setLocalError(null);

    // Validation
    if (minAge < 18) {
      setLocalError("Minimum age must be 18 or older");
      return;
    }
    if (maxAge < minAge) {
      setLocalError("Maximum age must be greater than minimum age");
      return;
    }
    if (preferredGenders.length === 0) {
      setLocalError("Select at least one gender preference");
      return;
    }

    const success = await saveFilters({
      minAge,
      maxAge,
      preferredGenders,
      maxDistanceKm,
      datingIntent: datingIntent || undefined,
    });

    if (success) {
      onFiltersApplied();
      onClose();
    }
  }, [
    minAge,
    maxAge,
    preferredGenders,
    maxDistanceKm,
    datingIntent,
    saveFilters,
    onFiltersApplied,
    onClose,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 transition-opacity" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[var(--tg-theme-bg-color,#ffffff)] dark:bg-gray-800 p-6 shadow-xl animate-slide-up">
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-300" />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
            Discovery Filters
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-[var(--tg-theme-hint-color,#999999)] hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <Loading message="Loading filters..." />
        ) : (
          <div className="space-y-6">
            {/* ─── Age Range ─────────────────────────────────────── */}
            <div>
              <label className="text-sm font-medium text-[var(--tg-theme-text-color,#000000)] mb-3 block">
                Age Range
              </label>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-xs text-[var(--tg-theme-hint-color,#999999)] mb-1 block">
                    Min
                  </label>
                  <input
                    type="number"
                    min={18}
                    max={100}
                    value={minAge}
                    onChange={(e) => setMinAge(Math.max(18, parseInt(e.target.value) || 18))}
                    className="w-full rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] dark:bg-gray-700 px-4 py-2.5 text-sm text-[var(--tg-theme-text-color,#000000)] outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50"
                  />
                </div>
                <span className="text-[var(--tg-theme-hint-color,#999999)] mt-6">to</span>
                <div className="flex-1">
                  <label className="text-xs text-[var(--tg-theme-hint-color,#999999)] mb-1 block">
                    Max
                  </label>
                  <input
                    type="number"
                    min={18}
                    max={100}
                    value={maxAge}
                    onChange={(e) => setMaxAge(Math.max(minAge, parseInt(e.target.value) || minAge))}
                    className="w-full rounded-xl bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] dark:bg-gray-700 px-4 py-2.5 text-sm text-[var(--tg-theme-text-color,#000000)] outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#0088cc)]/50"
                  />
                </div>
              </div>
            </div>

            {/* ─── Gender Preference ─────────────────────────────── */}
            <div>
              <label className="text-sm font-medium text-[var(--tg-theme-text-color,#000000)] mb-3 block">
                Show me
              </label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(GENDER_LABELS).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => toggleGender(value)}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                      preferredGenders.includes(value)
                        ? "bg-[var(--tg-theme-button-color,#0088cc)] text-white"
                        : "bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] dark:bg-gray-700 text-[var(--tg-theme-text-color,#000000)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ─── Max Distance ──────────────────────────────────── */}
            <div>
              <label className="text-sm font-medium text-[var(--tg-theme-text-color,#000000)] mb-3 block">
                Maximum Distance
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={1}
                  max={500}
                  value={maxDistanceKm}
                  onChange={(e) => setMaxDistanceKm(parseInt(e.target.value))}
                  className="flex-1 accent-[var(--tg-theme-button-color,#0088cc)]"
                />
                <span className="text-sm font-medium text-[var(--tg-theme-text-color,#000000)] w-16 text-right">
                  {maxDistanceKm} km
                </span>
              </div>
            </div>

            {/* ─── Dating Intent ─────────────────────────────────── */}
            <div>
              <label className="text-sm font-medium text-[var(--tg-theme-text-color,#000000)] mb-3 block">
                Looking for
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setDatingIntent(undefined)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                    !datingIntent
                      ? "bg-[var(--tg-theme-button-color,#0088cc)] text-white"
                      : "bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] dark:bg-gray-700 text-[var(--tg-theme-text-color,#000000)]"
                  }`}
                >
                  Anyone
                </button>
                {Object.entries(INTENT_LABELS).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setDatingIntent(value)}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                      datingIntent === value
                        ? "bg-[var(--tg-theme-button-color,#0088cc)] text-white"
                        : "bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] dark:bg-gray-700 text-[var(--tg-theme-text-color,#000000)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {(localError || error) && (
              <p className="text-sm text-red-500">{localError || error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={onClose} fullWidth>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                fullWidth
                loading={saving}
              >
                Apply Filters
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
