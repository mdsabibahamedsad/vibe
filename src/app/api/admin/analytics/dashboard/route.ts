import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start") ?? new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const endDate = searchParams.get("end") ?? new Date().toISOString().split("T")[0];

    const { data, error } = await admin.rpc("get_analytics_dashboard", {
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: {
        ...(data as Record<string, any> ?? {}),
        lastRefreshed: new Date().toISOString(),
      },
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: "Failed to load dashboard",
    }, { status: 500 });
  }
}
