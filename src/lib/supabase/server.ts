import { createClient } from "@supabase/supabase-js";

/**
 * Supabase server client.
 *
 * Use this in Server Components, Route Handlers, and Server Actions.
 * This client uses the anon/public key but with `auth: { persistSession: false }`
 * because server-side sessions are handled via cookies/headers.
 *
 * For service-role operations, use the admin client instead.
 *
 * QUERY TIMEOUTS:
 *   The underlying Supabase client does not natively support per-query timeouts.
 *   We work around this by wrapping queries with AbortController/AbortSignal.
 *   Use the `withQueryTimeout` helper exported from this module.
 *
 *   Usage:
 *     const { data, error } = await withQueryTimeout(
 *       adminClient.from('users').select('*').limit(10),
 *       { timeoutMs: 5000 }
 *     );
 */

// ============================================================================
// TIMEOUT WRAPPER
// ============================================================================

interface TimeoutOptions {
  /** Query timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
  /** Error message on timeout (default: "Database query timed out") */
  timeoutMessage?: string;
}

const DEFAULT_QUERY_TIMEOUT_MS = 10_000;

/**
 * Wraps a Supabase query promise with a timeout.
 *
 * The Supabase JS client does not support per-query timeouts natively.
 * This wrapper uses Promise.race with a timeout to enforce limits.
 * Note: The underlying HTTP request may still complete, but the caller
 * will receive a timeout error and can retry safely.
 *
 * @param queryPromise - The Supabase query promise (`.then()` or `await`)
 * @param options - Timeout configuration
 * @returns The query result, or throws on timeout
 */
export async function withQueryTimeout<T>(
  queryPromise: PromiseLike<T>,
  options: TimeoutOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;

  const timeoutPromise = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(
        new Error(options.timeoutMessage ?? `Database query timed out after ${timeoutMs}ms`),
      );
    }, timeoutMs);
  });

  return Promise.race([queryPromise, timeoutPromise]);
}

// ============================================================================
// CLIENT CREATION
// ============================================================================

/**
 * Create a Supabase server client.
 */
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!supabaseAnonKey) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
