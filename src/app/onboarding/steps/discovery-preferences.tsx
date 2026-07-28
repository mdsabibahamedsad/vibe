"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { ProfilePreviewCard } from "@/components/shared/profile-preview-card";
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

export function StepDiscoveryPreferences({ onComplete, saving, setSaving, setError }: StepProps) {
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(50);
  const [maxDistance, setMaxDistance] = useState(100);
  const [preferredGenders, setPreferredGenders] = useState<Set<string>>(
    new Set(["male", "female"]),
  );
  const [showPreview, setShowPreview] = useState(false);

  const toggleGender = (gender: string) => {
    const next = new Set(preferredGenders);
    if (next.has(gender)) {
      if (next.size <= 1) return;
      next.delete(gender);
    } else {
      next.add(gender);
    }
    setPreferredGenders(next);
  };

  const handleComplete = async () => {
    if (minAge > maxAge) {
      setError("Minimum age cannot be greater than maximum age");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/profile/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minAge,
          maxAge,
          maxDistanceKm: maxDistance,
          preferredGenders: Array.from(preferredGenders),
          discoveryEnabled: true,
          showInDiscovery: true,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error || "Failed to save preferences");
        return;
      }

      onComplete();
    } catch (err) {
      logger.error("Preferences save error", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold text-[var(--tg-theme-text-color,#000000)]">
          Discovery Preferences
        </h2>
        <p className="text-sm text-[var(--tg-theme-hint-color,#999999)]">
          Who would you like to discover?
        </p>
      </div>

      {/* Age Range */}
      <div>
        <label className="block text-sm font-medium text-[var(--tg-theme-text-color,#000000)] mb-2">
          Age range: {minAge} – {maxAge}
        </label>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--tg-theme-hint-color,#999999)]">Minimum</label>
            <input
              type="range"
              min={18}
              max={60}
              value={minAge}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setMinAge(val);
                if (val > maxAge) setMaxAge(val);
              }}
              className="w-full accent-[var(--tg-theme-button-color,#0088cc)]"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--tg-theme-hint-color,#999999)]">Maximum</label>
            <input
              type="range"
              min={18}
              max={100}
              value={maxAge}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setMaxAge(val);
                if (val < minAge) setMinAge(val);
              }}
              className="w-full accent-[var(--tg-theme-button-color,#0088cc)]"
            />
          </div>
        </div>
      </div>

      {/* Max Distance */}
      <div>
        <label className="block text-sm font-medium text-[var(--tg-theme-text-color,#000000)] mb-2">
          Maximum distance: {maxDistance} km
        </label>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--tg-theme-hint-color,#999999)]">1 km</span>
          <input
            type="range"
            min={1}
            max={500}
            value={maxDistance}
            onChange={(e) => setMaxDistance(parseInt(e.target.value))}
            className="flex-1 accent-[var(--tg-theme-button-color,#0088cc)]"
          />
          <span className="text-xs text-[var(--tg-theme-hint-color,#999999)]">500 km</span>
        </div>
      </div>

      {/* Preferred Genders */}
      <div>
        <label className="block text-sm font-medium text-[var(--tg-theme-text-color,#000000)] mb-2">
          Show me
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { value: "male", label: "Men" },
            { value: "female", label: "Women" },
            { value: "non_binary", label: "Non-binary" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => toggleGender(option.value)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                preferredGenders.has(option.value)
                  ? "bg-[var(--tg-theme-button-color,#0088cc)] text-[var(--tg-theme-button-text-color,#ffffff)]"
                  : "bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] text-[var(--tg-theme-text-color,#000000)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Profile Preview Toggle */}
      <button
        onClick={() => setShowPreview(!showPreview)}
        className="flex items-center gap-2 text-sm text-[var(--tg-theme-button-color,#0088cc)]"
      >
        <svg
          className={`h-4 w-4 transition-transform ${showPreview ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Preview your profile
      </button>

      {showPreview && (
        <div className="max-w-xs mx-auto">
          <ProfilePreviewCard
            displayName="You"
            age={25}
            city="Your City"
            country="Your Country"
            bio="Your bio will appear here once saved."
            interests={[{ name: "Music" }, { name: "Travel" }]}
          />
        </div>
      )}

      <Button onClick={handleComplete} fullWidth loading={saving} disabled={saving} size="lg">
        Complete Profile
      </Button>
    </div>
  );
}
