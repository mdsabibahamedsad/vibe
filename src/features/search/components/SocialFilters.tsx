/**
 * SocialFilters — Filter panel for social discovery mode.
 *
 * Supports:
 *   - Interest filter (select interests to match)
 *   - Distance radius
 *   - Sort mode (recommended, nearby, recent)
 *
 * Usage:
 *   <SocialFilters
 *     filters={filters}
 *     onChange={setFilters}
 *     availableInterests={interests}
 *   />
 */

"use client";

import { useState } from "react";
import type { InterestCategory } from "@/lib/discovery/schemas";

interface SocialFilterState {
  interestIds: string[];
  maxDistanceKm: number | null;
  sort: "recommended" | "nearby" | "recent";
}

interface SocialFiltersProps {
  filters: SocialFilterState;
  onChange: (filters: SocialFilterState) => void;
  availableCategories?: InterestCategory[];
}

const DISTANCE_OPTIONS = [
  { label: "Anywhere", value: null },
  { label: "10 km", value: 10 },
  { label: "25 km", value: 25 },
  { label: "50 km", value: 50 },
  { label: "100 km", value: 100 },
  { label: "500 km", value: 500 },
];

export function SocialFilters({
  filters,
  onChange,
  availableCategories,
}: SocialFiltersProps) {
  const [expanded, setExpanded] = useState(false);

  const toggleInterest = (interestId: string) => {
    const current = filters.interestIds;
    const updated = current.includes(interestId)
      ? current.filter((id) => id !== interestId)
      : [...current, interestId];
    onChange({ ...filters, interestIds: updated });
  };

  const setDistance = (distance: number | null) => {
    onChange({ ...filters, maxDistanceKm: distance });
  };

  const setSort = (sort: "recommended" | "nearby" | "recent") => {
    onChange({ ...filters, sort });
  };

  const activeFilterCount =
    filters.interestIds.length + (filters.maxDistanceKm !== null ? 1 : 0);

  return (
    <div className="w-full">
      {/* Filter toggle button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={expanded}
        aria-label="Toggle filters"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="12" y1="18" x2="12" y2="18" />
          <circle cx="12" cy="18" r="1.5" />
          <circle cx="7" cy="6" r="1.5" />
          <circle cx="17" cy="6" r="1.5" />
        </svg>
        <span>Filters</span>
        {activeFilterCount > 0 && (
          <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Filter panel */}
      {expanded && (
        <div className="mt-3 p-4 bg-muted/30 rounded-xl border border-border space-y-4">
          {/* Sort */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Sort by
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {(["recommended", "nearby", "recent"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setSort(option)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filters.sort === option
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option === "recommended" ? "Recommended" : option === "nearby" ? "Nearby" : "Recent"}
                </button>
              ))}
            </div>
          </div>

          {/* Distance */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Distance
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {DISTANCE_OPTIONS.map((option) => (
                <button
                  key={option.label}
                  onClick={() => setDistance(option.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filters.maxDistanceKm === option.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interests */}
          {availableCategories && availableCategories.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Interests
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {availableCategories.map((category) => (
                  <div key={category.category}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">
                      {category.category}
                    </p>
                    <div className="flex gap-1.5 flex-wrap">
                      {category.interests.map((interest) => (
                        <button
                          key={interest.id}
                          onClick={() => toggleInterest(interest.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                            filters.interestIds.includes(interest.id)
                              ? "bg-primary/20 text-primary border border-primary/30"
                              : "bg-muted text-muted-foreground hover:text-foreground border border-transparent"
                          }`}
                        >
                          {interest.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clear filters */}
          {activeFilterCount > 0 && (
            <button
              onClick={() =>
                onChange({
                  interestIds: [],
                  maxDistanceKm: null,
                  sort: "recommended",
                })
              }
              className="text-xs text-primary hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
