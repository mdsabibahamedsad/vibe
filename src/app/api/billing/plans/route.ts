/**
 * GET /api/billing/plans — List available subscription plans.
 * Always fetched from server — never hardcoded in client.
 */

import { NextResponse } from "next/server";
import { getActivePlans, calculateMonthlyPrice } from "@/lib/billing/billing.service";
import { AppError } from "@/lib/errors";

export async function GET() {
  try {
    const plans = await getActivePlans();

    const enriched = plans.map((plan) => ({
      ...plan,
      monthlyPrice: calculateMonthlyPrice(plan.starsPrice, plan.durationDays),
    }));

    return NextResponse.json({ success: true, plans: enriched });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ success: false, error: "Failed to load plans" }, { status: 500 });
  }
}
