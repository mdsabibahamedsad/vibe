"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
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

const INTENTS = [
  {
    value: "dating",
    label: "Dating",
    description: "Looking for romantic dates",
    icon: "💕",
  },
  {
    value: "friendship",
    label: "Friendship",
    description: "Looking for new friends",
    icon: "🤝",
  },
  {
    value: "chat",
    label: "Chat",
    description: "Just want to chat",
    icon: "💬",
  },
  {
    value: "relationship",
    label: "Relationship",
    description: "Looking for something serious",
    icon: "💞",
  },
  {
    value: "not_sure",
    label: "Not sure yet",
    description: "Keeping it open",
    icon: "🤔",
  },
];

export function StepDatingIntent({ onNext, saving, setSaving, setError }: StepProps) {
  const [selected, setSelected] = useState<string>("");

  const handleSubmit = async () => {
    if (!selected) {
      setError("Please select what you're looking for");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datingIntent: selected }),
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error || "Failed to save");
        return;
      }

      onNext();
    } catch (err) {
      logger.error("Intent save error", { error: err instanceof Error ? err.message : "Unknown" });
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold text-[var(--tg-theme-text-color,#000000)]">
          What are you looking for?
        </h2>
        <p className="text-sm text-[var(--tg-theme-hint-color,#999999)]">
          Choose what fits best for now — you can change it later
        </p>
      </div>

      <div className="space-y-2">
        {INTENTS.map((intent) => (
          <button
            key={intent.value}
            onClick={() => setSelected(intent.value)}
            className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
              selected === intent.value
                ? "border-[var(--tg-theme-button-color,#0088cc)] bg-[var(--tg-theme-button-color,#0088cc)]/5"
                : "border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)]"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{intent.icon}</span>
              <div>
                <p className="font-medium text-[var(--tg-theme-text-color,#000000)]">
                  {intent.label}
                </p>
                <p className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
                  {intent.description}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <Button
        onClick={handleSubmit}
        fullWidth
        loading={saving}
        disabled={!selected || saving}
        size="lg"
      >
        Continue
      </Button>
    </div>
  );
}
