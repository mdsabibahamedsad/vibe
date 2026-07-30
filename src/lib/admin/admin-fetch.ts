/**
 * Authenticated fetch wrapper for admin API requests.
 *
 * Automatically injects the Supabase access token into API requests.
 * All admin pages must use this instead of bare fetch() calls.
 *
 * Without this, admin API routes will reject requests with 401 because
 * they require a Bearer token in the Authorization header.
 */

import { getSupabaseClient } from "@/lib/supabase/client";
import { logger } from "@/lib/logger";

/**
 * Fetch with automatic auth token injection.
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch options (headers, method, body, etc.)
 * @returns Same as fetch, but with auth header automatically added
 */
export async function adminFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  try {
    // Get the current Supabase session to extract the access token
    const { data: sessionData, error: sessionError } =
      await getSupabaseClient().auth.getSession();

    if (sessionError || !sessionData.session) {
      logger.error("No active session for admin fetch", {
        url,
        error: sessionError?.message,
      });
      // Still try the request without auth, the server will return 401
      return fetch(url, options);
    }

    const accessToken = sessionData.session.access_token;

    // Merge the auth header with any existing headers
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);

    return fetch(url, {
      ...options,
      headers,
    });
  } catch (err) {
    logger.error("Failed to add auth token to admin fetch", {
      url,
      error: String(err),
    });
    // Fall back to unauth fetch - server will reject with 401
    return fetch(url, options);
  }
}

/**
 * Convenience wrapper for GET requests.
 */
export function adminGet(url: string): Promise<Response> {
  return adminFetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Convenience wrapper for POST requests with JSON body.
 */
export function adminPost(url: string, body: unknown): Promise<Response> {
  return adminFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
