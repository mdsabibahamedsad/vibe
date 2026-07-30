/**
 * Search + Discovery page — unified social discovery mode.
 *
 * Supports:
 *   - Text search with debounce
 *   - Interest filtering (by categories)
 *   - Distance filtering
 *   - Sort modes (recommended, nearby, recent)
 *   - Cursor pagination with infinite scroll
 *   - Empty/error states
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SearchBar } from "@/features/search/components/SearchBar";
import { SocialFilters } from "@/features/search/components/SocialFilters";
import { DiscoveryResultList } from "@/features/search/components/DiscoveryResultList";
import { useDiscoverySearch } from "@/features/search/hooks/useDiscoverySearch";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { InterestCategory } from "@/lib/discovery/schemas";

export default function SearchPage() {
  const router = useRouter();
  const { user, authenticated, loading: authLoading } = useCurrentUser();
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

  const [availableInterests, setAvailableInterests] = useState<InterestCategory[]>([]);

  // Fetch available interests for filter UI
  useEffect(() => {
    fetch("/api/interests")
      .then((res) => res.json())
      .then((data) => {
        if (data.interests) {
          // Group by category
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

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center space-y-4">
        <h1 className="text-xl font-bold">Sign in to discover people</h1>
        <p className="text-sm text-muted-foreground">
          Find people who share your interests, nearby, or search by name.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-lg mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Discover</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Find people who share your interests
        </p>
      </div>

      {/* Search bar */}
      <SearchBar value={query} onChange={setQuery} />

      {/* Filters */}
      <div className="mt-3">
        <SocialFilters
          filters={filters}
          onChange={setFilters}
          availableCategories={availableInterests}
        />
      </div>

      {/* Results */}
      <DiscoveryResultList
        results={results}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        hasMore={hasMore}
        hasQuery={query.length >= 2 || filters.interestIds.length > 0 || filters.maxDistanceKm !== null}
        onLoadMore={loadMore}
        onRetry={refresh}
        onViewProfile={(userId) => router.push(`/profile/${userId}`)}
      />
    </div>
  );
}
