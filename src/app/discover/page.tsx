"use client";

import { useState } from "react";
import { Discovery } from "@/features/dating/components/Discovery";
import { DiscoveryFilters } from "@/features/dating/components/DiscoveryFilters";

export default function DiscoverPage() {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--tg-theme-bg-color,#ffffff)]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--tg-theme-secondary-bg-color,#f0f0f0)] bg-[var(--tg-theme-bg-color,#ffffff)]/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold text-[var(--tg-theme-text-color,#000000)]">
            Discover
          </h1>
          <button
            onClick={() => setFiltersOpen(true)}
            className="rounded-full p-2 text-[var(--tg-theme-hint-color,#999999)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            aria-label="Discovery filters"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>
        </div>
      </header>

      {/* Discovery Content */}
      <Discovery />

      {/* Filters bottom sheet */}
      <DiscoveryFilters
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onFiltersApplied={() => {
          setFiltersOpen(false);
          // Refresh will be triggered by Discovery component
        }}
      />
    </div>
  );
}
