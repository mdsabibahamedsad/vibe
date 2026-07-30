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

    const { data: entries, error } = await admin
      .from("translation_entries")
      .select("*")
      .eq("language", language)
      .eq("namespace", namespace);

    if (error) throw error;

    const issues: Array<{ type: string; key: string; message: string }> = [];
    const seenKeys = new Set<string>();

    for (const entry of entries ?? []) {
      if (seenKeys.has(entry.key)) {
        issues.push({ type: "duplicate", key: entry.key, message: "Duplicate key found" });
      }
      seenKeys.add(entry.key);

      const placeholders = entry.value.match(/\{[a-zA-Z_]+\}/g) ?? [];
      for (const ph of placeholders) {
        const phContent = ph.slice(1, -1);
        const addIssue = (msg: string) => {
          issues.push({ type: "invalid_placeholder", key: entry.key, message: `${ph}: ${msg}` });
        };
        if (/[^a-zA-Z_]/.test(phContent)) {
          addIssue("Invalid characters in placeholder");
        }
        if (phContent.length > 50) {
          addIssue("Placeholder name too long");
        }
      }

      const htmlMatch = entry.value.match(/<[a-z]+[^>]*>/g);
      if (htmlMatch && htmlMatch.length > 0) {
        issues.push({ type: "unexpected_html", key: entry.key, message: "Contains HTML tags" });
      }

      if (entry.value.length > 500) {
        issues.push({ type: "excessively_long", key: entry.key, message: `Length: ${entry.value.length} characters` });
      }
    }

    const { data: enEntries } = await admin
      .from("translation_entries")
      .select("key")
      .eq("language", "en")
      .eq("namespace", namespace);

    if (language !== "en" && enEntries) {
      const enKeys = new Set((enEntries ?? []).map((e: any) => e.key));
      const translatedKeys = new Set((entries ?? []).map((e: any) => e.key));
      for (const key of enKeys) {
        if (!translatedKeys.has(key)) {
          issues.push({ type: "missing", key, message: "Missing translation for key" });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: issues,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: "Validation failed",
    }, { status: 500 });
  }
}
