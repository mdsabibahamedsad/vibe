/**
 * POST /api/billing/restore — Restore/check premium subscription status.
 *
 * Called when the app reconnects or user taps "Restore Purchases".
 * Uses server-side provider records — never cached client state.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { restoreSubscription } from "@/lib/billing/billing.service";
import { AppError } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const status = await restoreSubscription(user.id);

    return NextResponse.json({
      success: true,
      ...status,
      message: status.hasActiveSubscription
        ? "Premium restored"
        : "No active Premium subscription found",
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ success: false, error: "Failed to restore" }, { status: 500 });
  }
}
