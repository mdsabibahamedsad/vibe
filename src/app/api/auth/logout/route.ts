import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * POST /api/auth/logout
 *
 * Sign out the current user by invalidating their Supabase session.
 *
 * Request headers:
 *   Authorization: Bearer <access_token>
 *
 * Response (200):
 *   { "success": true }
 */
export async function POST(request: Request) {
  try {
    // Extract the access token from the Authorization header
    const authHeader = request.headers.get("Authorization");
    const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!accessToken) {
      // Not authenticated — still return success
      return NextResponse.json({ success: true });
    }

    // Verify the access token first
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await client.auth.getUser(accessToken);

    if (userError || !userData.user) {
      // Token already invalid — return success
      return NextResponse.json({ success: true });
    }

    // Use admin client (service-role) to revoke the session
    const adminClient = createAdminClient();
    const { error: signOutError } = await adminClient.auth.admin.signOut(userData.user.id);

    if (signOutError) {
      logger.warn("Logout sign-out had error", {
        error: signOutError.message,
        userId: userData.user.id,
      });
    }

    logger.info("User logged out", { userId: userData.user.id });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Logout error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    // Always return success on logout (even if there's an error)
    return NextResponse.json({ success: true });
  }
}
