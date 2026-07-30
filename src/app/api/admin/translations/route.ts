import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPPORTED_LANGUAGES, type I18nNamespace } from "@/lib/i18n";

const ALLOWED_NAMESPACES: I18nNamespace[] = [
  "common", "navigation", "settings", "premium", "admin",
  "onboarding", "notifications", "feed", "dating", "chat",
  "stories", "search", "profile", "creator", "help",
  "support", "moderation", "errors", "time", "billing",
  "ads", "security", "referrals",
];

export async function GET(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const language = searchParams.get("language") ?? "en";
    const namespace = searchParams.get("namespace") ?? "common";

    if (!SUPPORTED_LANGUAGES.find((l) => l.code === language)) {
      return NextResponse.json({ success: false, error: "Invalid language" }, { status: 400 });
    }

    if (!ALLOWED_NAMESPACES.includes(namespace as I18nNamespace)) {
      return NextResponse.json({ success: false, error: "Invalid namespace" }, { status: 400 });
    }

    const { data, error } = await admin
      .from("translation_entries")
      .select("*")
      .eq("language", language)
      .eq("namespace", namespace)
      .order("key");

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data ?? [],
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: "Failed to load translations",
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const body = await request.json();
    const { language, namespace, key, value } = body;

    if (!language || !namespace || !key || value === undefined) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const { data: existing } = await admin
      .from("translation_entries")
      .select("id, version")
      .eq("language", language)
      .eq("namespace", namespace)
      .eq("key", key)
      .single();

    if (existing) {
      const { error } = await admin
        .from("translation_entries")
        .update({
          value,
          version: existing.version + 1,
          updated_at: new Date().toISOString(),
          is_published: false,
        })
        .eq("id", existing.id);

      if (error) throw error;
    } else {
      const { error } = await admin
        .from("translation_entries")
        .insert({
          language,
          namespace,
          key,
          value,
          version: 1,
          is_published: false,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: "Failed to save translation",
    }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const body = await request.json();
    const { language, namespace, key, publish } = body;

    if (!language || !namespace || !key) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const { error } = await admin
      .from("translation_entries")
      .update({ is_published: publish })
      .eq("language", language)
      .eq("namespace", namespace)
      .eq("key", key);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: "Failed to update translation",
    }, { status: 500 });
  }
}
