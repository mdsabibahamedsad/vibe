"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { logger } from "@/lib/logger";
import {
  AUTH_REQUEST_TIMEOUT_MS,
  classifyAuthError,
  withAuthTimeout,
} from "@/lib/auth/auth-machine";
import type { AuthUser } from "@/components/auth-provider";

/**
 * The global authentication bootstrap state.
 *
 * Distinguishes between:
 *   - loading          → AuthProvider is still determining the initial auth state (no session, no initData yet)
 *   - authenticating   → Telegram initData is being submitted or a session is being restored/verified
 *   - retrying         → A retryable auth attempt failed; backing off before the next attempt
 *   - authenticated    → A verified application session exists. Safe to call protected APIs.
 *   - unauthenticated  → No session and no Telegram auth flow in progress (e.g. browser visitor)
 *   - error            → Authentication failed after bounded retries (manual retry available)
 *
 * AUTHENTICATION IS INDEPENDENT OF REALTIME: VIBE ships no realtime
 * WebSocket. Telegram's own internal `apiws` connection (visible in some
 * Telegram Web clients) is external infrastructure noise and must never
 * gate application access.
 */
export type AuthStatus =
  | "loading"
  | "authenticating"
  | "retrying"
  | "authenticated"
  | "unauthenticated"
  | "error";

export interface AuthBootstrapValue {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  /** Trigger a Telegram authentication flow with the provided raw initData. */
  authenticateWithTelegram: (initData: string, opts?: { isRetry?: boolean }) => Promise<void>;
  /** Trigger the development-only authentication flow (local dev only). */
  authenticateDev: () => Promise<void>;
  /** Log out the current user and clear the session. */
  logout: () => Promise<void>;
  /** Refresh the current session. */
  refreshSession: () => Promise<void>;
  /** Whether the initial auth bootstrap has completed at least once. */
  bootstrapped: boolean;
  /** Number of automatic auth attempts made in this session (bounded). */
  attempts: number;
}

const defaultValue: AuthBootstrapValue = {
  status: "loading",
  user: null,
  error: null,
  authenticateWithTelegram: async () => {},
  authenticateDev: async () => {},
  logout: async () => {},
  refreshSession: async () => {},
  bootstrapped: false,
  attempts: 0,
};

const AuthBootstrapContext = createContext<AuthBootstrapValue>(defaultValue);

/**
 * Persist the Supabase session where the server can read it.
 *
 * The browser Supabase client stores the session in localStorage (enough for
 * client-side calls), but API routes authenticate via the `sb-auth-token`
 * cookie / Authorization header. This sets a well-formed cookie:
 * `Secure` is only sent on HTTPS (it would be rejected on http://localhost),
 * and `SameSite=None` (required inside the Telegram WebView) is only used
 * together with `Secure`.
 */
function persistSessionCookie(session: {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  expiresAt?: number;
}): void {
  if (typeof document === "undefined") return;
  const cookieValue = JSON.stringify({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    expires_in: session.expiresIn,
    expires_at: session.expiresAt,
  });
  const isHttps =
    typeof window !== "undefined" && window.location.protocol === "https:";
  const isTelegram =
    typeof window !== "undefined" &&
    (window as unknown as { Telegram?: { WebApp?: unknown } }).Telegram?.WebApp !== undefined;
  // SameSite=None requires Secure; fall back to Lax on plain HTTP.
  const sameSite = isTelegram && isHttps ? "None" : "Lax";
  let cookie = `sb-auth-token=${encodeURIComponent(cookieValue)}; path=/; samesite=${sameSite}`;
  if (isHttps) cookie += "; Secure";
  document.cookie = cookie;
}

/**
 * AuthBootstrapProvider
 *
 * Manages the global authentication bootstrap lifecycle.
 *
 * The key design decisions are:
 *   1. The provider NEVER sets `status = "authenticated"` until a session
 *      has been VERIFIED by the server via /api/auth/telegram/me (or a
 *      freshly established /api/auth/telegram session + /me verification).
 *      Client-side Supabase state alone is never trusted.
 *   2. It provides explicit states: loading → authenticating/retrying →
 *      authenticated | unauthenticated → error. The initial restore resolves
 *      to "unauthenticated" (NOT "loading") when no session exists, so the
 *      UI can never spin forever.
 *   3. Every network call has a hard timeout; hanging requests surface as
 *      retryable timeout errors instead of an infinite spinner.
 *   4. Authenticated API hooks must only call protected endpoints when
 *      status === "authenticated".
 *   5. Development-only auth is strictly gated behind
 *      NEXT_PUBLIC_DEV_AUTH=true AND NOT in production.
 */
