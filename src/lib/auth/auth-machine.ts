/**
 * Deterministic authentication state machine + retry helpers.
 *
 * Pure logic (no React, no network) so it can be unit-tested:
 *   - `nextAuthState` — every allowed status transition in one place.
 *   - `retryDelayMs` — bounded exponential backoff with jitter cap.
 *   - `classifyAuthError` — distinguishes timeouts / network / server /
 *     credential failures so the UI can show the right message.
 *
 * Auth status lifecycle:
 *
 *   INITIALIZING ──▶ AUTHENTICATING ──▶ AUTHENTICATED
 *        │                │ ▲               │
 *        │                │ └── RETRYING ────┘ (bounded retries)
 *        ▼                ▼
 *   UNAUTHENTICATED   AUTH_ERROR ──▶ RETRY (manual retry button)
 *
 * There is intentionally NO realtime/WebSocket state here: VIBE ships no
 * realtime socket, and Telegram's own internal `apiws` connection (visible
 * in some Telegram Web clients) is external infrastructure noise that must
 * never gate application access.
 */

/** Explicit auth bootstrap states. No ambiguous "loading forever". */
export type AuthMachineState =
  | "initializing"
  | "authenticating"
  | "retrying"
  | "authenticated"
  | "unauthenticated"
  | "error";

/** Events that drive the machine. */
export type AuthMachineEvent =
  | "SESSION_FOUND"
  | "NO_SESSION"
  | "AUTH_START"
  | "AUTH_SUCCESS"
  | "AUTH_FAILURE_RETRYABLE"
  | "AUTH_FAILURE_FATAL"
  | "RETRY"
  | "RETRIES_EXHAUSTED"
  | "LOGOUT"
  | "SESSION_INVALID";

/** Legacy UI-facing statuses mapped from the machine. */
export type LegacyAuthStatus =
  | "loading"
  | "authenticating"
  | "authenticated"
  | "unauthenticated"
  | "error";

const TRANSITIONS: Record<AuthMachineState, Partial<Record<AuthMachineEvent, AuthMachineState>>> = {
  initializing: {
    SESSION_FOUND: "authenticating",
    NO_SESSION: "unauthenticated",
    AUTH_START: "authenticating",
    LOGOUT: "unauthenticated",
  },
  authenticating: {
    AUTH_SUCCESS: "authenticated",
    AUTH_FAILURE_RETRYABLE: "retrying",
    AUTH_FAILURE_FATAL: "unauthenticated",
    LOGOUT: "unauthenticated",
  },
  retrying: {
    AUTH_START: "authenticating",
    AUTH_SUCCESS: "authenticated",
    AUTH_FAILURE_RETRYABLE: "retrying",
    AUTH_FAILURE_FATAL: "unauthenticated",
    RETRIES_EXHAUSTED: "error",
    LOGOUT: "unauthenticated",
  },
  authenticated: {
    SESSION_INVALID: "authenticating",
    LOGOUT: "unauthenticated",
  },
  unauthenticated: {
    AUTH_START: "authenticating",
    RETRY: "authenticating",
  },
  error: {
    RETRY: "authenticating",
    AUTH_START: "authenticating",
    LOGOUT: "unauthenticated",
  },
};

/**
 * Compute the next state. Returns the current state unchanged for
 * events that are not valid in that state (invalid transitions are
 * ignored, never crash).
 */
export function nextAuthState(
  current: AuthMachineState,
  event: AuthMachineEvent,
): AuthMachineState {
  return TRANSITIONS[current][event] ?? current;
}

/** Map machine state to the legacy status consumed by existing UI hooks. */
export function toLegacyStatus(state: AuthMachineState): LegacyAuthStatus {
  switch (state) {
    case "initializing":
      return "loading";
    case "authenticating":
    case "retrying":
      return "authenticating";
    case "authenticated":
      return "authenticated";
    case "unauthenticated":
      return "unauthenticated";
    case "error":
      return "error";
  }
}

// ============================================================================
// Bounded retry with exponential backoff
// ============================================================================

export const AUTH_MAX_ATTEMPTS = 3;
export const AUTH_RETRY_BASE_DELAY_MS = 1000;
export const AUTH_RETRY_MAX_DELAY_MS = 8000;
/** Hard timeout for a single authentication HTTP request. */
export const AUTH_REQUEST_TIMEOUT_MS = 15000;
/** `fetch` does not throw a stable error for timeouts — we tag it ourselves. */
export const AUTH_TIMEOUT_ERROR_NAME = "AuthTimeoutError";

/**
 * Delay before attempt `attempt` (1-indexed). Exponential: 1s, 2s, 4s…
 * capped at AUTH_RETRY_MAX_DELAY_MS. No jitter (deterministic for tests);
 * callers add jitter if they want it.
 */
export function retryDelayMs(attempt: number): number {
  if (attempt < 1) return AUTH_RETRY_BASE_DELAY_MS;
  const delay = AUTH_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
  return Math.min(delay, AUTH_RETRY_MAX_DELAY_MS);
}

/** True while another automatic attempt is still allowed. */
export function shouldRetry(attemptsMade: number, maxAttempts: number = AUTH_MAX_ATTEMPTS): boolean {
  return attemptsMade < maxAttempts;
}

// ============================================================================
// Error classification (drives UI copy + retry decisions)
// ============================================================================

export type AuthErrorKind = "timeout" | "network" | "server" | "credentials" | "unknown";

export interface ClassifiedAuthError {
  kind: AuthErrorKind;
  /** Safe, user-facing message (never contains secrets). */
  message: string;
  /** Whether an automatic retry makes sense. */
  retryable: boolean;
}

/**
 * Classify an authentication failure. `status` is the HTTP status when the
 * request reached the server; `error` is the thrown value otherwise.
 */
export function classifyAuthError(error: unknown, status?: number): ClassifiedAuthError {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (
    (error instanceof Error && error.name === AUTH_TIMEOUT_ERROR_NAME) ||
    (error instanceof Error && error.name === "TimeoutError") ||
    /timed out|timeout|TIMEOUT|AbortError|aborted/i.test(message)
  ) {
    return {
      kind: "timeout",
      message: "Authentication timed out. Please check your connection and try again.",
      retryable: true,
    };
  }

  if (
    error instanceof TypeError ||
    /failed to fetch|networkerror|network request failed|load failed/i.test(message)
  ) {
    return {
      kind: "network",
      message: "Network error. Please check your connection and try again.",
      retryable: true,
    };
  }

  if (typeof status === "number") {
    if (status === 400 || status === 401) {
      return {
        kind: "credentials",
        message: "Telegram authentication was rejected. Please reopen the app from Telegram.",
        retryable: false,
      };
    }
    if (status === 429) {
      return {
        kind: "server",
        message: "Too many attempts. Please wait a moment and try again.",
        retryable: true,
      };
    }
    if (status >= 500) {
      return {
        kind: "server",
        message: "Authentication service is temporarily unavailable. Please try again.",
        retryable: true,
      };
    }
  }

  return {
    kind: "unknown",
    message: "Authentication failed. Please try again.",
    retryable: true,
  };
}

/**
 * Wrap a promise with a timeout. On timeout rejects with an Error named
 * `AuthTimeoutError` (stable across browsers — unlike DOMException names).
 */
export function withAuthTimeout<T>(promise: Promise<T>, timeoutMs: number = AUTH_REQUEST_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Authentication timed out after ${timeoutMs}ms`);
      err.name = AUTH_TIMEOUT_ERROR_NAME;
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
