/**
 * GET /api/safety/warnings — Get safety warnings for current user
 * PATCH /api/safety/warnings/[id] — Dismiss a safety warning
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  getUserSafetyWarnings,
  dismissSafetyWarning,
} from "@/lib/safety/chat-safety.service";

/**
 * GET /api/safety/warnings
 * Returns active safety warnings for the current user.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const includeDismissed = searchParams.get("includeDismissed") === "true";

    const warnings = await getUserSafetyWarnings(user.id, includeDismissed);

    return NextResponse.json({ warnings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch warnings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
