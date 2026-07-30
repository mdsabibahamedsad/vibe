"use client";

import { createContext, type ReactNode, useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { logger } from "@/lib/logger";

/** User info returned from the auth API */
export interface AuthUser {
  id: string;
  telegramUserId: number;
  username?: string;
  displayName: string;
  role: string;
  needsOnboarding: boolean;
}

/** Auth context value exposed to consumers */
export interface AuthContextValue {
  /** Whether the auth state has been determined */
  loading: boolean;
  /** Whether the user is authenticated */
  authenticated: boolean;
  /** The authenticated user (null if not authenticated) */
  user: AuthUser | null;
  /** Error message if authentication failed */
  error: string | null;
  /** Authenticate via Telegram initData */
  authenticateWithTelegram: (initData: string) => Promise<void>;
  /** Authenticate via development mode */
  authenticateDev: () => Promise<void>;
  /** Logout the current user */
  logout: () => Promise<void>;
  /** Refresh the user session */
  refreshSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  loading: true,
  authenticated: false,
  user: null,
  error: null,
  authenticateWithTelegram: async () => {},
  authenticateDev: async () => {},
  logout: async () => {},
  refreshSession: async () => {},
});

/**
 * AuthProvider manages authentication state and Supabase sessions.
 *
 * On mount, it checks for an existing Supabase session and restores it.
 * It exposes authentication methods (Telegram initData, dev auth, logout).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * On mount, try to restore an existing Supabase session.
   */
  useEffect(() => {
    const restoreSession = async () => {
      try {
        // Check if Supabase already has a session
        const {
          data: { session: existingSession },
        } = await getSupabaseClient().auth.getSession();

        if (existingSession) {
          // Session exists — get the user
          const {
            data: { user: authUser },
          } = await getSupabaseClient().auth.getUser();

          if (authUser) {
            // Fetch application user info from the auth API
            const response = await fetch("/api/auth/telegram/me", {
              headers: {
                Authorization: `Bearer ${existingSession.access_token}`,
              },
            });

            if (response.ok) {
              const result = await response.json();
              setUser(result.user);
              setAuthenticated(true);
            } else {
              // Session invalid — sign out
              await getSupabaseClient().auth.signOut();
            }
          }
        }
      } catch (err) {
        logger.error("Failed to restore auth session", {
          error: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  /**
   * Authenticate via Telegram initData.
   * Sends the raw initData to the server for validation.
   */
  const authenticateWithTelegram = useCallback(async (initData: string) => {
    setLoading(true);
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
        setAuthenticated(false);
        setUser(null);
        return;
      }

      // Set the Supabase session with the tokens from the server
      if (result.session) {
        await getSupabaseClient().auth.setSession({
          access_token: result.session.accessToken,
          refresh_token: result.session.refreshToken,
        });
      }

      setUser(result.user);
      setAuthenticated(true);
    } catch (err) {
      setError("Failed to authenticate. Please try again.");
      logger.error("Telegram auth error", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Development authentication (local-only, never enabled in production).
   */
  const authenticateDev = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/dev", {
        method: "POST",
      });

      const result = await response.json();

      if (!response.ok || !result.authenticated) {
        setError(result.error || "Development authentication failed");
        setAuthenticated(false);
        setUser(null);
        return;
      }

      // Set the Supabase session
      if (result.session) {
        await getSupabaseClient().auth.setSession({
          access_token: result.session.accessToken,
          refresh_token: result.session.refreshToken,
        });
      }

      setUser(result.user);
      setAuthenticated(true);
    } catch (err) {
      setError("Failed to authenticate in development mode.");
      logger.error("Dev auth error", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Logout — invalidate the session on the server and clear local state.
   */
  const logout = useCallback(async () => {
    try {
      // Get current access token
      const {
        data: { session },
      } = await getSupabaseClient().auth.getSession();

      if (session) {
        // Invalidate on server
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
      }

      // Sign out locally
      await getSupabaseClient().auth.signOut();
    } catch (err) {
      logger.error("Logout error", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setUser(null);
      setAuthenticated(false);
      setLoading(false);
    }
  }, []);

  /**
   * Refresh the current session.
   */
  const refreshSession = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await getSupabaseClient().auth.getSession();

      if (session) {
        const { data, error: refreshError } = await getSupabaseClient().auth.refreshSession();

        if (refreshError || !data.session) {
          await logout();
        }
      }
    } catch (err) {
      logger.error("Session refresh error", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{
        loading,
        authenticated,
        user,
        error,
        authenticateWithTelegram,
        authenticateDev,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
