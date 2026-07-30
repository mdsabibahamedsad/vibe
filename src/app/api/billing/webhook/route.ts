/**
 * POST /api/billing/webhook — Handle incoming Telegram payment updates.
 *
 * This endpoint receives Telegram Bot API updates related to payments:
 *   - pre_checkout_query
 *   - successful_payment (via message)
 *   - subscription/bot updates
 *
 * Security:
 *   - Validates the bot token matches before processing
 *   - Uses idempotent event processing (duplicate detection)
 *   - Never trusts client-provided data
 *   - Only processes XTR currency
 *   - Verifies amounts against authoritative plan prices
 *
 * IMPORTANT: In production, this should be called from a Telegram Bot
 * webhook, not directly from the Mini App. The bot webhook URL should
 * be set via setWebhook pointing to this endpoint.
 *
 * For Mini App purchases, the flow is:
 *   1. Client requests invoice link from /api/billing/invoice
 *   2. Client opens invoice via Telegram.WebApp.openInvoice()
 *   3. Telegram sends pre_checkout_query to bot webhook -> this endpoint
 *   4. Telegram sends successful_payment to bot webhook -> this endpoint
 *   5. Client refreshes premium status via /api/billing/subscription
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { handlePreCheckoutQuery, handleSuccessfulPayment } from "@/lib/billing/payment-event.service";
import type { PreCheckoutQuery, SuccessfulPayment } from "@/lib/billing/telegram-stars.service";

/**
 * Validate that the request is coming from Telegram.
 * Checks the secret token if configured, or returns 401.
 */
function validateWebhookSecret(request: NextRequest): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured — allow in development
    return process.env.NODE_ENV !== "production";
  }

  const headerSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  return headerSecret === secret;
}

export async function POST(request: NextRequest) {
  // Validate webhook secret
  if (!validateWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const update = await request.json();

    // Handle pre_checkout_query
    if (update.pre_checkout_query) {
      const query = update.pre_checkout_query as PreCheckoutQuery;

      logger.info("Processing pre_checkout_query", {
        queryId: query.id,
        userId: query.from.id,
        amount: query.total_amount,
        currency: query.currency,
      });

      await handlePreCheckoutQuery(query);

      return NextResponse.json({ ok: true });
    }

    // Handle successful_payment (may be in a message or in payment fields)
    if (update.message?.successful_payment) {
      const payment = update.message.successful_payment as SuccessfulPayment;
      const eventId = `payment:${update.update_id}`;

      logger.info("Processing successful_payment", {
        eventId,
        chargeId: payment.telegram_payment_charge_id,
        amount: payment.total_amount,
        currency: payment.currency,
      });

      await handleSuccessfulPayment(payment, eventId);

      return NextResponse.json({ ok: true });
    }

    // Handle subscription updates (BotSubscriptionUpdated)
    if (update.subscription_updated || update.my_chat_member?.subscription) {
      logger.info("Processing subscription update", {
        updateId: update.update_id,
        type: update.subscription_updated ? "subscription_updated" : "my_chat_member",
      });

      // Acknowledge receipt
      return NextResponse.json({ ok: true });
    }

    // Unknown update type — acknowledge but log
    logger.info("Unhandled Telegram update type", {
      updateId: update.update_id,
      keys: Object.keys(update),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("Failed to process Telegram update", {
      error: err instanceof Error ? err.message : "Unknown",
    });

    // Always return 200 to Telegram to prevent retry loops
    return NextResponse.json({ ok: true });
  }
}

/**
 * GET /api/billing/webhook — Verify webhook is working (health check).
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Telegram payment webhook is active",
    env: process.env.NODE_ENV,
  });
}
