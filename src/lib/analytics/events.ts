import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export type EventCategory =
  | "engagement" | "monetization" | "growth" | "moderation"
  | "content" | "social" | "dating" | "system" | "advertising" | "support";

export interface EventDefinition {
  eventName: string;
  description: string;
  category: EventCategory;
  requiredFields: string[];
  isSensitive: boolean;
  retentionDays: number;
}

export interface AnalyticsEvent {
  id: string;
  userId: string | null;
  eventName: string;
  entityType: string | null;
  entityId: string | null;
  properties: Record<string, unknown>;
  createdAt: string;
}

export const EVENT_DEFINITIONS: EventDefinition[] = [
  { eventName: "app_launch", description: "User launched the app", category: "system", requiredFields: ["platform", "app_version"], isSensitive: false, retentionDays: 365 },
  { eventName: "authentication_complete", description: "User completed Telegram authentication", category: "growth", requiredFields: ["auth_method"], isSensitive: false, retentionDays: 365 },
  { eventName: "onboarding_started", description: "User began onboarding", category: "growth", requiredFields: [], isSensitive: false, retentionDays: 365 },
  { eventName: "onboarding_completed", description: "User completed onboarding", category: "growth", requiredFields: ["completed_steps"], isSensitive: false, retentionDays: 365 },
  { eventName: "profile_created", description: "User created profile", category: "growth", requiredFields: [], isSensitive: false, retentionDays: 365 },
  { eventName: "feed_impression", description: "User viewed feed", category: "engagement", requiredFields: ["feed_type"], isSensitive: false, retentionDays: 90 },
  { eventName: "post_view", description: "User viewed a post", category: "content", requiredFields: [], isSensitive: false, retentionDays: 90 },
  { eventName: "post_like", description: "User liked a post", category: "content", requiredFields: [], isSensitive: false, retentionDays: 90 },
  { eventName: "post_comment", description: "User commented on a post", category: "content", requiredFields: [], isSensitive: false, retentionDays: 90 },
  { eventName: "post_share", description: "User shared a post", category: "content", requiredFields: [], isSensitive: false, retentionDays: 90 },
  { eventName: "post_create", description: "User created a post", category: "content", requiredFields: ["visibility"], isSensitive: false, retentionDays: 365 },
  { eventName: "follow", description: "User followed another user", category: "social", requiredFields: [], isSensitive: false, retentionDays: 365 },
  { eventName: "unfollow", description: "User unfollowed another user", category: "social", requiredFields: [], isSensitive: false, retentionDays: 90 },
  { eventName: "discovery_view", description: "User viewed discovery feed", category: "dating", requiredFields: [], isSensitive: false, retentionDays: 90 },
  { eventName: "profile_view", description: "User viewed a profile", category: "dating", requiredFields: [], isSensitive: true, retentionDays: 90 },
  { eventName: "like_sent", description: "User sent a like", category: "dating", requiredFields: ["target_gender"], isSensitive: true, retentionDays: 365 },
  { eventName: "super_like_sent", description: "User sent a super like", category: "dating", requiredFields: [], isSensitive: false, retentionDays: 365 },
  { eventName: "match_created", description: "User matched", category: "dating", requiredFields: [], isSensitive: false, retentionDays: 365 },
  { eventName: "message_sent", description: "User sent a message", category: "social", requiredFields: [], isSensitive: true, retentionDays: 90 },
  { eventName: "conversation_started", description: "User started a conversation", category: "social", requiredFields: [], isSensitive: false, retentionDays: 365 },
  { eventName: "story_view", description: "User viewed a story", category: "content", requiredFields: [], isSensitive: false, retentionDays: 90 },
  { eventName: "story_create", description: "User created a story", category: "content", requiredFields: [], isSensitive: false, retentionDays: 365 },
  { eventName: "video_view", description: "User viewed a short video", category: "content", requiredFields: ["duration_watched"], isSensitive: false, retentionDays: 90 },
  { eventName: "video_like", description: "User liked a video", category: "content", requiredFields: [], isSensitive: false, retentionDays: 90 },
  { eventName: "video_upload", description: "User uploaded a video", category: "content", requiredFields: ["duration_seconds"], isSensitive: false, retentionDays: 365 },
  { eventName: "live_start", description: "User started a live stream", category: "content", requiredFields: [], isSensitive: false, retentionDays: 365 },
  { eventName: "live_join", description: "User joined a live stream", category: "content", requiredFields: [], isSensitive: false, retentionDays: 90 },
  { eventName: "premium_view", description: "User viewed premium page", category: "monetization", requiredFields: [], isSensitive: false, retentionDays: 90 },
  { eventName: "checkout_started", description: "User started checkout", category: "monetization", requiredFields: ["plan_slug"], isSensitive: false, retentionDays: 365 },
  { eventName: "payment_completed", description: "User completed payment", category: "monetization", requiredFields: ["plan_slug", "amount_stars"], isSensitive: false, retentionDays: 730 },
  { eventName: "subscription_activated", description: "User subscription activated", category: "monetization", requiredFields: ["plan_slug"], isSensitive: false, retentionDays: 730 },
  { eventName: "subscription_cancelled", description: "User cancelled subscription", category: "monetization", requiredFields: [], isSensitive: false, retentionDays: 730 },
  { eventName: "subscription_expired", description: "User subscription expired", category: "monetization", requiredFields: [], isSensitive: false, retentionDays: 730 },
  { eventName: "subscription_renewed", description: "User subscription renewed", category: "monetization", requiredFields: ["plan_slug"], isSensitive: false, retentionDays: 730 },
  { eventName: "ad_impression", description: "Ad was shown", category: "advertising", requiredFields: ["placement", "campaign_id"], isSensitive: false, retentionDays: 90 },
  { eventName: "ad_click", description: "User clicked an ad", category: "advertising", requiredFields: ["campaign_id"], isSensitive: false, retentionDays: 90 },
  { eventName: "ad_conversion", description: "User converted from ad", category: "advertising", requiredFields: [], isSensitive: false, retentionDays: 365 },
  { eventName: "search_performed", description: "User performed a search", category: "engagement", requiredFields: ["query"], isSensitive: true, retentionDays: 90 },
  { eventName: "notification_received", description: "User received a notification", category: "system", requiredFields: ["notification_type"], isSensitive: false, retentionDays: 90 },
  { eventName: "session_start", description: "User session started", category: "system", requiredFields: [], isSensitive: false, retentionDays: 90 },
  { eventName: "session_end", description: "User session ended", category: "system", requiredFields: ["duration_seconds"], isSensitive: false, retentionDays: 90 },
];

