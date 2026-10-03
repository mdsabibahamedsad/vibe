"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { createServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import type { AuthUser } from "@/components/auth-provider";

/**
 * The global authentication bootstrap state.
 *
 * Distinguishes between:
 *   - loading          → AuthProvider is still determining the initial auth state (no session, no initData yet)
 *   - authenticating   → Telegram initData is being submitted or a session is being restored/verified
 *   - authenticated    → A verified application session exists. Safe to call protected APIs.
 *   - unauthenticated  → No session and no Telegram auth flow in progress (e.g. browser visitor)
 *   - error            → Authentication failed
 */
export type AuthStatus =
  | "loading"
  | "authenticating"
  | "authenticated"
  | "unauthenticated"
  | "error";

export interface AuthBootstrapValue {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  /** Trigger a Telegram authentication flow with the provided raw initData. */
  authenticateWithTelegram: (initData: string) => Promise<void>;
  /** Trigger the development-only authentication flow (local dev only). */
  authenticateDev: () => Promise<void>;
  /** Log out the current user and clear the session. */
  logout: () => Promise<void>;
  /** Refresh the current session. */
  refreshSession: () => Promise<void>;
  /** Whether the initial auth bootstrap has completed at least once. */
  bootstrapped: boolean;
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
};

const AuthBootstrapContext = createContext<AuthBootstrapValue>(defaultValue);

/**
 * AuthBootstrapProvider
 *
 * Manages the global authentication bootstrap lifecycle.
 *
 * The key design decisions are:
 *   1. The provider NEVER sets `status = "authenticated"` until a session
 *      has been VERIFIED by the server via /api/auth/telegram/me (or a
 *      freshly established /api/auth/telegram session).
 *   2. It provides explicit states: loading → authenticating → authenticated
 *      | unauthenticated → error.
 *   3. Authenticated API hooks must only call protected endpoints when
 *      status === "authenticated".
 *   4. Development-only auth is strictly gated behind
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
  const bootstrappedRef = useRef(false);

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
   * Verify the current Supabase session on the server.
   * Uses the server (anon) client to verify the JWT and look up the
   * authenticated user row. Returns verified user or null.
   */
  async function verifySessionOnServer(userId: string): Promise<{ status: AuthStatus; user: AuthUser | null }> {
    try {
      // Use the server client (anon) — NOT the admin client.
      // This enforces RLS and only reads the user's own row.
      const serverClient = createServerClient();

      const { data: appUser, error: appUserError } = await serverClient
        .from("users")
        .select(
          "id, telegram_user_id, telegram_username, display_name, first_name, last_name, role, is_active, is_banned, avatar_media_id, last_seen_at",
        )
        .eq("id", userId)
        .single();

      if (appUserError || !appUser) {
        return { status: "unauthenticated", user: null };
      }

      if (appUser.is_banned) {
        return { status: "unauthenticated", user: null };
      }

      return {
        status: "authenticated",
        user: {
          id: appUser.id,
          telegramUserId: appUser.telegram_user_id ?? null,
          username: appUser.telegram_username ?? null,
          displayName: appUser.display_name ?? "",
          role: appUser.role ?? "",
          needsOnboarding: false,
          telegramUserIdRaw: appUser.telegram_user_id ?? null,
          telegramUsernameRaw: appUser.telegram_username ?? null,
          displayNameRaw: appUser.display_name ?? "",
        },
      };
    } catch (err) {
      logger.error("Auth bootstrap: server session verification failed", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      return { status: "error", user: null };
    }
  }

  /**
   * Restore an existing Supabase session.
   * This is the FIRST thing we try. If a session already exists, we verify
   * it against the server before declaring the user authenticated.
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
            const { status: sessionStatus, user: verifiedUser } =
              await verifySessionOnServer(authUser.id);

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
          // No existing session
          finishBootstrap("loading", null, null);
        }
      } catch (err) {
        logger.error("Auth bootstrap: restore session failed", {
          error: err instanceof Error ? err.message : "Unknown",
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
   * Authenticate with Telegram initData.
   * The raw initData is sent to the server for cryptographic validation.
   */
  const authenticateWithTelegram = useCallback(
    async (initData: string) => {
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
          setError(result.error || "Telegram authentication failed");
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
        const { status: verifyStatus, user: verifiedUser } =
          await verifySessionOnServer(result.user.id);

        if (verifiedUser) {
          setUser(verifiedUser);
          setStatus("authenticated");
        } else {
          // Verification failed unexpectedly — treat as error
          setStatus("error");
          setError("Session verification failed. Please try again.");
        }
      } catch (err) {
        logger.error("Auth bootstrap: Telegram authentication failed", {
          error: err instanceof Error ? err.message : "Unknown",
        });
        setStatus("error");
        setError(err instanceof Error ? err.message : "Authentication failed");
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

      setUser(result.user);
      setStatus("authenticated");
    } catch (err) {
      logger.error("Auth bootstrap: dev authentication failed", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      setStatus("error");
      setError(err instanceof Error ? err.message : "Development authentication failed");
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
      logger.error("Auth bootstrap: logout failed", {
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
        const { status: verifyStatus, user: verifiedUser } =
          await verifySessionOnServer(data.session.user.id);

        if (verifiedUser) {
          setUser(verifiedUser);
          setStatus("authenticated");
        } else {
          setStatus("unauthenticated");
        }
      }
    } catch (err) {
      logger.error("Auth bootstrap: session refresh failed", {
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
