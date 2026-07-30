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
 *   - /start command → welcome message + Mini App launch button
 *   - Deep link start params → pass through to Mini App
 *   - Other commands → appropriate responses
 *
 * IMPORTANT:
 *   Never expose the bot token. Read only from environment variable.
 *   Never log sensitive user/payment data.
 */

const PRODUCTION_MINI_APP_URL = "https://vibe-sand-phi-five.vercel.app";

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
      logger.warn("Bot webhook: Invalid payload received");
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Log that we received an update (no sensitive data)
    logger.info("Bot webhook: Update received", {
      updateId: update.update_id,
      hasMessage: !!update.message,
      hasCallbackQuery: !!update.callback_query,
      hasPreCheckoutQuery: !!update.pre_checkout_query,
    });

    // Handle /start command with optional deep-link parameter
    if (update.message?.text) {
      const text = update.message.text;
      const chatId = update.message.chat?.id;
      const from = update.message.from;

      if (!chatId) {
        logger.warn("Bot webhook: Missing chat_id in message");
        return NextResponse.json({ error: "Missing chat_id" }, { status: 400 });
      }

      // Log safely (no token or personally identifying info beyond what Telegram already knows)
      logger.info("Bot webhook: Message received", {
        chatId,
        text: text.split(" ")[0], // Only log the command, not full params
        fromId: from?.id,
      });

      const miniAppUrl = getMiniAppUrl();

      // Build a proper Mini App launch button
      const webAppButton = {
        text: "🚀 Open Vibe",
        web_app: { url: miniAppUrl },
      };

      // Parse /start [parameter]
      if (text.startsWith("/start")) {
        const parts = text.split(" ");
        const startParam = parts.length > 1 ? parts[1] : null;

        // If a start param is provided, pass it as startapp parameter to the Mini App
        let buttonUrl = miniAppUrl;
        if (startParam) {
          const sanitized = startParam.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 64);
          if (sanitized) {
            buttonUrl = `${miniAppUrl}?startapp=${sanitized}`;
          }
        }

        const welcomeMessage =
          startParam
            ? `👋 Welcome to Vibe Social App!\n\nUse the button below to open the app.`
            : `👋 Welcome to Vibe — Social, Dating & Creator Community!\n\nDiscover people, match, chat, and share stories.`;

        await sendTelegramMessage(chatId, welcomeMessage, {
          inline_keyboard: [[{ ...webAppButton, web_app: { url: buttonUrl } }]],
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
          inline_keyboard: [[webAppButton]],
        });
      } else if (text === "/privacy") {
        await sendTelegramMessage(
          chatId,
          "🔒 *Privacy*\n\n" +
            "Vibe respects your privacy. We only collect data necessary to provide the service.\n\n" +
            "You can request data export or account deletion at any time through the app settings.",
        );
      } else if (text === "/terms") {
        await sendTelegramMessage(
          chatId,
          "📋 *Terms of Service*\n\n" +
            "By using Vibe, you agree to our Terms of Service.",
        );
      }
    }

    // Handle callback queries (e.g. inline button presses)
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      logger.info("Bot webhook: Callback query received", {
        callbackQueryId: callbackQuery.id,
        data: callbackQuery.data,
      });

      // Answer the callback query to remove the loading state
      await answerCallbackQuery(callbackQuery.id);

      // Handle specific callback data
      if (callbackQuery.data === "open_app") {
        await sendTelegramMessage(
          callbackQuery.message?.chat?.id,
          "🚀 Opening Vibe...",
          {
            inline_keyboard: [
              [{ text: "🚀 Open Vibe", web_app: { url: getMiniAppUrl() } }],
            ],
          },
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
 * Get the Mini App URL from environment or fall back to production URL.
 */
function getMiniAppUrl(): string {
  return (
    process.env.TELEGRAM_MINI_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    PRODUCTION_MINI_APP_URL
  );
}

/**
 * Send a message to a Telegram chat via Bot API.
 *
 * Uses raw JSON body with reply_markup as a direct object (NOT stringified),
 * since Telegram's Bot API accepts JSON natively when Content-Type is
 * application/json.
 *
 * Falls back to graceful no-op if bot token is missing (for local dev).
 */
async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyMarkup?: { inline_keyboard: Array<Array<Record<string, unknown>>> },
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

    // reply_markup is passed as a direct object (not stringified).
    // When Content-Type is application/json, Telegram accepts nested objects.
    if (replyMarkup) {
      body.reply_markup = replyMarkup;
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
      const errorBody = await response.json().catch(() => ({ description: "Unknown error" }));
      logger.warn("Bot webhook: Failed to send Telegram message", {
        status: response.status,
        errorCode: errorBody.error_code,
        description: errorBody.description,
      });
    } else {
      logger.info("Bot webhook: Message sent successfully", { chatId });
    }
  } catch (error) {
    logger.warn("Bot webhook: Failed to send Telegram message (network error)", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Answer a callback query to clear the loading state on the Telegram client.
 */
async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  try {
    const body: Record<string, unknown> = {
      callback_query_id: callbackQueryId,
    };
    if (text) {
      body.text = text;
    }

    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Best-effort
  }
}

/**
 * GET /api/bot/webhook — returns a simple OK status.
 *
 * Does NOT expose webhook configuration details to unauthenticated callers.
 * For debugging webhook info, use:
 *   GET /api/bot/webhook/info
 */
export async function GET() {
  return NextResponse.json({ ok: true, service: "vibe-bot-webhook" });
}
