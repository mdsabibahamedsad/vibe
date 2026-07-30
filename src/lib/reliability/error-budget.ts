/**
 * Error Budget Tracking
 *
 * An error budget represents the acceptable amount of unreliability
 * within a service-level objective (SLO) over a given period.
 *
 * This module tracks:
 *  - Total requests per service
 *  - Failed requests (errors + latency violations)
 *  - Budget consumption
 *  - Budget remaining
 *
 * Usage:
 *   import { errorBudget } from "@/lib/reliability/error-budget";
 *
 *   // Record an API call result
 *   errorBudget.record("authentication", true, 120);
 *   errorBudget.record("authentication", false, 5000);
 *
 *   // Get budget status
 *   const status = errorBudget.getBudgetStatus("authentication");
 *   console.log(status); // { budgetRemaining: 0.97, isExhausted: false, ... }
 *
 * SLOs are defined in docs/reliability.md and fed into this tracker
 * to ensure we stay within operational boundaries.
 */

import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface SloDefinition {
  /** Target availability (e.g., 0.999 = 99.9%) */
  targetAvailability: number;
  /** Target latency P95 in milliseconds */
  targetLatencyP95Ms: number;
  /** Measurement period in days (default: 30) */
  periodDays?: number;
}

export interface ServiceRecord {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  slowRequests: number; // Exceeded latency SLO
  totalDurationMs: number;
}

export interface BudgetStatus {
  serviceName: string;
  /** Current availability */
  currentAvailability: number;
  /** Target availability */
  targetAvailability: number;
  /** Error budget for the period (1 - targetAvailability) */
  errorBudget: number;
  /**
   * Effective errors counted against the budget.
   * Capped at maxAllowedErrors (i.e., when this equals maxAllowedErrors,
   * the budget is fully consumed). The actual error count may be higher.
   */
  effectiveBudgetErrors: number;
  /** Actual total errors (requests that failed or exceeded latency SLO) */
  actualErrors: number;
  /** Budget remaining (0.0 = exhausted, 1.0 = fully available) */
  budgetRemaining: number;
  /** Whether the budget is exhausted */
  isExhausted: boolean;
  /** Total requests in this period */
  totalRequests: number;
  /** Number of errors remaining before budget exhaustion */
  remainingBudgetErrors: number;
  /** Period end date */
  periodEnd: string;
}

// ============================================================================
// DEFAULT SLOS
// ============================================================================

/**
 * Service-Level Objectives.
 * These match the SLOs documented in docs/reliability.md.
 */
const DEFAULT_SLOS: Record<string, SloDefinition> = {
  authentication: { targetAvailability: 0.999, targetLatencyP95Ms: 2000, periodDays: 30 },
  feed: { targetAvailability: 0.995, targetLatencyP95Ms: 2000, periodDays: 30 },
  discovery: { targetAvailability: 0.995, targetLatencyP95Ms: 2000, periodDays: 30 },
  chat: { targetAvailability: 0.99, targetLatencyP95Ms: 500, periodDays: 30 },
  payments: { targetAvailability: 0.999, targetLatencyP95Ms: 5000, periodDays: 30 },
  media_upload: { targetAvailability: 0.99, targetLatencyP95Ms: 5000, periodDays: 30 },
  notifications: { targetAvailability: 0.99, targetLatencyP95Ms: 3000, periodDays: 30 },
  admin: { targetAvailability: 0.995, targetLatencyP95Ms: 3000, periodDays: 30 },
};

// ============================================================================
// ERROR BUDGET TRACKER
// ============================================================================

class ErrorBudgetTracker {
  private slos: Map<string, SloDefinition>;
  private records: Map<string, ServiceRecord>;
  private periodStart: number;

  constructor(slos?: Record<string, SloDefinition>) {
    this.slos = new Map(Object.entries(slos ?? DEFAULT_SLOS));
    this.records = new Map();
    this.periodStart = Date.now();
  }

  /**
   * Record a service request result.
   *
   * @param serviceName - Name of the service (must match SLO definition key)
   * @param success - Whether the request succeeded
   * @param durationMs - Request duration in milliseconds
   */
  record(serviceName: string, success: boolean, durationMs: number): void {
    const slo = this.slos.get(serviceName);
    if (!slo) return; // Unknown service, skip tracking

    const record = this.records.get(serviceName) ?? {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      slowRequests: 0,
      totalDurationMs: 0,
    };

