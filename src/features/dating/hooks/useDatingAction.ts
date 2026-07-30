"use client";

import { useCallback, useState } from "react";
import { logger } from "@/lib/logger";
import type { DatingActionResponse } from "@/lib/discovery/schemas";

interface UseDatingActionReturn {
  /** Whether an action is in progress */
  actionLoading: boolean;
  /** Error from the last action */
  actionError: string | null;
  /** Like a candidate */
  like: (targetUserId: string) => Promise<boolean>;
  /** Pass on a candidate */
  pass: (targetUserId: string) => Promise<boolean>;
  /** Super like a candidate */
  superLike: (targetUserId: string) => Promise<boolean>;
  /** Clear action error */
  clearError: () => void;
}

/**
 * Hook for performing dating actions (like, pass, super_like).
 */
export function useDatingAction(): UseDatingActionReturn {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const performAction = useCallback(
    async (
      targetUserId: string,
      action: "like" | "pass" | "super_like",
    ): Promise<boolean> => {
      setActionLoading(true);
      setActionError(null);

      try {
        const res = await fetch("/api/discovery/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId, action }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || `Failed to ${action} user`);
        }

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : `Failed to ${action} user`;
        setActionError(message);
        logger.error("Dating action failed", { action, targetUserId, error: message });
        return false;
      } finally {
        setActionLoading(false);
      }
    },
    [],
  );

  const like = useCallback(
    (targetUserId: string) => performAction(targetUserId, "like"),
    [performAction],
  );

  const pass = useCallback(
    (targetUserId: string) => performAction(targetUserId, "pass"),
    [performAction],
  );

  const superLike = useCallback(
    (targetUserId: string) => performAction(targetUserId, "super_like"),
    [performAction],
  );

  const clearError = useCallback(() => setActionError(null), []);

  return {
    actionLoading,
    actionError,
    like,
    pass,
    superLike,
    clearError,
  };
}
