/**
 * Feedback Service — Track user actions on recommendations for ranking improvement.
 *
 * Connects user actions (like, pass, follow, view) back to recommendation impressions
 * so the ranking system can learn which features correlate with positive outcomes.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";
import { RateLimiter } from "@/lib/rate-limiter";
import { SIGNAL_MAX_AGE_HOURS } from "@/lib/recommendation/constants";
import { decaySignal } from "@/lib/recommendation/feature.service";

// ─── Rate Limiter ───────────────────────────────────────────────────────

const feedbackRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  name: "recommendation_feedback",
});

// ─── Feedback Types ─────────────────────────────────────────────────────

export type FeedbackAction =
  | "like"
  | "pass"
  | "super_like"
  | "follow"
  | "view"
  | "match"
  | "conversation_started"
  | "conversation_replied";

export interface FeedbackEvent {
  viewerId: string;
  candidateId: string;
  action: FeedbackAction;
  requestId?: string;
  mode?: string;
}

// ─── Record Feedback ────────────────────────────────────────────────────

/**
 * Record a user's action on a recommended candidate.
 *
 * Updates the recommendation_impressions record with the interaction data
 * so future ranking can evaluate which candidates drive positive outcomes.
 */
export async function recordFeedback(event: FeedbackEvent): Promise<void> {
  try {
    await feedbackRateLimiter.enforce(event.viewerId);

    const adminClient = createAdminClient();

    // Update the most recent impression for this viewer-candidate pair
    const { data: recentImpressions } = await adminClient
      .from("recommendation_impressions")
      .select("id")
      .eq("viewer_id", event.viewerId)
      .eq("candidate_id", event.candidateId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (recentImpressions && recentImpressions.length > 0) {
      await adminClient
        .from("recommendation_impressions")
        .update({
          interaction_type: event.action,
          interacted_at: new Date().toISOString(),
        })
        .eq("id", recentImpressions[0].id);
    }

    // Track analytics event
    const eventName = `recommendation_${event.action}`;
    await trackEvent(event.viewerId, eventName, "recommendation", event.candidateId, {
      requestId: event.requestId ?? null,
      mode: event.mode ?? null,
    }).catch(() => {});
  } catch (err) {
    logger.warn("Failed to record recommendation feedback", {
      error: err instanceof Error ? err.message : "Unknown",
    });
  }
}

// ─── Aggregate Signals ──────────────────────────────────────────────────

export interface AggregateSignal {
  candidateId: string;
  positiveScore: number;
  negativeScore: number;
  interactionCount: number;
  lastInteractionAt: string | null;
}

/**
 * Get aggregate feedback signals for a set of candidates.
 * Used by the ranking system to incorporate learned affinity.
 */
export async function getAggregateSignals(
  candidateIds: string[],
): Promise<Map<string, AggregateSignal>> {
  const result = new Map<string, AggregateSignal>();

  if (candidateIds.length === 0) return result;

  try {
    const adminClient = createAdminClient();

    const { data: interactions } = await adminClient
      .from("recommendation_impressions")
      .select("candidate_id, interaction_type, interacted_at")
      .in("candidate_id", candidateIds)
      .not("interaction_type", "is", null);

    for (const candidateId of candidateIds) {
      const candidateInteractions = (interactions ?? []).filter(
        (i: any) => i.candidate_id === candidateId,
      );

      let positiveScore = 0;
      let negativeScore = 0;
      let lastInteractionAt: string | null = null;

      for (const interaction of candidateInteractions) {
        const hoursAgo = interaction.interacted_at
          ? (Date.now() - new Date(interaction.interacted_at).getTime()) / (1000 * 60 * 60)
          : SIGNAL_MAX_AGE_HOURS;

        const decay = decaySignal(hoursAgo);

        switch (interaction.interaction_type) {
          case "like":
          case "super_like":
          case "follow":
          case "match":
          case "conversation_started":
          case "conversation_replied":
            positiveScore += 1 * decay;
            break;
          case "pass":
            negativeScore += 1 * decay;
            break;
        }

        if (
          interaction.interacted_at &&
          (!lastInteractionAt || interaction.interacted_at > lastInteractionAt)
        ) {
          lastInteractionAt = interaction.interacted_at;
        }
      }

      result.set(candidateId, {
        candidateId,
        positiveScore,
        negativeScore,
        interactionCount: candidateInteractions.length,
        lastInteractionAt,
      });
    }
  } catch (err) {
    logger.warn("Failed to get aggregate feedback signals", {
      error: err instanceof Error ? err.message : "Unknown",
    });
  }

  return result;
}
