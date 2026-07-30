/**
 * GET /api/billing/transactions — Get the current user's payment transaction history.
 *
 * Returns only the authenticated user's own transactions.
 * Never exposes another user's billing data.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    const adminClient = createAdminClient();

    const { data, error } = await adminClient
      .from("payment_transactions")
      .select("id, plan_slug, plan_stars_price, stars_amount, currency, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      throw new AppError("INTERNAL_ERROR", "Failed to load transaction history");
    }

    return NextResponse.json({ success: true, transactions: data ?? [] });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ success: false, error: "Failed to load history" }, { status: 500 });
  }
}
