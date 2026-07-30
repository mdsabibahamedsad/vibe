/**
 * Application logging abstraction.
 *
 * Provides structured logging with different severity levels.
 * Supports request correlation via requestId/traceId fields.
 *
 * In development, logs are verbose. In production, logs respect
 * the LOG_LEVEL environment variable (default: "warn").
 *
 * IMPORTANT: Never log:
 *  - Bot tokens
 *  - Service-role keys
 *  - Private messages
 *  - Sensitive personal information
 *  - Authentication secrets
 *  - Verification documents
 */

import crypto from "crypto";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  if (process.env.NODE_ENV === "development") return "debug";
  return (process.env.LOG_LEVEL as LogLevel) || "warn";
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[getConfiguredLevel()];
}

/** Keys that should be redacted in logs */
const SENSITIVE_KEYS = [
  "token",
  "secret",
  "password",
  "key",
  "authorization",
  "cookie",
  "session",
  "access_token",
  "refresh_token",
  "service_role_key",
  "private_key",
  "api_key",
  "bot_token",
];

/**
 * Recursively sanitize data by redacting sensitive fields.
 */
function sanitizeForLogging(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return data;

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.some((sk) => key.toLowerCase().includes(sk))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeForLogging(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Generate a short unique request ID for correlation.
 */
export function generateRequestId(): string {
  return crypto.randomBytes(8).toString("hex");
}

/**
 * Extract request ID from headers, or generate a new one.
 */
export function getOrCreateRequestId(request?: Request): string {
  if (!request) return generateRequestId();
  const existing = request.headers.get("x-request-id");
  if (existing) return existing;
  return generateRequestId();
}

/**
 * Structured log context with optional request correlation.
 */
export interface LogContext {
  /** Request ID for correlation across services */
  requestId?: string;
  /** Optional trace ID for distributed tracing */
  traceId?: string;
  /** Additional context fields */
  [key: string]: unknown;
}

function log(
  level: LogLevel,
  message: string,
  contextOrArgs?: LogContext | unknown,
  ...args: unknown[]
): void {
  if (!shouldLog(level)) return;

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [Vibe]`;

  // Support both structured context object and the old positional-args pattern.
  // If the first argument is a plain object (not null, not array), treat it as
  // a structured LogContext. Otherwise fall back to the classic spread pattern.
  const isStructuredContext =
    contextOrArgs !== null &&
    contextOrArgs !== undefined &&
    typeof contextOrArgs === "object" &&
    !Array.isArray(contextOrArgs);

  if (isStructuredContext) {
    // New structured logging: context is a LogContext object
    const context = contextOrArgs as LogContext;
    const output: Record<string, unknown> = {
      message,
      timestamp,
      level,
      ...context,
    };
    const sanitized = sanitizeForLogging(output) as Record<string, unknown>;
    const line = JSON.stringify(sanitized);
    emitLog(level, prefix, line);
  } else {
    // Legacy positional-args pattern: message, key1, value1, key2, value2, ...
    // or message, errorObject, ...
    const allArgs = contextOrArgs !== undefined ? [contextOrArgs, ...args] : args;
    const sanitizedArgs = allArgs.map((arg) => sanitizeForLogging(arg));
    emitLogLegacy(level, prefix, message, sanitizedArgs);
  }
}

/** Emit JSON-structured log line */
function emitLog(level: LogLevel, prefix: string, line: string): void {
  switch (level) {
    case "error":
      console.error(prefix, line);
      break;
    case "warn":
      console.warn(prefix, line);
      break;
    case "info":
      console.info(prefix, line);
      break;
    case "debug":
      console.debug(prefix, line);
      break;
  }
}

/** Emit legacy spread-args log line (backward compatible) */
function emitLogLegacy(level: LogLevel, prefix: string, message: string, sanitizedArgs: unknown[]): void {
  switch (level) {
    case "error":
      console.error(prefix, message, ...sanitizedArgs);
      break;
    case "warn":
      console.warn(prefix, message, ...sanitizedArgs);
      break;
    case "info":
      console.info(prefix, message, ...sanitizedArgs);
      break;
    case "debug":
      console.debug(prefix, message, ...sanitizedArgs);
      break;
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => log("debug", message, context),
  info: (message: string, context?: LogContext) => log("info", message, context),
  warn: (message: string, context?: LogContext) => log("warn", message, context),
  error: (message: string, context?: LogContext) => log("error", message, context),
  perf: (message: string, durationMs: number, context?: LogContext) =>
    log("info", `${message} [${durationMs}ms]`, context),
};

export type Logger = {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  perf: (message: string, durationMs: number, context?: LogContext) => void;
};
