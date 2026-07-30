/**
 * GET /api/billing/subscription — Get current user's subscription status
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getSubscriptionStatus } from "@/lib/billing/billing.service";
import { AppError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const status = await getSubscriptionStatus(user.id);

    return NextResponse.json({ success: true, ...status });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode },
      );
    }
    return NextResponse.json({ success: false, error: "Failed to get subscription" }, { status: 500 });
  }
}
