"use client";

import { createContext, type ReactNode, useCallback, useEffect, useState, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { createServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export interface AuthUser {
  id: string;
  telegramUserId: number | null;
  username: string | null;
  displayName: string;
  role: string;
  needsOnboarding: boolean;
  /** Legacy / UI-facing fields used by components */
  telegramUserIdRaw: number | null;
  telegramUsernameRaw: string | null;
  displayNameRaw: string;
}

/**
 * Explicit auth bootstrap states.
 * - loading:        AuthProvider is deciding (no existing session, no Telegram auth yet)
 * - authenticating:  Telegram initData is being submitted OR an existing session is being verified
 * - retrying:       A retryable attempt failed; backing off before the next attempt
 * - authenticated:   A verified application session exists. Safe to call protected APIs.
 * - unauthenticated: No session and no auth flow in progress (e.g. browser visitor)
 * - error:          Authentication failed
 *
 * @deprecated The canonical provider is `AuthBootstrapProvider` in
 * `@/hooks/use-auth`. This legacy provider is no longer mounted in the
 * root layout; it is kept only for type compatibility (`AuthUser`,
 * `AuthContextValue`) and is not part of the startup path.
 */
export type AuthStatus = "loading" | "authenticating" | "retrying" | "authenticated" | "unauthenticated" | "error";

export interface AuthContextValue {
  /** Auth status with fine-grained loading states */
  status: AuthStatus;
  /** Whether the auth provider is still deciding the initial state */
  loading: boolean;
  /** Whether the user is fully authenticated (server-verified) */
  authenticated: boolean;
  /** The authenticated user (null if not authenticated) */
  user: AuthUser | null;
  /** Error message if authentication failed */
  error: string | null;
  /** Authenticate via Telegram initData */
  authenticateWithTelegram: (initData: string) => Promise<void>;
  /** Authenticate via development mode (local dev only) */
  authenticateDev: () => Promise<void>;
  /** Logout the current user */
  logout: () => Promise<void>;
  /** Refresh the user session */
  refreshSession: () => Promise<void>;
  /** Whether the first auth resolution has completed */
  bootstrapped: boolean;
}

const defaultContextValue: AuthContextValue = {
  status: "loading",
  loading: true,
  authenticated: false,
  user: null,
  error: null,
  authenticateWithTelegram: async () => {},
  authenticateDev: async () => {},
  logout: async () => {},
  refreshSession: async () => {},
  bootstrapped: false,
};

export const AuthContext = createContext<AuthContextValue>(defaultContextValue);

/**
 * AuthProvider manages authentication state and Supabase sessions.
 *
 * Design:
 *   - Never sets `authenticated: true` until the server has VERIFIED the
 *     session via /api/auth/telegram/me (restored) or a fresh
 *     /api/auth/telegram exchange.
 *   - Provides explicit states: loading → authenticating → authenticated /
 *     unauthenticated → error.
 *   - Protected API hooks must only call when status === "authenticated".
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const bootstrappedRef = useRef(false);

  /** Mark the first bootstrap as complete (regardless of outcome). */
  const finishBootstrap = useCallback((nextStatus: AuthStatus, nextUser: AuthUser | null, nextError: string | null) => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    setStatus(nextStatus);
    setUser(nextUser);
    setError(nextError);
    setBootstrapped(true);
  }, []);

  /**
   * Verify a Supabase session on the server.
   * Uses the server (anon) client to verify the JWT and re-derive the user row.
   */
  async function verifySession(userId: string): Promise<AuthUser | null> {
    try {
      const serverClient = createServerClient();

      const { data: appUser, error: appUserError } = await serverClient
        .from("users")
        .select(
          "id, telegram_user_id, telegram_username, display_name, first_name, last_name, role, is_active, is_banned, avatar_media_id, last_seen_at",
        )
        .eq("id", userId)
        .single();

      if (appUserError || !appUser) {
        return null;
      }

      if (appUser.is_banned) {
        return null;
      }

      return {
        id: appUser.id,
        telegramUserId: appUser.telegram_user_id ?? null,
        username: appUser.telegram_username ?? null,
        displayName: appUser.display_name ?? "",
        role: appUser.role ?? "",
        needsOnboarding: false,
        telegramUserIdRaw: appUser.telegram_user_id ?? null,
        telegramUsernameRaw: appUser.telegram_username ?? null,
        displayNameRaw: appUser.display_name ?? "",
      };
    } catch (err) {
      logger.error("Auth bootstrap: server session verification failed", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      return null;
    }
  }

  /**
   * On mount, try to restore an existing Supabase session.
   */
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const sessionResult = await getSupabaseClient().auth.getSession();
        const existingSession = sessionResult.data?.session;

        if (existingSession) {
          const userResult = await getSupabaseClient().auth.getUser();
          const authUser = userResult.data?.user;

          if (authUser) {
            const verifiedUser = await verifySession(authUser.id);

            if (!cancelled) {
              if (verifiedUser) {
                setUser(verifiedUser);
                setStatus("authenticated");
                setBootstrapped(true);
              } else {
                // Server could not verify → treat as invalid session
                await getSupabaseClient().auth.signOut();
                finishBootstrap("unauthenticated", null, null);
              }
            }
          } else {
            await getSupabaseClient().auth.signOut();
            finishBootstrap("unauthenticated", null, null);
          }
        } else {
          // No session: resolve to "unauthenticated" — resolving to
          // "loading" here used to trap the UI on "Authenticating…" forever.
          finishBootstrap("unauthenticated", null, null);
        }
      } catch (err) {
        logger.error("Failed to restore auth session", {
          error: err instanceof Error ? err.message : "Unknown error",
        });
        if (!cancelled) {
          finishBootstrap("error", null, err instanceof Error ? err.message : "Failed to restore session");
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Authenticate via Telegram initData.
   * Sends the raw initData to the server for cryptographic validation.
   */
  const authenticateWithTelegram = useCallback(async (initData: string) => {
    if (!initData) {
      setError("No Telegram authentication data received. Open this app from Telegram.");
      setStatus("unauthenticated");
      return;
    }

    setStatus("authenticating");
    setError(null);

    try {
      const response = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });

      const result = await response.json();

      if (!response.ok || !result.authenticated) {
        setError(result.error || "Authentication failed");
        setStatus("unauthenticated");
        setUser(null);
        return;
      }

      if (result.session) {
        await getSupabaseClient().auth.setSession({
          access_token: result.session.accessToken,
          refresh_token: result.session.refreshToken,
        });
      }

      // Verify the new session on the server before marking authenticated
      const verifiedUser = await verifySession(result.user.id);

      if (verifiedUser) {
        setUser(verifiedUser);
        setStatus("authenticated");
      } else {
        setStatus("error");
        setError("Session verification failed. Please try again.");
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to authenticate. Please try again.");
      logger.error("Telegram auth error", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  /**
   * Development authentication (local-only, never enabled in production).
   */
  const authenticateDev = useCallback(async () => {
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

    setStatus("authenticating");
    setError(null);

    try {
      const response = await fetch("/api/auth/dev", { method: "POST" });
      const result = await response.json();

      if (!response.ok || !result.authenticated) {
        setError(result.error || "Development authentication failed");
        setStatus("unauthenticated");
        setUser(null);
        return;
      }

      if (result.session) {
        await getSupabaseClient().auth.setSession({
          access_token: result.session.accessToken,
          refresh_token: result.session.refreshToken,
        });
      }

      const verifiedUser = await verifySession(result.user.id);
      if (verifiedUser) {
        setUser(verifiedUser);
        setStatus("authenticated");
      } else {
        setStatus("error");
        setError("Session verification failed. Please try again.");
      }
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to authenticate in development mode.");
      logger.error("Dev auth error", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  /**
   * Logout — invalidate the session on the server and clear local state.
   */
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
      logger.error("Logout error", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setUser(null);
      setStatus("unauthenticated");
      setError(null);
    }
  }, []);

  /**
   * Refresh the current session.
   */
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
        return;
      }

      // Verify the refreshed session on the server
      const verifiedUser = await verifySession(data.session.user.id);
      if (verifiedUser) {
        setUser(verifiedUser);
        setStatus("authenticated");
      } else {
        setStatus("unauthenticated");
      }
    } catch (err) {
      logger.error("Session refresh error", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
      setStatus("error");
      setError(err instanceof Error ? err.message : "Session refresh failed");
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status,
        loading: status === "loading",
        authenticated: status === "authenticated",
        user,
        error,
        authenticateWithTelegram,
        authenticateDev,
        logout,
        refreshSession,
        bootstrapped,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
