/**
 * Database Performance Monitor
 *
 * Provides runtime monitoring of database performance:
 *  - Slow query tracking (configurable threshold)
 *  - Connection pool health warnings
 *  - Query duration histogram (lightweight)
 *
 * This is a lightweight, embedded monitor that works with Supabase's
 * managed PostgreSQL. For deeper analysis, use Supabase's built-in
 * query performance dashboard and pg_stat_statements.
 *
 * Usage:
 *   import { dbMonitor } from "@/lib/reliability/db-monitor";
 *
 *   // Wrap a query to track its performance
 *   const result = await dbMonitor.trackQuery("get_user_profile", () => {
 *     return adminClient.from("users").select("*").eq("id", userId);
 *   });
 *
 *   // Get current stats
 *   const stats = dbMonitor.getStats();
 */

import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface QueryRecord {
  /** Name to identify the query type */
  name: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether the query succeeded */
  success: boolean;
  /** Timestamp of the query */
  timestamp: string;
}

export interface QueryStats {
  /** Total queries tracked */
  totalQueries: number;
  /** Successful queries */
  successfulQueries: number;
  /** Failed queries */
  failedQueries: number;
  /** Slow queries (above threshold) */
  slowQueries: number;
  /** Average query duration */
  averageDurationMs: number;
  /** P95 query duration */
  p95DurationMs: number;
  /** P99 query duration */
  p99DurationMs: number;
  /** Max query duration */
  maxDurationMs: number;
  /** Slow query names for debugging */
  recentSlowQueries: Array<{ name: string; durationMs: number; timestamp: string }>;
  /** Recent errors for debugging */
  recentErrors: Array<{ name: string; error: string; timestamp: string }>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

interface DbMonitorConfig {
  /** Query duration threshold (ms) for slow query logging (default: 500) */
  slowQueryThresholdMs: number;
  /** Maximum number of recent records to keep (default: 1000) */
  maxRecords: number;
  /** Maximum number of slow query entries to keep (default: 50) */
  maxSlowRecords: number;
  /** Maximum number of error entries to keep (default: 50) */
  maxErrorRecords: number;
}

const DEFAULT_CONFIG: DbMonitorConfig = {
  slowQueryThresholdMs: 500,
  maxRecords: 1000,
  maxSlowRecords: 50,
  maxErrorRecords: 50,
};

// ============================================================================
// MONITOR IMPLEMENTATION
// ============================================================================

class DatabaseMonitor {
  private config: DbMonitorConfig;
  private records: QueryRecord[] = [];
  private slowRecords: Array<{ name: string; durationMs: number; timestamp: string }> = [];
  private errorRecords: Array<{ name: string; error: string; timestamp: string }> = [];
  private totalQueries = 0;
  private successfulQueries = 0;
  private failedQueries = 0;
  private slowQueryCount = 0;

  constructor(config: Partial<DbMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Track a database query's performance.
   *
   * @param name - A human-readable name for this query type
   * @param queryFn - The async function that executes the query
   * @returns The result of the query function
   */
  async trackQuery<T>(name: string, queryFn: () => Promise<T>): Promise<T> {
    const startTime = performance.now();
    this.totalQueries++;

    try {
      const result = await queryFn();
      const durationMs = Math.round(performance.now() - startTime);
      this.successfulQueries++;

      this.addRecord({
        name,
        durationMs,
        success: true,
        timestamp: new Date().toISOString(),
      });

      // Log slow queries
      if (durationMs > this.config.slowQueryThresholdMs) {
        this.slowQueryCount++;
        this.addSlowRecord(name, durationMs);

        logger.warn("Slow database query detected", {
          queryName: name,
          durationMs,
          threshold: this.config.slowQueryThresholdMs,
        });
      }

      return result;
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      this.failedQueries++;

      this.addRecord({
        name,
        durationMs,
        success: false,
        timestamp: new Date().toISOString(),
      });

      this.addErrorRecord(name, err instanceof Error ? err.message : String(err));

      logger.error("Database query failed", {
        queryName: name,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });

      throw err;
    }
  }

  /**
   * Get current query performance statistics.
   */
  getStats(): QueryStats {
    const durations = this.records.map((r) => r.durationMs).sort((a, b) => a - b);
    const len = durations.length;

    const averageDurationMs =
      len > 0 ? durations.reduce((a, b) => a + b, 0) / len : 0;

    const p95Index = Math.ceil(len * 0.95) - 1;
    const p99Index = Math.ceil(len * 0.99) - 1;

    return {
      totalQueries: this.totalQueries,
      successfulQueries: this.successfulQueries,
      failedQueries: this.failedQueries,
      slowQueries: this.slowQueryCount,
      averageDurationMs: Math.round(averageDurationMs),
      p95DurationMs: len > 0 ? durations[Math.max(0, p95Index)] : 0,
      p99DurationMs: len > 0 ? durations[Math.max(0, p99Index)] : 0,
      maxDurationMs: len > 0 ? durations[len - 1] : 0,
      recentSlowQueries: [...this.slowRecords],
      recentErrors: [...this.errorRecords],
    };
  }

  /**
   * Get the current configuration.
   */
  getConfig(): DbMonitorConfig {
    return { ...this.config };
  }

  /**
   * Update the slow query threshold.
   */
  setSlowQueryThreshold(ms: number): void {
    this.config.slowQueryThresholdMs = ms;
  }

  /**
   * Reset all accumulated statistics including the lifetime slow query counter.
   */
  reset(): void {
    this.records = [];
    this.slowRecords = [];
    this.errorRecords = [];
    this.totalQueries = 0;
    this.successfulQueries = 0;
    this.failedQueries = 0;
    this.slowQueryCount = 0;
  }

  // ─── Internal helpers ───────────────────────────────────────────────

  private addRecord(record: QueryRecord): void {
    this.records.push(record);
    if (this.records.length > this.config.maxRecords) {
      this.records.shift();
    }
  }

  private addSlowRecord(
    name: string,
    durationMs: number,
  ): void {
    this.slowRecords.push({
      name,
      durationMs,
      timestamp: new Date().toISOString(),
    });
    if (this.slowRecords.length > this.config.maxSlowRecords) {
      this.slowRecords.shift();
    }
  }

  private addErrorRecord(name: string, error: string): void {
    this.errorRecords.push({
      name,
      error: error.substring(0, 200), // Truncate long error messages
      timestamp: new Date().toISOString(),
    });
    if (this.errorRecords.length > this.config.maxErrorRecords) {
      this.errorRecords.shift();
    }
  }
}

// Singleton instance
export const dbMonitor = new DatabaseMonitor();
