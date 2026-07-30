/**
 * Centralized HTTP Client
 *
 * Provides a consistent HTTP client across the application with:
 *  - Configurable timeouts (no indefinite requests)
 *  - Exponential backoff with jitter
 *  - Circuit breaker integration for external services
 *  - Request correlation (trace IDs)
 *  - Structured error logging
 *
 * Usage:
 *   const response = await httpClient.get('https://api.example.com/data', {
 *     timeout: 5000,
 *     retries: 3,
 *     headers: { Authorization: 'Bearer ...' },
 *   });
 *
 *   // With circuit breaker:
 *   import { telegramBreaker } from './circuit-breaker';
 *   const response = await httpClient.get('https://api.telegram.org/...', {
 *     timeout: 5000,
 *     circuitBreaker: telegramBreaker,
 *   });
 */

import { logger } from "@/lib/logger";
import crypto from "crypto";

// ============================================================================
// TYPES
// ============================================================================

export interface HttpClientConfig {
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Number of retry attempts (default: 0) */
  retries?: number;
  /** Retry delay base in milliseconds (default: 1000) */
  retryDelayMs?: number;
  /** Circuit breaker instance to use */
  circuitBreaker?: {
    callWithFallback<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T>;
    call<T>(fn: () => Promise<T>): Promise<T>;
  };
  /** Additional headers */
  headers?: Record<string, string>;
  /** AbortSignal for external cancellation */
  signal?: AbortSignal;
  /** Whether to include trace ID in headers (default: true) */
  includeTraceId?: boolean;
  /**
   * Allow retrying non-idempotent methods (POST, PATCH) on timeout.
   * Only enable if the downstream API supports idempotency.
   * Default: false.
   */
  retryNonIdempotentOnTimeout?: boolean;
}

export interface HttpClientResponse<T = unknown> {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  data: T;
  /** Duration of the request in milliseconds */
  durationMs: number;
  /** Trace ID for correlation */
  traceId: string;
}

export class HttpClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly context?: { url?: string; method?: string; traceId?: string },
  ) {
    super(message);
    this.name = "HttpClientError";
  }
}

export class HttpClientTimeoutError extends HttpClientError {
  constructor(
    public readonly timeoutMs: number,
    context?: { url?: string; method?: string; traceId?: string },
  ) {
    super(408, `Request timed out after ${timeoutMs}ms`, context);
    this.name = "HttpClientTimeoutError";
  }
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 0;
const DEFAULT_RETRY_DELAY_MS = 1_000;

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

// ============================================================================
// CORE HTTP CLIENT
// ============================================================================

function generateTraceId(): string {
  return crypto.randomBytes(8).toString("hex");
}

/**
 * Determine if a method is safe to retry automatically.
 * Only idempotent methods are automatically retried.
 * POST, PATCH are NOT idempotent → not automatically retried.
 */
function isRetryableMethod(method: string): boolean {
  return IDEMPOTENT_METHODS.has(method.toUpperCase());
}

/**
 * Calculate backoff delay with jitter.
 * Uses: min(baseDelay * 2^attempt, maxDelay) + jitter
 */
function calculateBackoff(attempt: number, baseDelayMs: number, maxDelayMs = 30_000): number {
  const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  // Add random jitter of ±25%
  const jitter = exponentialDelay * (0.25 * (Math.random() * 2 - 1));
  return Math.round(exponentialDelay + jitter);
}

/**
 * Core request function with timeout, retry, and circuit breaker support.
 */
async function request<T>(
  method: string,
  url: string,
  body?: unknown,
  config: HttpClientConfig = {},
): Promise<HttpClientResponse<T>> {
  const timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
  const retries = config.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const traceId = generateTraceId();
  const startTime = performance.now();

  const executeRequest = async (): Promise<HttpClientResponse<T>> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Merge external signal with our timeout
    let signalCleanup: (() => void) | null = null;
    const signal = config.signal
      ? (() => {
          const { signal, cleanup } = anySignal([config.signal!, controller.signal]);
          signalCleanup = cleanup;
          return signal;
        })()
      : controller.signal;

    try {
      const headers: Record<string, string> = {
        ...(config.includeTraceId !== false ? { "x-trace-id": traceId } : {}),
        ...config.headers,
      };

      // Don't auto-set Content-Type for FormData (browser sets it with boundary)
      if (body !== undefined && !(body instanceof FormData)) {
        headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body instanceof FormData
          ? body
          : body !== undefined
            ? JSON.stringify(body)
            : undefined,
        signal,
      });

      const durationMs = Math.round(performance.now() - startTime);
      let data: T;

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        data = (await response.json()) as T;
      } else {
        data = (await response.text()) as unknown as T;
      }

