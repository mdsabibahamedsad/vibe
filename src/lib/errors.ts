import type { ErrorCode } from "@/types";

/**
 * Application-level error class.
 *
 * Provides a consistent error structure across the application.
 * Errors are:
 *  - predictable (typed ErrorCode)
 *  - safe for users (no secret leakage)
 *  - useful for developers (includes context)
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly context?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      statusCode?: number;
      context?: Record<string, unknown>;
      cause?: Error;
    },
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = options?.statusCode ?? 500;
    this.context = options?.context;
    this.cause = options?.cause;
  }

  /** Returns a safe error response object (no sensitive details) */
  toSafeResponse(): { error: string; code: ErrorCode } {
    // In production, hide internal error details from the user
    if (this.statusCode >= 500 && process.env.NODE_ENV === "production") {
      return {
        error: "An unexpected error occurred. Please try again later.",
        code: "INTERNAL_ERROR",
      };
    }

    return {
      error: this.message,
      code: this.code,
    };
  }
}

/** Create a validation error (user input errors) */
export function validationError(message: string, context?: Record<string, unknown>): AppError {
  return new AppError("VALIDATION_ERROR", message, { statusCode: 400, context });
}

/** Create an authentication error */
export function authenticationError(message = "Authentication required"): AppError {
  return new AppError("AUTHENTICATION_ERROR", message, { statusCode: 401 });
}

/** Create an authorization error */
export function authorizationError(
  message = "You do not have permission to perform this action",
): AppError {
  return new AppError("AUTHORIZATION_ERROR", message, { statusCode: 403 });
}

/** Create a not-found error */
export function notFoundError(message = "Resource not found"): AppError {
  return new AppError("NOT_FOUND", message, { statusCode: 404 });
}

/** Create a conflict error */
export function conflictError(message: string): AppError {
  return new AppError("CONFLICT", message, { statusCode: 409 });
}

/** Create a rate-limit error */
export function rateLimitError(message = "Too many requests. Please try again later."): AppError {
  return new AppError("RATE_LIMITED", message, { statusCode: 429 });
}
