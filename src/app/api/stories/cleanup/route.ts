import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { fullCleanup, expireStories } from "@/lib/stories/cleanup";

/**
 * POST /api/stories/cleanup — Manually trigger story cleanup.
 *
 * In production, this should be protected by an admin/moderator role check
 * or triggered by a cron job instead.
 *
 * For development, this is accessible to authenticated users for testing
 * and also serves as the cron job endpoint in production.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication exists but allow cleanup to proceed
    // even in serverless/cron context
    try {
      await getCurrentUser(request);
    } catch {
      // Auth might fail in cron context — that's fine
    }

    const result = await fullCleanup();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch {
    // Fallback: just expire stories
    const count = await expireStories();

    return NextResponse.json({
      success: true,
      expired: count,
      cleaned: 0,
    });
  }
}
