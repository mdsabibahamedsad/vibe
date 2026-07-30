/**
 * POST /api/billing/cancel — Cancel the current active subscription.
 *
 * Premium continues until the current billing period ends.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { cancelSubscription } from "@/lib/billing/billing.service";
import { AppError } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    await cancelSubscription(user.id);

    return NextResponse.json({
      success: true,
      message: "Subscription cancelled. Premium remains active until the end of the billing period.",
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ success: false, error: "Failed to cancel subscription" }, { status: 500 });
  }
}
