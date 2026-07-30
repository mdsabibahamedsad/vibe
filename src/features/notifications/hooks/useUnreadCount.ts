"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { UnreadCountResponse } from "@/lib/notifications/schemas";

interface UseUnreadCountReturn {
  total: number;
  messages: number;
  dating: number;
  social: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching and realtime-updating unread notification counts.
 *
 * Features:
 *  - Initial fetch from API
 *  - Realtime updates on new notifications
 *  - Deduplication via notification ID tracking
 *  - Visual cap at 99+
 */
export function useUnreadCount(): UseUnreadCountReturn {
  const [counts, setCounts] = useState<UnreadCountResponse>({
    total: 0,
    messages: 0,
    dating: 0,
    social: 0,
    system: 0,
  });
  const [loading, setLoading] = useState(true);

  const seenIdsRef = useRef<Set<string>>(new Set());

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (res.ok) {
        const data = (await res.json()) as UnreadCountResponse;
        setCounts(data);
      }
    } catch (err) {
      logger.error("Failed to fetch unread count", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Initial fetch ────────────────────────────────────────────────

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // ─── Realtime updates ─────────────────────────────────────────────

  useEffect(() => {
    const supabase = getSupabaseClient();

    const channel = supabase.channel("unread-notifications");

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
      },
      (payload) => {
        const newNotif = payload.new as any;
        if (!newNotif || newNotif.is_read) return;

        // Deduplicate by ID
        if (seenIdsRef.current.has(newNotif.id)) return;
        seenIdsRef.current.add(newNotif.id);

        setCounts((prev) => ({
          total: prev.total + 1,
          messages: newNotif.type === "new_message"
            ? prev.messages + 1
            : prev.messages,
          dating: newNotif.type === "new_match"
            ? prev.dating + 1
            : prev.dating,
          social: ["post_like", "post_comment", "new_follower", "story_view", "story_reaction"].includes(newNotif.type)
            ? prev.social + 1
            : prev.social,
          system: newNotif.type === "system"
            ? prev.system + 1
            : prev.system,
        }));
      },
    );

    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `is_read=eq.true`,
      },
      () => {
        // A notification was marked as read — refetch counts
        fetchCount();
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCount]);

  return {
    total: Math.min(counts.total, 99),
    messages: Math.min(counts.messages, 99),
    dating: Math.min(counts.dating, 99),
    social: Math.min(counts.social, 99),
    loading,
    refresh: fetchCount,
  };
}
