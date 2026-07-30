/**
 * Circuit Breaker
 *
 * Prevents cascading failures by stopping calls to unhealthy dependencies.
 *
 * States:
 *   CLOSED  → Normal operation, calls pass through
 *   OPEN    → Calls fail immediately, dependency considered unhealthy
 *   HALF_OPEN → Probing if dependency has recovered
 *
 * After `failureThreshold` consecutive failures, the circuit opens.
 * After `resetTimeoutMs`, it transitions to HALF_OPEN and probes.
 * If the probe succeeds, the circuit closes. If it fails, it stays OPEN.
 *
 * Usage:
 *   const db = new CircuitBreaker('database', { failureThreshold: 5 });
 *   await db.call(() => someDatabaseQuery());
 */

import { logger } from "@/lib/logger";

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Milliseconds to wait before probing (HALF_OPEN) */
  resetTimeoutMs: number;
  /** Maximum number of concurrent calls (0 = unlimited) */
  maxConcurrency?: number;
}

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalCalls: number;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  openedAt: number | null;
  isDegraded: boolean;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  maxConcurrency: 0,
};

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private totalCalls = 0;
  private lastFailureAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private openedAt: number | null = null;
  private activeCalls = 0;

  constructor(
    public readonly name: string,
    private config: CircuitBreakerConfig = DEFAULT_CONFIG,
  ) {}

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitBreakerError if the circuit is open.
   */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    this.checkState();

    if (this.state === "OPEN") {
      throw new CircuitBreakerError(
        this.name,
        `Circuit breaker is OPEN for "${this.name}"`,
      );
    }

    // Concurrency limit
    if (this.config.maxConcurrency && this.activeCalls >= this.config.maxConcurrency) {
      throw new CircuitBreakerError(
        this.name,
        `Max concurrency (${this.config.maxConcurrency}) reached for "${this.name}"`,
      );
    }

    this.activeCalls++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    } finally {
      this.activeCalls--;
    }
  }

  /**
   * Execute with a fallback function when the circuit is open.
   */
  async callWithFallback<T>(
    fn: () => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T> {
    try {
      return await this.call(fn);
    } catch (err) {
      if (err instanceof CircuitBreakerError) {
        return fallback();
      }
      throw err;
    }
  }

  /**
   * Reset the circuit breaker to CLOSED state.
   */
  reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.openedAt = null;
    logger.info("Circuit breaker reset", { name: this.name });
  }

  /**
   * Force the circuit breaker to OPEN state.
   */
  forceOpen(): void {
    this.state = "OPEN";
    this.openedAt = Date.now();
    logger.warn("Circuit breaker forced open", { name: this.name });
  }

  /**
   * Get current stats for monitoring.
   */
  getStats(): CircuitBreakerStats {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalCalls: this.totalCalls,
      lastFailureAt: this.lastFailureAt,
      lastSuccessAt: this.lastSuccessAt,
      openedAt: this.openedAt,
      isDegraded: this.state !== "CLOSED",
    };
  }

  /**
   * Is the circuit currently allowing calls?
   */
  get isAllowed(): boolean {
    this.checkState();
    return this.state !== "OPEN";
  }

  private onSuccess(): void {
    this.totalCalls++;
    this.successCount++;
    this.lastSuccessAt = Date.now();

    if (this.state === "HALF_OPEN") {
      // Probe succeeded — close the circuit
      this.state = "CLOSED";
      this.failureCount = 0;
      this.openedAt = null;
      logger.info("Circuit breaker recovered", {
        name: this.name,
        failuresBeforeReset: this.failureCount,
      });
    } else {
      // Reset failure count on success (only if not in a problematic state)
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.totalCalls++;
    this.failureCount++;
    this.lastFailureAt = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      if (this.state === "CLOSED" || this.state === "HALF_OPEN") {
        this.state = "OPEN";
        this.openedAt = Date.now();
        logger.warn("Circuit breaker opened", {
          name: this.name,
          failureCount: this.failureCount,
          threshold: this.config.failureThreshold,
          resetTimeoutMs: this.config.resetTimeoutMs,
        });

        // Schedule transition to HALF_OPEN
        setTimeout(() => {
          if (this.state === "OPEN") {
            this.state = "HALF_OPEN";
            logger.info("Circuit breaker half-open", { name: this.name });
          }
        }, this.config.resetTimeoutMs);
      }
    }
  }

  private checkState(): void {
    // If OPEN and reset timeout has passed, transition to HALF_OPEN
    if (
      this.state === "OPEN" &&
      this.openedAt &&
      Date.now() - this.openedAt >= this.config.resetTimeoutMs
    ) {
      this.state = "HALF_OPEN";
      logger.info("Circuit breaker transitioning to half-open", { name: this.name });
    }
  }
}

export class CircuitBreakerError extends Error {
  constructor(
    public readonly serviceName: string,
    message: string,
  ) {
    super(message);
    this.name = "CircuitBreakerError";
  }
}

// ─── Pre-configured circuit breakers ─────────────────────────────────────

/** AI services — short timeout, quick to open */
export const aiServiceBreaker = new CircuitBreaker("ai_service", {
  failureThreshold: 3,
  resetTimeoutMs: 15000,
  maxConcurrency: 5,
});

/** Recommendation engine — non-critical, open fast */
export const recommendationBreaker = new CircuitBreaker("recommendation", {
  failureThreshold: 3,
  resetTimeoutMs: 10000,
  maxConcurrency: 10,
});

/** Telegram Bot API — important but can queue */
export const telegramBreaker = new CircuitBreaker("telegram_bot", {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  maxConcurrency: 20,
});

/** Search — non-critical fallback available */
export const searchBreaker = new CircuitBreaker("search", {
  failureThreshold: 3,
  resetTimeoutMs: 15000,
  maxConcurrency: 10,
});

/** Analytics — never critical, degrade silently */
export const analyticsBreaker = new CircuitBreaker("analytics", {
  failureThreshold: 10,
  resetTimeoutMs: 60000,
  maxConcurrency: 50,
});

/** Payment provider — critical, slow to open */
export const paymentBreaker = new CircuitBreaker("payment", {
  failureThreshold: 10,
  resetTimeoutMs: 60000,
  maxConcurrency: 10,
});
