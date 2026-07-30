/**
 * Notification Throttle Service — Prevents notification spam.
 *
 * Protects against:
 *   - Rapid likes/unlikes generating notification floods
 *   - Repeated follows/unfollows
 *   - Mention spam
 *   - Comment spam
 *   - Automated interaction abuse
 *
 * Uses per-type cooldowns stored in memory (server-side).
 * For distributed environments, replace with Redis-based cooldown.
 */

import { logger } from "@/lib/logger";
import { RateLimiter } from "@/lib/rate-limiter";

// ─── Per-Type Cooldowns ─────────────────────────────────────────────────

interface CooldownConfig {
  /** Cooldown window in milliseconds */
  windowMs: number;
  /** Max events allowed in the window */
  maxEvents: number;
  /** Whether to send a single notification for the first event, then suppress */
  allowFirst: boolean;
}

const TYPE_COOLDOWNS: Record<string, CooldownConfig> = {
  "like.created": { windowMs: 60_000, maxEvents: 5, allowFirst: true },
  "comment.created": { windowMs: 10_000, maxEvents: 3, allowFirst: true },
  "reply.created": { windowMs: 10_000, maxEvents: 3, allowFirst: true },
  "follow.created": { windowMs: 60_000, maxEvents: 3, allowFirst: true },
  "story.reaction": { windowMs: 30_000, maxEvents: 5, allowFirst: true },
  "mention.created": { windowMs: 30_000, maxEvents: 3, allowFirst: true },
};

// ─── In-Memory Cooldown Tracker ────────────────────────────────────────

interface CooldownEntry {
  count: number;
  windowStart: number;
  firstSent: boolean;
}

const cooldownMap = new Map<string, CooldownEntry>();

// ─── Check Cooldown ─────────────────────────────────────────────────────

/**
 * Check whether a notification event should be suppressed due to spam protection.
 *
 * Returns:
 *   { shouldSuppress: true, reason: "..." } if the event should be skipped
 *   { shouldSuppress: false } if the event is allowed
 */
export function checkNotificationCooldown(
  eventType: string,
  recipientId: string,
): { shouldSuppress: boolean; reason?: string } {
  const config = TYPE_COOLDOWNS[eventType];
  if (!config) {
    return { shouldSuppress: false }; // Unknown types aren't throttled
  }

  const key = `${eventType}:${recipientId}`;
  const now = Date.now();
  const entry = cooldownMap.get(key);

  if (!entry || now - entry.windowStart > config.windowMs) {
    // Start a new window
    cooldownMap.set(key, { count: 1, windowStart: now, firstSent: !config.allowFirst });
    return { shouldSuppress: false };
  }

  // Within existing window
  entry.count += 1;

  if (entry.count > config.maxEvents) {
    return { shouldSuppress: true, reason: "rate_limited" };
  }

  if (!entry.firstSent && config.allowFirst) {
    entry.firstSent = true;
    return { shouldSuppress: false }; // Allow the first one
  }

  return { shouldSuppress: false };
}

// ─── Cleanup Old Cooldowns ──────────────────────────────────────────────

/**
 * Periodically clean up stale cooldown entries to prevent memory leaks.
 * Call this on a scheduled interval (e.g., every 5 minutes).
 */
export function cleanupCooldowns(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, entry] of cooldownMap.entries()) {
    if (now - entry.windowStart > 300_000) {
      // 5 minutes stale
      cooldownMap.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug("Cleaned up stale notification cooldowns", { count: cleaned });
  }
}

// Schedule periodic cleanup (runs every 5 minutes in server environments)
if (typeof globalThis !== 'undefined' && typeof setInterval !== 'undefined') {
  setInterval(cleanupCooldowns, 5 * 60 * 1000);
}

// ─── Per-User Rate Limiter for Notification Endpoints ───────────────────

export const notificationListRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  name: "notification_list",
});

export const notificationMarkReadRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  name: "notification_mark_read",
});

export const notificationPreferencesRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  name: "notification_preferences",
});
