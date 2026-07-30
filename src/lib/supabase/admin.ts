import { createClient } from "@supabase/supabase-js";

/**
 * Supabase admin (service-role) client.
 *
 * WARNING: This client has full access to your Supabase database.
 * It bypasses Row Level Security (RLS).
 *
 * Use ONLY when absolutely necessary:
 *  - Server-only operations (never in browser code)
 *  - Admin-level operations after verifying admin authorization
 *  - Background jobs and webhooks
 *  - User impersonation for support
 *
 * NEVER:
 *  - Expose this to the client/browser
 *  - Use in Server Components that render client data
 *  - Include in imported modules that run on the client
 *
 * QUERY TIMEOUTS:
 *   Import `withQueryTimeout` from "./server" and wrap critical queries:
 *
 *   const { data } = await withQueryTimeout(
 *     adminClient.from('users').select('*'),
 *     { timeoutMs: 5000 }
 *   );
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createAdminClient() {
  if (!supabaseUrl) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!supabaseServiceRoleKey) {
    throw new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
