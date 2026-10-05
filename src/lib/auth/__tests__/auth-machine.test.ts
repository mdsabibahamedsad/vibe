import { describe, expect, it } from "vitest";
import {
  AUTH_MAX_ATTEMPTS,
  AUTH_REQUEST_TIMEOUT_MS,
  AUTH_TIMEOUT_ERROR_NAME,
  classifyAuthError,
  nextAuthState,
  retryDelayMs,
  shouldRetry,
  toLegacyStatus,
  withAuthTimeout,
} from "@/lib/auth/auth-machine";

describe("nextAuthState", () => {
  it("reaches authenticated on the happy path", () => {
    expect(nextAuthState("initializing", "AUTH_START")).toBe("authenticating");
    expect(nextAuthState("authenticating", "AUTH_SUCCESS")).toBe("authenticated");
  });

  it("maps missing session to unauthenticated (never stuck loading)", () => {
    expect(nextAuthState("initializing", "NO_SESSION")).toBe("unauthenticated");
  });

  it("moves retryable failures to retrying, fatal ones to unauthenticated", () => {
    expect(nextAuthState("authenticating", "AUTH_FAILURE_RETRYABLE")).toBe("retrying");
    expect(nextAuthState("authenticating", "AUTH_FAILURE_FATAL")).toBe("unauthenticated");
  });

  it("exhausts retries into error, and error can retry", () => {
    expect(nextAuthState("retrying", "RETRIES_EXHAUSTED")).toBe("error");
    expect(nextAuthState("error", "RETRY")).toBe("authenticating");
  });

  it("ignores invalid transitions instead of crashing", () => {
    expect(nextAuthState("authenticated", "NO_SESSION")).toBe("authenticated");
    expect(nextAuthState("error", "AUTH_SUCCESS")).toBe("error");
  });

  it("logout always lands unauthenticated", () => {
    expect(nextAuthState("authenticated", "LOGOUT")).toBe("unauthenticated");
    expect(nextAuthState("retrying", "LOGOUT")).toBe("unauthenticated");
    expect(nextAuthState("error", "LOGOUT")).toBe("unauthenticated");
  });
});

describe("toLegacyStatus", () => {
  it("never maps the no-session outcome back to loading", () => {
    expect(toLegacyStatus("unauthenticated")).toBe("unauthenticated");
    expect(toLegacyStatus("initializing")).toBe("loading");
    expect(toLegacyStatus("retrying")).toBe("authenticating");
  });
});

describe("retry backoff", () => {
  it("backs off exponentially and caps the delay", () => {
    expect(retryDelayMs(1)).toBe(1000);
    expect(retryDelayMs(2)).toBe(2000);
    expect(retryDelayMs(3)).toBe(4000);
    expect(retryDelayMs(99)).toBeLessThanOrEqual(8000);
  });

  it("bounds automatic attempts", () => {
    expect(shouldRetry(0)).toBe(true);
    expect(shouldRetry(AUTH_MAX_ATTEMPTS - 1)).toBe(true);
    expect(shouldRetry(AUTH_MAX_ATTEMPTS)).toBe(false);
    expect(shouldRetry(999)).toBe(false);
  });
});

describe("classifyAuthError", () => {
  it("detects timeouts as retryable", () => {
    const err = new Error("Authentication timed out after 15000ms");
    err.name = AUTH_TIMEOUT_ERROR_NAME;
    expect(classifyAuthError(err).kind).toBe("timeout");
    expect(classifyAuthError(err).retryable).toBe(true);
  });

  it("detects network failures as retryable", () => {
    expect(classifyAuthError(new TypeError("Failed to fetch")).kind).toBe("network");
    expect(classifyAuthError(new TypeError("Failed to fetch")).retryable).toBe(true);
  });

  it("treats 401 as non-retryable credentials failure", () => {
    const c = classifyAuthError(new Error("Unauthorized"), 401);
    expect(c.kind).toBe("credentials");
    expect(c.retryable).toBe(false);
  });

  it("treats 5xx as retryable server failure", () => {
    const c = classifyAuthError(new Error("boom"), 500);
    expect(c.kind).toBe("server");
    expect(c.retryable).toBe(true);
  });

  it("never leaks the raw error text into the user message", () => {
    const secret = "bot123:SECRET-TOKEN-xyz";
    const c = classifyAuthError(new Error(`fetch ${secret} failed to fetch`));
    expect(c.message).not.toContain(secret);
  });
});

describe("withAuthTimeout", () => {
  it("resolves fast promises normally", async () => {
    await expect(withAuthTimeout(Promise.resolve("ok"), 1000)).resolves.toBe("ok");
  });

  it("rejects hanging promises with a stable timeout error", async () => {
    const hanging = new Promise<string>(() => {});
    await expect(withAuthTimeout(hanging, 20)).rejects.toMatchObject({
      name: AUTH_TIMEOUT_ERROR_NAME,
    });
  });

  it("uses the default auth request timeout", () => {
    expect(AUTH_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
