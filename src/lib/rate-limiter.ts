/**
 * Rate limiting abstraction.
 *
 * In production, this should be backed by a distributed store (Redis, Upstash, etc.).
 * For the MVP/development, this provides a simple in-memory limiter that
 * prevents obvious request flooding.
 *
 * The interface is designed to be pluggable — swap the store implementation
 * without changing the consumers.
 *
 * Production strategy: Use Upstash Redis or Vercel KV for distributed rate limiting,
 * or implement at the edge (Cloudflare, middleware).
 */

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** Configuration for a rate limiter instance */
export interface RateLimiterConfig {
  /** Window duration in milliseconds */
  windowMs: number;
  /** Maximum number of requests within the window */
  maxRequests: number;
  /** Unique identifier for this limiter (for logging) */
  name: string;
}

/** Rate limiter interface — implement this for different backends */
export interface RateLimiterStore {
  /** Check if a request should be allowed */
  check(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
  /** Reset the counter for a key */
  reset(key: string): Promise<void>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * In-memory rate limiter store.
 * Suitable for development and single-instance deployments.
 * WARNING: Does not work across multiple server instances.
 */
export class InMemoryRateLimiter implements RateLimiterStore {
  private store = new Map<string, { count: number; resetAt: number }>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Cleanup expired entries every 5 minutes to prevent memory leaks
    if (typeof setInterval !== "undefined" && !this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
      // Allow the process to exit even if the interval is still running
      if (this.cleanupInterval && typeof this.cleanupInterval === "object") {
        this.cleanupInterval.unref?.();
      }
    }
  }

  async check(key: string, maxRequests: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      // New window
      this.store.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
    }

    if (entry.count >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count++;
    return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Clean up expired entries periodically to prevent memory leaks */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetAt) {
        this.store.delete(key);
      }
    }
  }
}

// Singleton in-memory limiter for development
const defaultStore = new InMemoryRateLimiter();

/**
 * Rate limiter instance with configurable store.
 * Supports both boolean check() and throwing enforce().
 */
export class RateLimiter {
  private store: RateLimiterStore;
  private config: RateLimiterConfig;

  constructor(config: RateLimiterConfig, store?: RateLimiterStore) {
    this.config = config;
    this.store = store ?? defaultStore;
  }

  /**
   * Check if a request should be allowed for the given identifier.
   *
   * @param identifier - Typically an IP address or user ID
   * @returns true if allowed, false if rate limited
   */
  async check(identifier: string): Promise<boolean> {
    const result = await this.store.check(
      `${this.config.name}:${identifier}`,
      this.config.maxRequests,
      this.config.windowMs,
    );

    if (!result.allowed) {
      logger.warn("Rate limit exceeded", {
        limiter: this.config.name,
        identifier: identifier.substring(0, 20), // Truncate for privacy
        requestId: undefined as unknown as string,
      });
    }

    return result.allowed;
  }

  /**
   * Apply rate limiting — throws AppError if rate limited.
   */
  async enforce(identifier: string): Promise<void> {
    const allowed = await this.check(identifier);
    if (!allowed) {
      throw new AppError("RATE_LIMITED", "Too many requests. Please try again later.", {
        statusCode: 429,
      });
    }
  }

  getConfig(): RateLimiterConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Preconfigured rate limiters for every endpoint category
// ============================================================================

/** Auth: 10 requests per minute per IP */
export const authRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  name: "auth",
});

/** Login/auth initiation: 5 requests per minute per IP */
export const loginRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  name: "login",
});

/** General API: 60 requests per minute per IP */
export const apiRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  name: "api",
});

/** Profile updates: 10 requests per minute per user */
export const profileUpdateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  name: "profile_update",
});

/** Likes/dating actions: 30 requests per minute per user */
export const datingActionLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  name: "dating_actions",
});

/** Messages: 100 requests per minute per user */
export const messageLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  name: "messages",
});

/** Media uploads: 10 requests per minute per user */
export const uploadLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  name: "uploads",
});

/** Comments: 20 requests per minute per user */
export const commentLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  name: "comments",
});

/** Reports: 5 requests per minute per user */
export const reportLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  name: "reports",
});

/** Search: 30 requests per minute per user */
export const searchLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  name: "search",
});

/** AI requests: 10 requests per minute per user */
export const aiLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  name: "ai_requests",
});

/** Admin APIs: 120 requests per minute per admin */
export const adminLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  name: "admin",
});

/** Post creation: 6 requests per minute per user */
export const postCreationLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 6,
  name: "post_creation",
});

/** Story creation: 4 requests per minute per user */
export const storyLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 4,
  name: "stories",
});

/** Account/data operations: 3 requests per minute per user */
export const accountOperationLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 3,
  name: "account_ops",
});

/** Billing/payment operations: 5 requests per minute per user */
export const billingLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  name: "billing",
});
