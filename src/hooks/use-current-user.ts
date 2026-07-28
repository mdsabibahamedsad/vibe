"use client";

import { useContext } from "react";
import { AuthContext } from "@/components/auth-provider";
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
  return useContext(AuthContext);
}
