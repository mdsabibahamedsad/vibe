"use client";

import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import type { NotificationPreferences, NotificationPreferencesInput } from "@/lib/notifications/schemas";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notifications/constants";

interface UseNotificationPreferencesReturn {
  preferences: NotificationPreferences;
  loading: boolean;
  error: string | null;
  update: (input: NotificationPreferencesInput) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching and updating notification preferences.
 */
export function useNotificationPreferences(): UseNotificationPreferencesReturn {
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/preferences");

      if (!res.ok) {
        const result = await res.json().catch(() => ({ error: "Failed to load" }));
        throw new Error(result.error || "Failed to load preferences");
      }

      const data = await res.json();
      setPreferences(data.preferences);
    } catch (err) {
      logger.error("Failed to fetch notification preferences", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      setError(err instanceof Error ? err.message : "Failed to load preferences");
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(
    async (input: NotificationPreferencesInput) => {
      try {
        const res = await fetch("/api/notifications/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });

        if (!res.ok) {
          const result = await res.json().catch(() => ({ error: "Failed to update" }));
          throw new Error(result.error || "Failed to update preferences");
        }

        const data = await res.json();
        setPreferences(data.preferences);
      } catch (err) {
        logger.error("Failed to update notification preferences", {
          error: err instanceof Error ? err.message : "Unknown",
        });
        throw err;
      }
    },
    [],
  );

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  return {
    preferences,
    loading,
    error,
    update,
    refresh: fetchPreferences,
  };
}