      // Log slow requests
      if (durationMs > timeout * 0.8) {
        logger.warn("HTTP request near timeout", {
          method,
          url: sanitizeUrl(url),
          durationMs,
          timeout,
          traceId,
          status: response.status,
        });
      }

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data,
        durationMs,
        traceId,
      };
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);

      if (err instanceof DOMException && err.name === "AbortError") {
        // Determine if it was our timeout or external signal
        if (config.signal?.aborted) {
          throw new HttpClientError(0, "Request cancelled by external signal", {
            url: sanitizeUrl(url),
            method,
            traceId,
          });
        }
        throw new HttpClientTimeoutError(timeout, {
          url: sanitizeUrl(url),
          method,
          traceId,
        });
      }

      throw err;
    } finally {
      clearTimeout(timeoutId);
      signalCleanup?.();
    }
  };

  // Retry loop
  let lastError: Error | null = null;
  const methodIsIdempotent = isRetryableMethod(method);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // If circuit breaker is provided, wrap every attempt through it
      if (config.circuitBreaker) {
        return await config.circuitBreaker.call(() => executeRequest());
      }

      return await executeRequest();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      const isTimeout = err instanceof HttpClientTimeoutError;
      const isServerError = err instanceof HttpClientError && err.status >= 500;

      // Determine if this error is retryable:
      //   - Idempotent methods (GET, HEAD, PUT, DELETE): retry on timeout or 5xx
      //   - Non-idempotent methods (POST, PATCH): ONLY retry on timeout when explicitly allowed
      const canRetryOnIdempotent = methodIsIdempotent && (isTimeout || isServerError);
      const canRetryOnNonIdempotent = !methodIsIdempotent && isTimeout && config.retryNonIdempotentOnTimeout;

      if (!canRetryOnIdempotent && !canRetryOnNonIdempotent) {
        throw err;
      }

      if (attempt < retries) {
        const backoffMs = calculateBackoff(attempt, retryDelayMs);
        logger.warn("HTTP request failed, retrying", {
          method,
          url: sanitizeUrl(url),
          attempt: attempt + 1,
          maxRetries: retries,
          backoffMs,
          error: lastError.message,
          traceId,
          retryIdempotent: methodIsIdempotent,
        });
        await sleep(backoffMs);
      }
    }
  }

  // All retries exhausted
  const durationMs = Math.round(performance.now() - startTime);
  logger.error("HTTP request failed after all retries", {
    method,
    url: sanitizeUrl(url),
    retries,
    durationMs,
    error: lastError?.message,
    traceId,
  });

  throw lastError ?? new Error("HTTP request failed");
}

// ============================================================================
// PUBLIC API
// ============================================================================

export const httpClient = {
  get<T>(url: string, config?: HttpClientConfig): Promise<HttpClientResponse<T>> {
    return request<T>("GET", url, undefined, config);
  },

  post<T>(url: string, body?: unknown, config?: HttpClientConfig): Promise<HttpClientResponse<T>> {
    return request<T>("POST", url, body, config);
  },

  put<T>(url: string, body?: unknown, config?: HttpClientConfig): Promise<HttpClientResponse<T>> {
    return request<T>("PUT", url, body, config);
  },

  patch<T>(url: string, body?: unknown, config?: HttpClientConfig): Promise<HttpClientResponse<T>> {
    return request<T>("PATCH", url, body, config);
  },

  delete<T>(url: string, config?: HttpClientConfig): Promise<HttpClientResponse<T>> {
    return request<T>("DELETE", url, undefined, config);
  },
};

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Sanitize URL for logging (remove query params that may contain sensitive data).
 */
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Keep path, remove all query params for privacy
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    // If we can't parse, truncate
    return url.substring(0, 100);
  }
}

/**
 * Promise-based sleep.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a combined AbortSignal from multiple signals.
 * Fires when ANY of the provided signals abort.
 * Returns a cleanup function to remove event listeners after completion.
 */
function anySignal(signals: AbortSignal[]): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const cleanups: Array<() => void> = [];

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return {
        signal: controller.signal,
        cleanup: () => {/* already aborted, no listener attached */},
      };
    }

    const handler = () => controller.abort(signal.reason);
    signal.addEventListener("abort", handler, { once: true });
    cleanups.push(() => signal.removeEventListener("abort", handler));
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    },
  };
}
