/**
 * Analytics event tracking for the social feed.
 *
 * Uses the analytics_events table from Prompt 02.
 * At scale, this should move to a dedicated event pipeline.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export async function trackEvent(
  userId: string,
  eventName: string,
  entityType?: string,
  entityId?: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  try {
    const adminClient = createAdminClient();

    await adminClient.from("analytics_events").insert({
      user_id: userId,
      event_name: eventName,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      properties: properties ?? {},
    });
  } catch (err) {
    // Analytics failures must never break the application
    logger.warn("Analytics event failed", {
      event: eventName,
      error: err instanceof Error ? err.message : "Unknown",
    });
  }
}
