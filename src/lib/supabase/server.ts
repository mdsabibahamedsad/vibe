import { createClient } from "@supabase/supabase-js";

/**
 * Supabase server client.
 *
 * Use this in Server Components, Route Handlers, and Server Actions.
 * This client uses the anon/public key but with `auth: { persistSession: false }`
 * because server-side sessions are handled via cookies/headers.
 *
 * For service-role operations, use the admin client instead.
 */

/**
 * Create a Supabase server client.
 *
 * In Next.js App Router, use this within Route Handlers or Server Actions
 * where you can pass the auth token from the request headers/cookies.
 *
 * TODO: Integrate with Next.js cookies for session management once
 * Supabase Auth is configured with Telegram initData validation.
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
