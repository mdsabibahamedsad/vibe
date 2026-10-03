"use client";

import { useContext } from "react";
import { AuthContext } from "@/components/auth-provider";
import { useAuthBootstrap } from "@/hooks/use-auth";
import type { AuthContextValue } from "@/components/auth-provider";

/**
 * React hook that provides authentication state and methods.
 *
 * Requires AuthProvider to be mounted in the tree.
 *
 * Usage:
 *   const { loading, authenticated, user, logout } = useCurrentUser();
 *
 *   if (loading) return <Loading />;
 *   if (!authenticated) return <LoginScreen />;
 *   return <Profile user={user} />;
 */
export function useCurrentUser(): AuthContextValue {
  // Use the new auth bootstrap for compatibility.
  // This preserves the old interface while using the new auth flow.
  const bootstrap = useAuthBootstrap();

  return {
    status: bootstrap.status,
    loading: bootstrap.status === "loading",
    authenticated: bootstrap.status === "authenticated",
    user: bootstrap.user,
    error: bootstrap.error,
    authenticateWithTelegram: bootstrap.authenticateWithTelegram,
    authenticateDev: bootstrap.authenticateDev,
    logout: bootstrap.logout,
    refreshSession: bootstrap.refreshSession,
    bootstrapped: bootstrap.bootstrapped,
  };
}
