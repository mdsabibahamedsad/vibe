/**
 * Bot & Scraping Protection
 *
 * Protects public/high-value endpoints against automated scraping, enumeration,
 * fake engagement, and mass account creation using behavioral signals.
 *
 * Usage:
 *   import { checkBotActivity } from "@/lib/security/bot-protection";
 *   const result = await checkBotActivity({ userId, ip, userAgent, endpoint });
 *   if (result.isBot) { applyStricterLimits(); }
 */

import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface BotCheckInput {
  userId?: string;
  ip: string;
  userAgent?: string;
  endpoint: string;
  hasAcceptLanguage?: boolean;
  hasCookies?: boolean;
  msSinceLastRequest?: number;
  accountAgeSeconds?: number;
}

export interface BotCheckResult {
  isBot: boolean;
  confidence: number;
  signals: string[];
  action: "allow" | "rate_limit" | "challenge" | "block";
}

// ============================================================================
// BOT PATTERNS
// ============================================================================

const KNOWN_BOT_USER_AGENTS = [
  /bot/i, /crawler/i, /spider/i, /scraper/i, /scrape/i, /curl/i, /wget/i,
  /python-requests/i, /python-urllib/i, /go-http-client/i, /http-client/i,
  /okhttp/i, /java\/[\d.]+/i, /ruby/i, /perl/i, /php/i, /axios/i,
  /postman/i, /insomnia/i, /httrack/i, /wappalyzer/i, /nmap/i, /masscan/i, /zgrab/i,
];

const SUSPICIOUS_USER_AGENT_PATTERNS = [
  /^$/, /^[a-z]+$/, /^[a-z]+\/[0-9.]+$/i, /mozilla\/[\d.]+$/i,
];

// ============================================================================
// THRESHOLDS
// ============================================================================

const THRESHOLDS = {
  MIN_HUMAN_INTERVAL_MS: 500,
  MIN_INTERVAL_VARIANCE: 0.2,
  NEW_ACCOUNT_AGE_SEC: 7 * 24 * 60 * 60, // 7 days
  MAX_REQUESTS_BEFORE_CHECK: 100,
  CONFIDENCE_RATE_LIMIT: 0.3,
  CONFIDENCE_CHALLENGE: 0.6,
  CONFIDENCE_BLOCK: 0.85,
};

// ============================================================================
// IN-MEMORY TRACKING
// ============================================================================

const requestTimestamps = new Map<string, number[]>();
const MAX_TRACKED_INTERVALS = 10;
const MAX_TRACKED_KEYS = 10_000; // Prevent unbounded growth under DDoS
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    const cutoff = now - CLEANUP_INTERVAL_MS;
    for (const [key, timestamps] of requestTimestamps.entries()) {
      const valid = timestamps.filter((t) => t > cutoff);
      if (valid.length === 0) requestTimestamps.delete(key);
      else requestTimestamps.set(key, valid);
    }
    // Trim oldest entries if still over max keys
    if (requestTimestamps.size > MAX_TRACKED_KEYS) {
      const toDelete = requestTimestamps.size - MAX_TRACKED_KEYS;
      let i = 0;
      for (const key of requestTimestamps.keys()) {
        if (i >= toDelete) break;
        requestTimestamps.delete(key);
        i++;
      }
    }
  }, CLEANUP_INTERVAL_MS).unref?.();
}

// ============================================================================
// MAIN CHECK
// ============================================================================

export async function checkBotActivity(input: BotCheckInput): Promise<BotCheckResult> {
  const signals: string[] = [];
  let confidence = 0;
  const trackerKey = input.userId ?? input.ip;
  const now = Date.now();

  // Signal 1: User-Agent
  if (input.userAgent !== undefined) {
    for (const pattern of KNOWN_BOT_USER_AGENTS) {
      if (pattern.test(input.userAgent)) {
        signals.push(`Known bot user-agent: ${pattern}`);
        confidence += 0.4;
        break;
      }
    }
    if (confidence < 0.4) {
      for (const pattern of SUSPICIOUS_USER_AGENT_PATTERNS) {
        if (pattern.test(input.userAgent)) {
          signals.push(`Suspicious user-agent: ${input.userAgent.substring(0, 50)}`);
          confidence += 0.2;
          break;
        }
      }
    }
  } else {
    signals.push("Missing User-Agent");
    confidence += 0.15;
  }

  // Signal 2: Missing standard headers
  if (input.hasAcceptLanguage === false) { signals.push("Missing Accept-Language"); confidence += 0.1; }
  if (input.hasCookies === false) { signals.push("Missing cookies"); confidence += 0.1; }

  // Signal 3: Request velocity
  if (input.msSinceLastRequest !== undefined && input.msSinceLastRequest < THRESHOLDS.MIN_HUMAN_INTERVAL_MS) {
    signals.push(`Fast request: ${input.msSinceLastRequest}ms`);
    confidence += 0.25;
  }

  const timestamps = requestTimestamps.get(trackerKey) ?? [];
  timestamps.push(now);
  const recentTimestamps = timestamps.slice(-MAX_TRACKED_INTERVALS);
  requestTimestamps.set(trackerKey, recentTimestamps);

  if (recentTimestamps.length >= 5) {
    const intervals: number[] = [];
    for (let i = 1; i < recentTimestamps.length; i++) {
      intervals.push(recentTimestamps[i] - recentTimestamps[i - 1]);
    }
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((acc, val) => acc + Math.abs(val - avg), 0) / intervals.length;
    if (avg > 0 && variance / avg < THRESHOLDS.MIN_INTERVAL_VARIANCE) {
      signals.push(`Regular pattern (variance: ${((variance / avg) * 100).toFixed(0)}%)`);
      confidence += 0.3;
    }
  }

  // Signal 4: New account + high velocity
  if (input.accountAgeSeconds !== undefined && input.accountAgeSeconds < THRESHOLDS.NEW_ACCOUNT_AGE_SEC && recentTimestamps.length >= 10) {
    signals.push("New account, high velocity");
    confidence += 0.2;
  }

  // Signal 5: High volume to scraping-sensitive endpoints
  const highValue = ["/api/discovery", "/api/profiles", "/api/search", "/api/matches", "/api/feed"];
  if (highValue.some((ep) => input.endpoint.startsWith(ep)) && recentTimestamps.length >= THRESHOLDS.MAX_REQUESTS_BEFORE_CHECK) {
    signals.push(`High volume to ${input.endpoint}`);
    confidence += 0.15;
  }

  const action: BotCheckResult["action"] =
    confidence >= THRESHOLDS.CONFIDENCE_BLOCK ? "block"
    : confidence >= THRESHOLDS.CONFIDENCE_CHALLENGE ? "challenge"
    : confidence >= THRESHOLDS.CONFIDENCE_RATE_LIMIT ? "rate_limit"
    : "allow";

  if (confidence >= THRESHOLDS.CONFIDENCE_CHALLENGE) {
    logger.warn("Bot activity detected", { userId: input.userId ?? "anon", ip: input.ip, endpoint: input.endpoint, confidence, action });
  }

  return { isBot: confidence >= THRESHOLDS.CONFIDENCE_RATE_LIMIT, confidence, signals, action };
}

export function resetBotTracking(key: string): void {
  requestTimestamps.delete(key);
}
