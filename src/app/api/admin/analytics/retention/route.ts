import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start") ?? new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const endDate = searchParams.get("end") ?? new Date().toISOString().split("T")[0];
    const weeks = parseInt(searchParams.get("weeks") ?? "12");

    const { data, error } = await admin.rpc("get_cohort_retention", {
      p_cohort_start: startDate,
      p_cohort_end: endDate,
      p_weeks: weeks,
    });

    if (error) throw error;

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Failed to load retention data" }, { status: 500 });
  }
}
