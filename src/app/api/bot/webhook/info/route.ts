import { NextResponse } from "next/server";

/**
 * GET /api/bot/webhook/info
 *
 * Safe diagnostic endpoint for checking Telegram bot webhook status.
 * Does NOT expose the bot token. Returns only safe-to-share information.
 *
 * Use this to verify:
 *   - Bot connectivity (getMe)
 *   - Webhook configuration (getWebhookInfo)
 *
 * In production, this endpoint is unauthenticated. For sensitive environments,
 * add admin authentication middleware.
 */
export async function GET() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const miniAppUrl = process.env.TELEGRAM_MINI_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "not set";

  const errors: string[] = [];
  const results: Record<string, unknown> = {
    service: "vibe-bot-webhook",
    environment: process.env.NODE_ENV || "unknown",
    miniAppUrl,
    webhookEndpoint: "/api/bot/webhook",
    bot: { status: "unknown" },
    webhook: { status: "unknown" },
    errors,
  };

  if (!botToken) {
    errors.push("TELEGRAM_BOT_TOKEN is not configured on this server");
    results.bot = { status: "not_configured" };
    return NextResponse.json(results);
  }

  try {
    // getMe
    const meRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getMe`,
      { signal: AbortSignal.timeout(5000) },
    );
    const meData = await meRes.json();

    if (meData.ok) {
      results.bot = {
        status: "ok",
        username: meData.result.username,
        name: meData.result.first_name,
        id: meData.result.id,
        canJoinGroups: meData.result.can_join_groups,
      };
    } else {
      results.bot = {
        status: "error",
        errorCode: meData.error_code,
        description: meData.description,
      };
      errors.push(`Telegram API error: ${meData.description}`);
    }
  } catch (err) {
    results.bot = { status: "network_error" };
    errors.push(`Failed to reach Telegram API: ${err instanceof Error ? err.message : "Unknown"}`);
  }

  try {
    // getWebhookInfo
    const whRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getWebhookInfo`,
      { signal: AbortSignal.timeout(5000) },
    );
    const whData = await whRes.json();

    if (whData.ok) {
      results.webhook = {
        status: "ok",
        url: whData.result.url || "(not set)",
        hasCustomCertificate: whData.result.has_custom_certificate,
        pendingUpdateCount: whData.result.pending_update_count,
        lastErrorDate: whData.result.last_error_date || null,
        lastErrorMessage: whData.result.last_error_message || null,
        maxConnections: whData.result.max_connections,
        allowedUpdates: whData.result.allowed_updates,
      };

      if (whData.result.last_error_message) {
        errors.push(`Webhook error: ${whData.result.last_error_message}`);
      }
    } else {
      results.webhook = {
        status: "error",
        errorCode: whData.error_code,
        description: whData.description,
      };
    }
  } catch (err) {
    results.webhook = { status: "network_error" };
    errors.push(`Failed to check webhook: ${err instanceof Error ? err.message : "Unknown"}`);
  }

  return NextResponse.json(results);
}
