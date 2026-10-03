"use client";

/**
 * Dating — dedicated discovery experience.
 *
 * Hosts the existing dating Discovery components (previously mounted at
 * /discover) so social discovery and dating each keep their own space.
 */

import { useState } from "react";
import { Discovery } from "@/features/dating/components/Discovery";
import { DiscoveryFilters } from "@/features/dating/components/DiscoveryFilters";
import { AppHeader } from "@/components/app-header";
import { BottomNav, DesktopNav } from "@/components/bottom-nav";
import { useTranslation } from "@/lib/i18n/useTranslation";

export default function DatingPage() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { t } = useTranslation("dating");

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        title={t("title")}
        actions={
          <button
            onClick={() => setFiltersOpen(true)}
            className="rounded-full p-2 text-muted transition-colors hover:bg-fg/10 hover:text-fg"
            aria-label={t("filters")}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>
        }
      />

      <main className="mx-auto w-full max-w-2xl flex-1">
        <Discovery />
      </main>

      <DiscoveryFilters
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onFiltersApplied={() => setFiltersOpen(false)}
      />

      <BottomNav />
      <DesktopNav />
    </div>
  );
}
