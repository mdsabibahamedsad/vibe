"use client";

/**
 * Discover — social discovery: who and what is interesting right now.
 *
 * Reuses the existing search + discovery infrastructure:
 *   - /api/discovery?mode=social  (people search, interest + distance filters)
 *   - /api/interests              (interest chips)
 * Dating discovery remains a dedicated experience at /dating.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchBar } from "@/features/search/components/SearchBar";
import { SocialFilters } from "@/features/search/components/SocialFilters";
import { DiscoveryResultList } from "@/features/search/components/DiscoveryResultList";
import { useDiscoverySearch } from "@/features/search/hooks/useDiscoverySearch";
import { useCurrentUser } from "@/hooks/use-current-user";
import { AppHeader } from "@/components/app-header";
import { BottomNav, DesktopNav } from "@/components/bottom-nav";
import { Loading, EmptyState } from "@/components/ui";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { InterestCategory } from "@/lib/discovery/schemas";

export default function DiscoverPage() {
  const router = useRouter();
  const { user, authenticated, loading: authLoading } = useCurrentUser();
  const { t } = useTranslation("search");
  const {
    query,
    setQuery,
    filters,
    setFilters,
    results,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  } = useDiscoverySearch();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [availableInterests, setAvailableInterests] = useState<InterestCategory[]>([]);

  // Fetch available interests for quick chips (real backend data)
  useEffect(() => {
    fetch("/api/interests")
      .then((res) => res.json())
      .then((data) => {
        if (data.interests) {
          const categories = new Map<string, InterestCategory>();
          for (const interest of data.interests) {
            const cat = interest.category ?? "Other";
            if (!categories.has(cat)) {
              categories.set(cat, { category: cat, interests: [] });
            }
            categories.get(cat)!.interests.push({
              id: interest.id,
              name: interest.name,
              slug: interest.slug,
            });
          }
          setAvailableInterests(Array.from(categories.values()));
        }
      })
      .catch(() => {});
  }, []);

  const toggleInterest = (id: string) => {
    const next = filters.interestIds.includes(id)
      ? filters.interestIds.filter((i) => i !== id)
      : [...filters.interestIds, id];
    setFilters({ ...filters, interestIds: next });
  };

  const hasQuery =
    query.length >= 2 || filters.interestIds.length > 0 || filters.maxDistanceKm !== null;

  if (authLoading) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader title={t("discoverTitle")} />
        <div className="flex flex-1 items-center justify-center">
          <Loading />
        </div>
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader title={t("discoverTitle")} />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title={t("signInToDiscover")}
            description={t("discoverSubtitle")}
          />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col pb-safe">
      <AppHeader title={t("discoverTitle")} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        {/* Intro line */}
        <p className="text-sm text-muted">{t("discoverSubtitle")}</p>

        {/* Search */}
        <div className="mt-4">
          <SearchBar value={query} onChange={setQuery} placeholder={t("placeholder")} />
        </div>

        {/* Interest quick chips */}
        {availableInterests.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none" role="group" aria-label={t("filterBy")}>
            {availableInterests
              .flatMap((c) => c.interests)
              .slice(0, 12)
              .map((interest) => {
                const selected = filters.interestIds.includes(interest.id);
                return (
                  <button
                    key={interest.id}
                    onClick={() => toggleInterest(interest.id)}
                    aria-pressed={selected}
                    className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                      selected
                        ? "bg-brand-gradient text-white shadow-glow"
                        : "bg-surface-2 text-fg border border-divider hover:brightness-97"
                    }`}
                  >
                    {interest.name}
                  </button>
                );
              })}
          </div>
        )}

        {/* Advanced filters */}
        <div className="mt-3">
          <SocialFilters
            filters={filters}
            onChange={setFilters}
            availableCategories={availableInterests}
          />
        </div>

        {/* Dating — dedicated experience entry */}
        <button
          onClick={() => router.push("/dating")}
          className="surface-card group mt-5 flex w-full items-center gap-3 overflow-hidden rounded-2xl p-4 text-start transition-transform active:scale-[0.98]"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-xl shadow-glow">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-semibold text-fg">{t("datingCardTitle")}</p>
            <p className="mt-0.5 text-xs text-muted">{t("datingCardSubtitle")}</p>
          </div>
          <svg
            className="h-4 w-4 shrink-0 text-muted transition-transform group-active:translate-x-0.5 rtl:rotate-180"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* People results */}
        <section className="mt-6" aria-label={t("people")}>
          <h2 className="mb-3 font-display text-base font-semibold tracking-tight text-fg">
            {t("people")}
          </h2>
          <DiscoveryResultList
            results={results}
            loading={loading}
            loadingMore={loadingMore}
            error={error}
            hasMore={hasMore}
            hasQuery={hasQuery}
            onLoadMore={loadMore}
            onRetry={refresh}
            onViewProfile={(userId) => router.push(`/profile/${userId}`)}
          />
        </section>
      </main>

      <BottomNav />
      <DesktopNav />
    </div>
  );
}
