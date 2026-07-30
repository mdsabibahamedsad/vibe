"use client";

import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";

interface DiscoveryFilterPreferences {
  minAge?: number;
  maxAge?: number;
  preferredGenders?: string[];
  maxDistanceKm?: number;
  datingIntent?: string;
  discoveryEnabled?: boolean;
  showInDiscovery?: boolean;
}

interface UseDiscoveryFiltersReturn {
  /** Current filter values */
  filters: DiscoveryFilterPreferences | null;
  /** Loading state */
  loading: boolean;
  /** Saving state */
  saving: boolean;
  /** Error message */
  error: string | null;
  /** Load current filters */
  loadFilters: () => Promise<void>;
  /** Persist filter changes to the server */
  saveFilters: (newFilters: DiscoveryFilterPreferences) => Promise<boolean>;
  /** Clear error */
  clearError: () => void;
}

/**
 * Hook for loading, updating, and persisting discovery filter preferences.
 */
export function useDiscoveryFilters(): UseDiscoveryFiltersReturn {
  const [filters, setFilters] = useState<DiscoveryFilterPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFilters = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/discovery/filters");

      if (!res.ok) {
        throw new Error("Failed to load filters");
      }

      const data = await res.json();
      setFilters(data.preferences);
    } catch (err) {
      logger.error("Failed to load discovery filters", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      setError(err instanceof Error ? err.message : "Failed to load filters");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  const saveFilters = useCallback(
    async (newFilters: DiscoveryFilterPreferences): Promise<boolean> => {
      setSaving(true);
      setError(null);

      try {
        const res = await fetch("/api/discovery/filters", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newFilters),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to save filters");
        }

        const data = await res.json();
        setFilters(data.preferences);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to save filters";
        setError(message);
        logger.error("Failed to save discovery filters", { error: message });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    filters,
    loading,
    saving,
    error,
    loadFilters,
    saveFilters,
    clearError,
  };
}
