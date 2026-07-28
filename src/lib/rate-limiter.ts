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

// Cleanup expired entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => defaultStore.cleanup(), 5 * 60 * 1000);
}

/**
 * Default rate limiter for authentication endpoints.
 * Uses the in-memory store by default.
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
        identifier,
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
    return this.config;
  }
}

/**
 * Preconfigured rate limiters for common endpoints.
 */

/** Auth endpoint: 10 requests per minute per IP */
export const authRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  name: "auth",
});

/** API general: 60 requests per minute per IP */
export const apiRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  name: "api",
});
