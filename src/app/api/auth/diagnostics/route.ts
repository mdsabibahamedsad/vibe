import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

/**
 * GET /api/auth/diagnostics
 *
 * Safe authentication diagnostics. Reports ONLY booleans/status — never
 * secret values (bot token, Supabase keys, initData, etc.).
 *
 * Response:
 *   {
 *     "environment": "production",
 *     "envVars": { NEXT_PUBLIC_SUPABASE_URL: true, ... },
 *     "telegram": { status: "ok"|"not_configured"|"error", username: "...", httpStatus },
 *     "supabaseAnonKey": { status: "ok"|"invalid"|"not_configured", httpStatus },
 *     "supabaseServiceRoleKey": { status: "ok"|"invalid"|"not_configured", httpStatus }
 *   }
 */
export async function GET() {
  const envVars = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    TELEGRAM_BOT_TOKEN: !!process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_MINI_APP_URL: !!process.env.TELEGRAM_MINI_APP_URL,
    NEXT_PUBLIC_APP_URL: !!process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: !!process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
  };

  const result: Record<string, unknown> = {
    environment: process.env.NODE_ENV ?? "unknown",
    envVars,
  };

  // ---- Telegram getMe ----
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        signal: AbortSignal.timeout(8000),
      });
      const body = await res.json().catch(() => null);
      result.telegram = body?.ok
        ? { status: "ok", username: body.result?.username, httpStatus: res.status }
        : { status: "error", httpStatus: res.status, description: body?.description };
    } catch (err) {
      logger.warn("diagnostics: Telegram getMe failed", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
      result.telegram = { status: "network_error" };
    }
  } else {
    result.telegram = { status: "not_configured" };
  }

  // ---- Supabase anon key validity ----
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && anonKey) {
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        signal: AbortSignal.timeout(8000),
      });
      result.supabaseAnonKey = {
        status: res.ok ? "ok" : "invalid",
        httpStatus: res.status,
      };
    } catch (err) {
      logger.warn("diagnostics: Supabase anon key check failed", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
      result.supabaseAnonKey = { status: "network_error" };
    }
  } else {
    result.supabaseAnonKey = { status: "not_configured" };
  }

  // ---- Supabase service-role key validity ----
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceRoleKey) {
    try {
      const client = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (error) {
        result.supabaseServiceRoleKey = {
          status: "invalid",
          httpStatus: (error as { status?: number }).status ?? 401,
        };
      } else {
        result.supabaseServiceRoleKey = {
          status: "ok",
          httpStatus: 200,
          adminReachable: !!data,
        };
      }
    } catch (err) {
      logger.warn("diagnostics: Supabase service role check failed", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
      result.supabaseServiceRoleKey = { status: "network_error" };
    }
  } else {
    result.supabaseServiceRoleKey = { status: "not_configured" };
  }

  return NextResponse.json(result);
}
