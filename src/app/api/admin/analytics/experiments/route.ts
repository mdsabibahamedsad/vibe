import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const getResults = searchParams.get("results") === "true";

    if (id && getResults) {
      const { data, error } = await admin.rpc("get_experiment_results", {
        p_experiment_id: id,
      });
      if (error) throw error;
      return NextResponse.json({ success: true, data: data ?? [] });
    }

    if (id) {
      const { data, error } = await admin.from("experiments").select("*").eq("id", id).single();
      if (error) throw error;
      return NextResponse.json({ success: true, data });
    }

    const { data, error } = await admin.from("experiments").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Failed to load experiments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const body = await request.json();
    const { name, description, owner, primaryMetric } = body;

    if (!name || !owner || !primaryMetric) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const { data, error } = await admin.from("experiments").insert({
      name,
      description: description ?? null,
      owner,
      primary_metric: primaryMetric,
      status: "draft",
    }).select("id").single();

    if (error) throw error;

    // Create default control and treatment variants
    await admin.from("experiment_variants").insert([
      { experiment_id: data.id, name: "Control", traffic_pct: 50, is_control: true },
      { experiment_id: data.id, name: "Treatment", traffic_pct: 50, is_control: false },
    ]);

    return NextResponse.json({ success: true, data: { id: data.id } });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Failed to create experiment" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const body = await request.json();
    const { id, status, kill_switch } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing experiment ID" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (status) {
      updates.status = status;
      if (status === "running") updates.start_date = new Date().toISOString();
      if (status === "completed") updates.end_date = new Date().toISOString();
    }
    if (kill_switch !== undefined) updates.kill_switch = kill_switch;

    const { error } = await admin.from("experiments").update(updates).eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Failed to update experiment" }, { status: 500 });
  }
}
