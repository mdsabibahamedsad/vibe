/**
 * Application logging abstraction.
 *
 * Provides structured logging with different severity levels.
 * In development, logs are verbose. In production, logs respect
 * the LOG_LEVEL environment variable (default: "warn").
 *
 * IMPORTANT: Never log:
 *  - Bot tokens
 *  - Service-role keys
 *  - Private messages
 *  - Sensitive personal information
 *  - Authentication secrets
 */

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

function sanitizeForLogging(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return data;

  const sensitiveKeys = [
    "token",
    "secret",
    "password",
    "key",
    "authorization",
    "cookie",
    "session",
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeForLogging(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function log(level: LogLevel, message: string, ...args: unknown[]): void {
  if (!shouldLog(level)) return;

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [Vibe]`;

  const sanitizedArgs = args.map((arg) => sanitizeForLogging(arg));

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
  debug: (message: string, ...args: unknown[]) => log("debug", message, ...args),
  info: (message: string, ...args: unknown[]) => log("info", message, ...args),
  warn: (message: string, ...args: unknown[]) => log("warn", message, ...args),
  error: (message: string, ...args: unknown[]) => log("error", message, ...args),
};
