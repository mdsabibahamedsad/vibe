"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { Loading } from "@/components/ui";
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

interface Interest {
  id: string;
  name: string;
  slug: string;
  category: string | null;
}

export function StepInterests({ onNext, saving, setSaving, setError }: StepProps) {
  const [interests, setInterests] = useState<Interest[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [grouped, setGrouped] = useState<Record<string, Interest[]>>({});

  useEffect(() => {
    const fetchInterests = async () => {
      try {
        const response = await fetch("/api/interests");
        const result = await response.json();
        if (result.interests) {
          setInterests(result.interests);

          // Group by category
          const groups: Record<string, Interest[]> = {};
          for (const interest of result.interests) {
            const category = interest.category || "Other";
            if (!groups[category]) groups[category] = [];
            groups[category].push(interest);
          }
          setGrouped(groups);
        }
      } catch (err) {
        logger.error("Failed to load interests", {
          error: err instanceof Error ? err.message : "Unknown",
        });
        setError("Failed to load interests");
      } finally {
        setLoading(false);
      }
    };

    fetchInterests();
  }, [setError]);

  const toggleInterest = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      if (next.size <= 1) return; // Minimum 1
      next.delete(id);
    } else {
      if (next.size >= 15) return; // Maximum 15
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSubmit = async () => {
    if (selectedIds.size < 1) {
      setError("Please select at least 1 interest");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/interests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interestIds: Array.from(selectedIds) }),
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error || "Failed to save interests");
        return;
      }

      onNext();
    } catch (err) {
      logger.error("Interests save error", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loading message="Loading interests..." />;
  }

  const categoryOrder = [
    "Sports & Fitness",
    "Arts & Culture",
    "Food & Drink",
    "Travel & Adventure",
    "Technology",
    "Lifestyle",
    "Entertainment",
    "Education",
    "Other",
  ];

  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const idxA = categoryOrder.indexOf(a);
    const idxB = categoryOrder.indexOf(b);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold text-[var(--tg-theme-text-color,#000000)]">
          Your Interests
        </h2>
        <p className="text-sm text-[var(--tg-theme-hint-color,#999999)]">
          Pick things you enjoy ({selectedIds.size}/15)
        </p>
      </div>

      <div className="space-y-5">
        {sortedCategories.map((category) => (
          <div key={category}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--tg-theme-hint-color,#999999)] mb-2">
              {category}
            </h3>
            <div className="flex flex-wrap gap-2">
              {grouped[category].map((interest) => (
                <button
                  key={interest.id}
                  onClick={() => toggleInterest(interest.id)}
                  className={`rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
                    selectedIds.has(interest.id)
                      ? "bg-[var(--tg-theme-button-color,#0088cc)] text-[var(--tg-theme-button-text-color,#ffffff)] shadow-sm"
                      : "bg-[var(--tg-theme-secondary-bg-color,#f0f0f0)] text-[var(--tg-theme-text-color,#000000)] hover:bg-[var(--tg-theme-hint-color,#999999)]/20"
                  }`}
                >
                  {interest.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Button
        onClick={handleSubmit}
        fullWidth
        loading={saving}
        disabled={selectedIds.size < 1 || saving}
        size="lg"
      >
        Continue ({selectedIds.size} selected)
      </Button>
    </div>
  );
}