export function AuthBootstrapProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const bootstrappedRef = useRef(false);
  const inFlightRef = useRef(false);

  /**
   * Mark the bootstrap as complete (regardless of outcome).
   * Called after the first auth state resolution so that hooks can
   * distinguish "still waiting" from "waited and got an answer".
   */
  const finishBootstrap = useCallback((nextStatus: AuthStatus, nextUser: AuthUser | null, nextError: string | null) => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    setStatus(nextStatus);
    setUser(nextUser);
    setError(nextError);
    setBootstrapped(true);
  }, []);

  /**
   * Verify a session on the SERVER via /api/auth/telegram/me.
   *
   * Why an API round-trip instead of a direct Supabase query: a plain anon
   * client sends no JWT, so Postgres RLS (`users` policy `id = auth.uid()`)
   * sees auth.uid() = NULL and denies the read. The /me route verifies the
   * JWT with Supabase Auth and reads the row with the token attached, so
   * RLS resolves correctly — without ever using the service-role key.
   *
   * Returns the verified user, or null when the session is invalid.
   * Never throws for invalid sessions; only network/timeout errors reject
   * (callers classify them as retryable).
   */
  async function verifySessionOnServer(accessToken: string): Promise<AuthUser | null> {
    const response = await withAuthTimeout(
      fetch("/api/auth/telegram/me", {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      AUTH_REQUEST_TIMEOUT_MS,
    );

    if (response.status === 401 || response.status === 403) {
      return null;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(
        (body as { error?: string } | null)?.error ?? `Session verification failed (${response.status})`,
      );
    }
    const body = (await response.json()) as {
      user?: {
        id: string;
        telegramUserId?: number;
        username?: string | null;
        displayName?: string;
        role?: string;
        needsOnboarding?: boolean;
      };
    };
    if (!body.user?.id) return null;
    return {
      id: body.user.id,
      telegramUserId: body.user.telegramUserId ?? null,
      username: body.user.username ?? null,
      displayName: body.user.displayName ?? "",
      role: body.user.role ?? "",
      needsOnboarding: body.user.needsOnboarding ?? false,
      telegramUserIdRaw: body.user.telegramUserId ?? null,
      telegramUsernameRaw: body.user.username ?? null,
      displayNameRaw: body.user.displayName ?? "",
    };
  }

  /**
   * Restore an existing Supabase session.
   * This is the FIRST thing we try. If a session already exists, we verify
   * it against the server before declaring the user authenticated.
   * If NO session exists, we resolve to "unauthenticated" — never "loading".
   */
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        logger.info("[AUTH] session restore started");
        const sessionResult = await withAuthTimeout(
          getSupabaseClient().auth.getSession(),
          AUTH_REQUEST_TIMEOUT_MS,
        );
        const existingSession = sessionResult.data?.session;

        if (!existingSession) {
          // No session: the user is a visitor until Telegram auth runs.
          // Resolving to "unauthenticated" (not "loading") is what lets the
          // UI leave the "Authenticating…" state.
          if (!cancelled) {
            logger.info("[AUTH] no existing session — unauthenticated");
            finishBootstrap("unauthenticated", null, null);
          }
          return;
        }

        const token = existingSession.access_token;
        const verifiedUser = await verifySessionOnServer(token);

        if (!cancelled) {
          if (verifiedUser) {
            logger.info("[AUTH] session restore success");
            setUser(verifiedUser);
            setStatus("authenticated");
            setBootstrapped(true);
            bootstrappedRef.current = true;
          } else {
            // Server could not verify → treat as invalid session
            logger.info("[AUTH] stored session invalid — signed out");
            await getSupabaseClient().auth.signOut();
            finishBootstrap("unauthenticated", null, null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          const classified = classifyAuthError(err);
          logger.error("[AUTH] session restore failed", { kind: classified.kind });
          // A failed restore must not trap the UI: surface unauthenticated
          // with the error available for retry, unless it looks fatal.
          finishBootstrap("unauthenticated", null, classified.message);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, [finishBootstrap]);

  /**
   * Authenticate with Telegram initData.
   * The raw initData is sent to the server for cryptographic validation.
   * Single attempt with a hard timeout — bounded retries with backoff are
   * orchestrated by AuthGate (which surfaces the "retrying" state).
   */
  const authenticateWithTelegram = useCallback(
    async (initData: string, opts?: { isRetry?: boolean }) => {
      if (inFlightRef.current) return;
      if (!initData) {
        setError("No Telegram authentication data received. Open this app from Telegram.");
        setStatus("unauthenticated");
        return;
      }

      inFlightRef.current = true;
      setAttempts((a) => a + 1);
      setStatus(opts?.isRetry ? "retrying" : "authenticating");
      setError(null);

      try {
        logger.info("[AUTH] server validation started");
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
        let response: Response;
        try {
          response = await fetch("/api/auth/telegram", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        const result = (await response.json().catch(() => null)) as {
          authenticated?: boolean;
          error?: string;
          user?: { id: string };
          session?: {
            accessToken: string;
            refreshToken: string;
            expiresIn?: number;
            expiresAt?: number;
          };
        } | null;

        if (!response.ok || !result?.authenticated || !result.session || !result.user) {
          const classified = classifyAuthError(
            new Error(result?.error ?? "Telegram authentication failed"),
            response.status,
          );
          logger.warn("[AUTH] server validation rejected", {
            kind: classified.kind,
            httpStatus: response.status,
          });
          // Credential rejections (400/401: bad/expired initData) are terminal
          // for automatic retries; everything else stays retryable by the gate.
          setError(classified.message);
          setStatus(classified.retryable ? "error" : "unauthenticated");
          setUser(null);
          return;
        }

        logger.info("[AUTH] server validation success");
        await getSupabaseClient().auth.setSession({
          access_token: result.session.accessToken,
          refresh_token: result.session.refreshToken,
        });
        persistSessionCookie(result.session);

        // Verify the new session on the server before marking authenticated
        const verifiedUser = await verifySessionOnServer(result.session.accessToken);

        if (verifiedUser) {
          logger.info("[AUTH] authenticated");
          setUser(verifiedUser);
          setStatus("authenticated");
        } else {
          // Verification failed unexpectedly — treat as error
          logger.error("[AUTH] session verification failed after login");
          setStatus("error");
          setError("Session verification failed. Please try again.");
        }
      } catch (err) {
        const classified = classifyAuthError(err);
        logger.error("[AUTH] telegram authentication failed", { kind: classified.kind });
        setStatus("error");
        setError(classified.message);
      } finally {
        inFlightRef.current = false;
      }
    },
    [],
  );

  /**
   * Development authentication (local-only, never in production).
   */
  const authenticateDev = useCallback(async () => {
    // Development authentication is ONLY enabled when explicitly toggled
    // and never in production.
    if (process.env.NODE_ENV === "production") {
      setError("Development authentication is not available in production.");
      setStatus("unauthenticated");
      return;
    }

    const devAuthEnabled = process.env.NEXT_PUBLIC_DEV_AUTH === "true";
    if (!devAuthEnabled) {
      setError("No authentication available. Open this app from Telegram.");
      setStatus("unauthenticated");
      return;
    }

    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setStatus("authenticating");
    setError(null);

    try {
      const response = await withAuthTimeout(
        fetch("/api/auth/dev", { method: "POST" }),
        AUTH_REQUEST_TIMEOUT_MS,
      );

      const result = (await response.json()) as {
        authenticated?: boolean;
        error?: string;
        user?: AuthUser;
        session?: {
          accessToken: string;
          refreshToken: string;
          expiresIn?: number;
          expiresAt?: number;
        };
      };

      if (!response.ok || !result.authenticated) {
        const classified = classifyAuthError(
          new Error(result.error ?? "Development authentication failed"),
          response.status,
        );
        setError(classified.message);
        setStatus("unauthenticated");
        setUser(null);
        return;
      }

      if (result.session) {
        await getSupabaseClient().auth.setSession({
          access_token: result.session.accessToken,
          refresh_token: result.session.refreshToken,
        });
        persistSessionCookie(result.session);
      }

      if (!result.user) {
        setStatus("error");
        setError("Session verification failed. Please try again.");
        return;
      }

      setUser(result.user);
      setStatus("authenticated");
    } catch (err) {
      const classified = classifyAuthError(err);
      logger.error("[AUTH] dev authentication failed", { kind: classified.kind });
      setStatus("error");
      setError(classified.message);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  /** Log out. */
  const logout = useCallback(async () => {
    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();

      if (session) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      }
      await getSupabaseClient().auth.signOut();
    } catch (err) {
      logger.error("[AUTH] logout failed", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    } finally {
      setUser(null);
      setStatus("unauthenticated");
      setError(null);
    }
  }, []);

  /** Refresh the session. */
  const refreshSession = useCallback(async () => {
    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();

      if (!session) {
        setStatus("unauthenticated");
        return;
      }

      const { data, error: refreshError } = await getSupabaseClient().auth.refreshSession();

      if (refreshError || !data.session) {
        await logout();
      } else {
        // Verify the refreshed session on the server
        const verifiedUser = await verifySessionOnServer(data.session.access_token);

        if (verifiedUser) {
          setUser(verifiedUser);
          setStatus("authenticated");
        } else {
          setStatus("unauthenticated");
        }
      }
    } catch (err) {
      logger.error("[AUTH] session refresh failed", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      setStatus("error");
      setError(err instanceof Error ? err.message : "Session refresh failed");
    }
  }, [logout]);

  const value: AuthBootstrapValue = {
    status,
    user,
    error,
    authenticateWithTelegram,
    authenticateDev,
    logout,
    refreshSession,
    bootstrapped,
    attempts,
  };

  return (
    <AuthBootstrapContext.Provider value={value}>
      {children}
    </AuthBootstrapContext.Provider>
  );
}

/**
 * Simple hook to consume the auth bootstrap context.
 */
export function useAuthBootstrap(): AuthBootstrapValue {
  const context = useContext(AuthBootstrapContext);
  if (context === defaultValue) {
    throw new Error("useAuthBootstrap must be used within an AuthBootstrapProvider");
  }
  return context;
}
