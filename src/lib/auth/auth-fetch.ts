"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Authenticated fetch for protected VIBE API routes.
 *
 * Attaches the current Supabase access token as `Authorization: Bearer …`
 * AND sends same-origin cookies (`credentials: "same-origin"`), so the
 * request authenticates through BOTH server paths:
 *
 *   1. Bearer header  — works even where cookies are blocked (some
 *      Telegram WebViews / privacy modes block cookie storage).
 *   2. `sb-auth-token` cookie — the standard browser session path.
 *
 * Callers must still only invoke protected endpoints when auth status is
 * "authenticated"; this helper only transports the credential, it does not
 * decide authorization.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});

  try {
    const { data } = await getSupabaseClient().auth.getSession();
    const token = data.session?.access_token;
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch {
    // No session in storage — proceed without a header; the server will
    // answer 401 and the caller handles it (retry / auth UI, never fatal).
  }

  return fetch(input, {
    ...init,
    headers,
    // Same-origin: cookies are sent, no CORS preflight surprises.
    credentials: init.credentials ?? "same-origin",
  });
}