export const EVENT_NAMES = EVENT_DEFINITIONS.map((e) => e.eventName);

export async function trackEvent(
  userId: string,
  eventName: string,
  entityType?: string,
  entityId?: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  if (!EVENT_NAMES.includes(eventName)) {
    logger.warn("Unknown analytics event", { eventName });
  }

  try {
    const adminClient = createAdminClient();
    const eventId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await adminClient.from("analytics_events").insert({
      id: eventId,
      user_id: userId,
      event_name: eventName,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      properties: properties ?? {},
    });
  } catch (err) {
    logger.warn("Analytics event failed", {
      event: eventName,
      error: err instanceof Error ? err.message : "Unknown",
    });
  }
}

export function validateEventPayload(
  eventName: string,
  properties: Record<string, unknown>,
): { valid: boolean; errors: string[] } {
  const def = EVENT_DEFINITIONS.find((e) => e.eventName === eventName);
  if (!def) {
    return { valid: false, errors: [`Unknown event: ${eventName}`] };
  }

  const errors: string[] = [];

  for (const field of def.requiredFields) {
    if (properties[field] === undefined || properties[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (properties && JSON.stringify(properties).length > 10000) {
    errors.push("Properties too large (>10KB)");
  }

  const sensitiveFields = ["password", "secret", "token", "credit_card", "ssn", "phone"];
  for (const field of sensitiveFields) {
    if (field in properties) {
      errors.push(`Sensitive field not allowed: ${field}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
