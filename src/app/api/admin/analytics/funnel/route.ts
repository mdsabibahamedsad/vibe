import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const FUNNEL_RPCS: Record<string, string> = {
  onboarding: "get_onboarding_funnel",
  dating: "get_dating_funnel",
  content: "get_content_funnel",
  premium: "get_premium_funnel",
};

export async function GET(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? "onboarding";
    const startDate = searchParams.get("start") ?? new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const endDate = searchParams.get("end") ?? new Date().toISOString().split("T")[0];

    const rpcName = FUNNEL_RPCS[type];
    if (!rpcName) {
      return NextResponse.json({ success: false, error: "Invalid funnel type" }, { status: 400 });
    }

    const { data, error } = await admin.rpc(rpcName, {
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) throw error;

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Failed to load funnel" }, { status: 500 });
  }
}