    record.totalRequests++;
    record.totalDurationMs += durationMs;

    if (success) {
      record.successfulRequests++;
    } else {
      record.failedRequests++;
    }

    // Track latency SLO violations
    if (durationMs > slo.targetLatencyP95Ms) {
      record.slowRequests++;
    }

    this.records.set(serviceName, record);

    // Check budget exhaustion after recording
    const status = this.getBudgetStatus(serviceName);
    if (status.isExhausted) {
      logger.warn("Error budget exhausted", {
        service: serviceName,
        budgetRemaining: status.budgetRemaining,
        effectiveBudgetErrors: status.effectiveBudgetErrors,
        actualErrors: status.actualErrors,
        totalRequests: status.totalRequests,
      });
    }
  }

  /**
   * Get the current error budget status for a service.
   */
  getBudgetStatus(serviceName: string): BudgetStatus {
    const slo = this.slos.get(serviceName);
    const record = this.records.get(serviceName);
    const periodDays = slo?.periodDays ?? 30;
    const periodEndMs = this.periodStart + periodDays * 24 * 60 * 60 * 1000;

    if (!slo || !record || record.totalRequests === 0) {
      return {
        serviceName,
        currentAvailability: 1,
        targetAvailability: slo?.targetAvailability ?? 0.99,
        errorBudget: slo ? 1 - slo.targetAvailability : 0.01,
        effectiveBudgetErrors: 0,
        actualErrors: 0,
        budgetRemaining: 1,
        isExhausted: false,
        totalRequests: 0,
        remainingBudgetErrors: Infinity,
        periodEnd: new Date(periodEndMs).toISOString(),
      };
    }

    const errorBudget = 1 - slo.targetAvailability;
    const currentAvailability =
      record.totalRequests > 0
        ? record.successfulRequests / record.totalRequests
        : 1;

    // Actual errors (all failed requests)
    const actualErrors = record.failedRequests;

    // Maximum allowed errors for the current request volume
    const maxAllowedErrors = Math.floor(record.totalRequests * errorBudget);

    // Effective errors counted against budget (capped at maxAllowedErrors)
    const effectiveBudgetErrors = Math.min(actualErrors, maxAllowedErrors);

    // Budget remaining (0 = exhausted, 1 = fully available)
    const budgetRemaining =
      maxAllowedErrors > 0
        ? Math.max(0, 1 - effectiveBudgetErrors / maxAllowedErrors)
        : actualErrors > 0
          ? 0
          : 1;

    const remainingBudgetErrors =
      actualErrors < maxAllowedErrors ? maxAllowedErrors - actualErrors : 0;

    return {
      serviceName,
      currentAvailability,
      targetAvailability: slo.targetAvailability,
      errorBudget,
      effectiveBudgetErrors,
      actualErrors,
      budgetRemaining,
      isExhausted: budgetRemaining <= 0,
      totalRequests: record.totalRequests,
      remainingBudgetErrors,
      periodEnd: new Date(periodEndMs).toISOString(),
    };
  }

  /**
   * Get budget status for all tracked services.
   */
  getAllBudgetStatuses(): Record<string, BudgetStatus> {
    const statuses: Record<string, BudgetStatus> = {};
    for (const serviceName of this.slos.keys()) {
      statuses[serviceName] = this.getBudgetStatus(serviceName);
    }
    return statuses;
  }

  /**
   * Get services with exhausted budgets.
   */
  getExhaustedServices(): string[] {
    const exhausted: string[] = [];
    for (const serviceName of this.slos.keys()) {
      const status = this.getBudgetStatus(serviceName);
      if (status.isExhausted) {
        exhausted.push(serviceName);
      }
    }
    return exhausted;
  }

  /**
   * Reset the tracking period (e.g., at the start of a new month).
   */
  resetPeriod(): void {
    this.records.clear();
    this.periodStart = Date.now();
    logger.info("Error budget period reset", {
      periodStart: new Date(this.periodStart).toISOString(),
    });
  }

  /**
   * Get raw records for a service.
   */
  getRecord(serviceName: string): ServiceRecord | undefined {
    return this.records.get(serviceName);
  }

  /**
   * Get all raw records.
   */
  getAllRecords(): Map<string, ServiceRecord> {
    return new Map(this.records);
  }
}

// Singleton instance
export const errorBudget = new ErrorBudgetTracker();
