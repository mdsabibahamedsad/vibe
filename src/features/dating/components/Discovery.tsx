"use client";

import { useCallback, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useDiscovery } from "@/features/dating/hooks/useDiscovery";
import { useDatingAction } from "@/features/dating/hooks/useDatingAction";
import { CandidateCard } from "./CandidateCard";
import { DiscoveryFilters } from "./DiscoveryFilters";
import { Loading, EmptyState, ErrorState, Button } from "@/components/ui";

/**
 * Discovery — Main dating discovery page content.
 *
 * Orchestrates:
 *  - Eligibility checks (underage, incomplete profile, etc.)
 *  - Candidate display (swipeable card)
 *  - Like/Pass/Super Like actions
 *  - Filter preferences
 *  - Empty states
 */
export function Discovery() {
  const { user, authenticated } = useCurrentUser();
  const {
    candidates,
    eligible,
    ineligibilityReason,
    loading,
    loadingMore,
    error,
    hasMore,
    refresh,
    loadMore,
    removeCandidate,
  } = useDiscovery();

  const { actionLoading, actionError, like, pass, superLike, clearError } = useDatingAction();

  const [filtersOpen, setFiltersOpen] = useState(false);

  // ─── Action Handlers ─────────────────────────────────────────────

  const handleLike = useCallback(
    async (candidateId: string) => {
      const success = await like(candidateId);
      if (success) {
        removeCandidate(candidateId);
      }
    },
    [like, removeCandidate],
  );

  const handlePass = useCallback(
    async (candidateId: string) => {
      const success = await pass(candidateId);
      if (success) {
        removeCandidate(candidateId);
      }
    },
    [pass, removeCandidate],
  );

  const handleSuperLike = useCallback(
    async (candidateId: string) => {
      const success = await superLike(candidateId);
      if (success) {
        removeCandidate(candidateId);
      }
    },
    [superLike, removeCandidate],
  );

  const handleFiltersApplied = useCallback(() => {
    refresh();
  }, [refresh]);

  // ─── Ineligible States ───────────────────────────────────────────

  if (!authenticated || !user) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          title="Sign in to discover people"
          description="Connect with Telegram to start meeting new people."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loading message="Finding people near you..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <ErrorState title="Failed to load discovery" message={error} onRetry={refresh} />
      </div>
    );
  }

  // ─── Ineligibility Reasons ───────────────────────────────────────

  if (!eligible) {
    const ineligibleContent = (() => {
      switch (ineligibilityReason) {
        case "PROFILE_INCOMPLETE":
          return (
            <EmptyState
              title="Complete your profile"
              description="Add your photo, bio, and preferences to start discovering people."
              action={
                <a
                  href="/onboarding"
                  className="mt-3 inline-block rounded-xl bg-[var(--tg-theme-button-color,#0088cc)] px-6 py-2.5 text-sm font-medium text-white"
                >
                  Complete Profile
                </a>
              }
            />
          );
        case "UNDERAGE":
          return (
            <EmptyState
              title="Sorry, you must be 18+"
              description="Dating discovery is only available to users aged 18 and older."
            />
          );
        case "DISCOVERY_DISABLED":
          return (
            <EmptyState
              title="Discovery is disabled"
              description="Enable discovery in your settings to see other people."
              action={
                <button
                  onClick={() => setFiltersOpen(true)}
                  className="mt-3 inline-block rounded-xl bg-[var(--tg-theme-button-color,#0088cc)] px-6 py-2.5 text-sm font-medium text-white"
                >
                  Open Settings
                </button>
              }
            />
          );
        case "ACCOUNT_RESTRICTED":
          return (
            <EmptyState
              title="Account restricted"
              description="Your account has been restricted. Please contact support if you believe this is an error."
            />
          );
        default:
          return (
            <EmptyState
              title="Not available"
              description="Discovery is not available right now. Please try again later."
            />
          );
      }
    })();

    return <div className="flex-1 flex items-center justify-center">{ineligibleContent}</div>;
  }

  // ─── Empty State (No More Candidates) ────────────────────────────

  if (candidates.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          title="No more people nearby"
          description="Try widening your age range or distance to see more people."
          action={
            <button
              onClick={() => setFiltersOpen(true)}
              className="mt-3 rounded-xl bg-[var(--tg-theme-button-color,#0088cc)] px-6 py-2.5 text-sm font-medium text-white"
            >
              Adjust Filters
            </button>
          }
        />
      </div>
    );
  }

  // ─── Main Discovery UI ──────────────────────────────────────────

  const currentCandidate = candidates[0];

  return (
    <div className="flex-1 flex flex-col px-4 py-4">
      {/* Action error toast */}
      {actionError && (
        <div className="fixed bottom-4 left-4 right-4 z-40 rounded-xl bg-red-500 p-3 text-sm text-white shadow-lg">
          {actionError}
          <button
            onClick={clearError}
            className="ml-2 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Candidate card */}
      <div className="flex-1 flex items-center justify-center">
        <CandidateCard
          key={currentCandidate.id}
          candidate={currentCandidate}
          onLike={() => handleLike(currentCandidate.id)}
          onPass={() => handlePass(currentCandidate.id)}
          onSuperLike={() => handleSuperLike(currentCandidate.id)}
          actionLoading={actionLoading}
        />
      </div>

      {/* Remaining count */}
      {candidates.length > 1 && (
        <div className="text-center pb-2">
          <span className="text-xs text-[var(--tg-theme-hint-color,#999999)]">
            {candidates.length - 1} more candidate{candidates.length - 1 !== 1 ? "s" : ""} in queue
          </span>
        </div>
      )}

      {/* Load more trigger (invisible) */}
      {hasMore && candidates.length < 5 && !loadingMore && (
        <div className="text-center pb-4">
          <button
            onClick={loadMore}
            className="text-sm text-[var(--tg-theme-button-color,#0088cc)] font-medium"
          >
            Load more
          </button>
        </div>
      )}

      {loadingMore && (
        <div className="text-center pb-4">
          <Loading message="Loading more..." />
        </div>
      )}

      {/* Filters modal */}
      <DiscoveryFilters
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onFiltersApplied={handleFiltersApplied}
      />
    </div>
  );
}
