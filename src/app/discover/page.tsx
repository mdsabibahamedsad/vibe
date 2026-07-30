"use client";

import { useState } from "react";
import { Discovery } from "@/features/dating/components/Discovery";
import { DiscoveryFilters } from "@/features/dating/components/DiscoveryFilters";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";

export default function DiscoverPage() {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        title="Discover"
        actions={
          <button
            onClick={() => setFiltersOpen(true)}
            className="rounded-full p-2 text-muted hover:bg-fg/10 hover:text-fg transition-colors"
            aria-label="Discovery filters"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>
        }
      />

      <Discovery />

      <DiscoveryFilters
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onFiltersApplied={() => setFiltersOpen(false)}
      />

      <BottomNav />
    </div>
  );
}
