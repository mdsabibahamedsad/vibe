import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

/**
 * POST /api/bot/webhook
 *
 * Telegram Bot webhook endpoint.
 * Handles incoming updates from Telegram via webhook (set via setWebhook API).
 *
 * We use WEBHOOK mode (not polling) because:
 *   1. Next.js serverless functions are well-suited for webhooks
 *   2. No persistent process needed for polling
 *   3. Telegram automatically retries on failure
 *   4. Better scalability — each update invokes a fresh handler
 *
 * Verify the webhook secret header to authenticate the request source.
 * Telegram sends X-Telegram-Bot-Api-Secret-Token header if configured.
 *
 * Handles:
 *   - /start command → welcome message + Mini App deep link
 *   - Deep link start params → redirect to Mini App with params
 *   - Other commands → appropriate responses
 *
 * IMPORTANT:
 *   Never expose the bot token. Read only from environment variable.
 *   Never log sensitive user/payment data.
 */

export async function POST(request: Request) {
  try {
    // Verify webhook secret if configured
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (webhookSecret) {
      const receivedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (!receivedSecret || receivedSecret !== webhookSecret) {
        logger.warn("Bot webhook: Invalid or missing secret token");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const update = await request.json().catch(() => null);
    if (!update) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Handle /start command with optional deep-link parameter
    if (update.message?.text) {
      const text = update.message.text;
      const chatId = update.message.chat?.id;

      if (!chatId) {
        return NextResponse.json({ error: "Missing chat_id" }, { status: 400 });
      }

      const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "vibe_app_bot";
      const miniAppUrl = process.env.TELEGRAM_MINI_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";

      // Parse /start [parameter]
      if (text.startsWith("/start")) {
        const parts = text.split(" ");
        const startParam = parts.length > 1 ? parts[1] : null;

        // Build Mini App deep link URL
        let deepLinkUrl = miniAppUrl;

        if (startParam) {
          // Validate start parameter (alphanumeric + underscore only, max 64 chars)
          const sanitized = startParam.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 64);
          if (sanitized) {
            deepLinkUrl = `https://t.me/${botUsername}/vibe?startapp=${sanitized}`;
          }
        }

        // Return a response containing the welcome message and Mini App button
        const welcomeMessage =
          startParam
            ? `👋 Welcome to Vibe! Use the button below to open the app.`
            : `👋 Welcome to Vibe — Social, Dating & Creator Community!\n\nDiscover people, match, chat, and share.`;

        // We use Telegram Bot API's sendMessage + InlineKeyboardMarkup
        // to send the welcome message with a Mini App launch button.
        // This is done via Telegram Bot API since Next.js webhook
        // responses don't directly support Telegram bot response format.
        await sendTelegramMessage(chatId, welcomeMessage, {
          inline_keyboard: [
            [
              {
                text: "🚀 Open Vibe",
                web_app: { url: deepLinkUrl || miniAppUrl },
              },
            ],
          ],
        });

        logger.info("Bot webhook: /start handled", {
          chatId,
          hasStartParam: !!startParam,
        });
      } else if (text === "/help") {
        await sendTelegramMessage(
          chatId,
          "🤔 *Vibe Help*\n\n" +
            "• /start — Open Vibe Mini App\n" +
            "• /app — Open Vibe directly\n" +
            "• /help — Show this message\n" +
            "• /privacy — Privacy information\n" +
            "• /terms — Terms of Service\n\n" +
            "Need more help? Visit our Help Center.",
        );
      } else if (text === "/app") {
        await sendTelegramMessage(chatId, "🚀 Opening Vibe...", {
          inline_keyboard: [
            [
              {
                text: "🚀 Open Vibe",
                web_app: { url: miniAppUrl },
              },
            ],
          ],
        });
      } else if (text === "/privacy") {
        await sendTelegramMessage(
          chatId,
          "🔒 *Privacy*\n\n" +
            "Vibe respects your privacy. We only collect data necessary to provide the service.\n" +
            "Full privacy policy: [link to your privacy page]\n\n" +
            "You can request data export or account deletion at any time through the app settings.",
        );
      } else if (text === "/terms") {
        await sendTelegramMessage(
          chatId,
          "📋 *Terms of Service*\n\n" +
            "By using Vibe, you agree to our Terms of Service.\n" +
            "Full terms: [link to your terms page]",
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Bot webhook error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    // Always return 200 to prevent Telegram from retrying
    return NextResponse.json({ ok: true });
  }
}

/**
 * Send a message to a Telegram chat via Bot API.
 * Falls back to no-op if bot token is missing (graceful degradation).
 */
async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyMarkup?: { inline_keyboard: Array<Array<{ text: string; web_app?: { url: string }; callback_data?: string }>> },
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    logger.warn("Bot webhook: TELEGRAM_BOT_TOKEN not configured, cannot send message");
    return;
  }

  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    };

    if (replyMarkup) {
      body.reply_markup = JSON.stringify(replyMarkup);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      logger.warn("Bot webhook: Failed to send Telegram message", {
        status: response.status,
        error: errorBody.slice(0, 200),
      });
    }
  } catch (error) {
    logger.warn("Bot webhook: Failed to send Telegram message (network error)", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * GET /api/bot/webhook — returns a simple OK status.
 *
 * Does NOT expose webhook configuration details to unauthenticated callers.
 * For debugging webhook info, use the curl command:
 *   curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
 */
export async function GET() {
  return NextResponse.json({ ok: true, service: "vibe-bot-webhook" });
}

/**
 * POST /api/bot/set-webhook — configure the webhook URL (admin only).
 * This would require admin authorization in production.
 * For now, document the curl command in setup instructions.
 *
 * curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *   -H "Content-Type: application/json" \
 *   -d '{"url":"<YOUR_DOMAIN>/api/bot/webhook","secret_token":"<YOUR_SECRET>"}'
 */
