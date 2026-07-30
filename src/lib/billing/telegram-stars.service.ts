/**
 * Telegram Stars Service.
 *
 * Integrates with the official Telegram Bot API for Telegram Stars payments.
 *
 * Uses the following official API methods:
 *   - createInvoiceLink — Create an invoice link for the Mini App
 *   - answerPreCheckoutQuery — Validate pre-checkout query (10s Telegram timeout)
 *   - refundStarPayment — Refund a Star payment
 *
 * The bot token is kept server-side only (never exposed to client).
 *
 * All external calls use the centralized httpClient with:
 *   - Explicit timeouts (no indefinite requests)
 *   - Retry with exponential backoff + jitter
 *   - Circuit breaker integration
 *   - Trace ID correlation
 */

import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { httpClient } from "@/lib/reliability/http-client";
import { telegramBreaker } from "@/lib/reliability/circuit-breaker";
import type { SubscriptionPlan } from "./plan.service";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

// ============================================================================
// TELEGRAM API METHODS
// ============================================================================

/**
 * Get the Telegram Bot API URL for a method.
 */
function botApiUrl(method: string): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new AppError("TELEGRAM_ERROR", "TELEGRAM_BOT_TOKEN is not configured", {
      statusCode: 500,
    });
  }
  return `${TELEGRAM_API_BASE}${token}/${method}`;
}

/**
 * Call a Telegram Bot API method and return the parsed response.
 *
 * Uses the centralized httpClient with:
 *   - 10s timeout (Telegram requirement for preCheckoutQuery)
 *   - 2 retries with exponential backoff
 *   - Circuit breaker integration
 *   - Request correlation (trace ID)
 */
async function callTelegramApi<T>(
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  const url = botApiUrl(method);

  const response = await httpClient.post<{ ok: boolean; result?: T; error_code?: number; description?: string }>(
    url,
    params,
    {
      timeout: 10_000, // Telegram requires 10s timeout for preCheckoutQuery
      retries: 2,
      retryDelayMs: 1_000,
      circuitBreaker: telegramBreaker,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.data.ok) {
    logger.error("Telegram API error", {
      method,
      errorCode: response.data.error_code,
      description: response.data.description,
      traceId: response.traceId,
    });
    throw new AppError(
      "TELEGRAM_ERROR",
      response.data.description ?? "Telegram API request failed",
      { statusCode: 502, context: { traceId: response.traceId } },
    );
  }

  return response.data.result as T;
}

// ============================================================================
// INVOICE CREATION
// ============================================================================

export interface InvoiceResult {
  link: string;
}

/**
 * Create a Telegram Stars invoice link for a subscription plan.
 *
 * Uses the official createInvoiceLink method.
 * The provider_token is omitted (empty) for Telegram Stars payments.
 *
 * @param plan - The subscription plan to purchase
 * @param invoicePayload - Server-generated payload (user_id + plan_slug)
 * @returns The invoice link to open in the Mini App
 */
export async function createInvoiceLink(
  plan: SubscriptionPlan,
  invoicePayload: string,
): Promise<InvoiceResult> {
  const params: Record<string, unknown> = {
    title: plan.name,
    description: plan.description ?? `${plan.name} — Vibe Premium`,
    payload: invoicePayload,
    currency: "XTR",
    prices: [
      {
        label: plan.name,
        amount: plan.starsPrice,
      },
    ],
    // subscription_period is NOT used here because we manage subscriptions internally
    // based on the successful payment event. This gives us more flexibility.
    // For future: if Telegram automatic recurring subscriptions are needed,
    // pass subscription_period: plan.durationDays * 24 * 60 * 60
  };

  // provider_token is omitted for Telegram Stars (XTR)
  // Do NOT include provider_token in the params

  const result = await callTelegramApi<{ result: string }>("createInvoiceLink", params);

  return { link: result as unknown as string };
}

/**
 * Create a Telegram Stars subscription invoice link for recurring billing.
 *
 * Uses subscription_period parameter for automatic recurring billing.
 * Note: As of 2026, Telegram supports subscription_period in createInvoiceLink.
 *
 * @param plan - The subscription plan
 * @param invoicePayload - Server-generated payload
 * @returns The invoice link
 */
export async function createSubscriptionInvoiceLink(
  plan: SubscriptionPlan,
  invoicePayload: string,
): Promise<InvoiceResult> {
  const subscriptionPeriod = plan.durationDays * 24 * 60 * 60; // Convert days to seconds

  const params: Record<string, unknown> = {
    title: plan.name,
    description: plan.description ?? `${plan.name} — Vibe Premium`,
    payload: invoicePayload,
    currency: "XTR",
    prices: [
      {
        label: plan.name,
        amount: plan.starsPrice,
      },
    ],
    subscription_period: subscriptionPeriod,
  };

  const result = await callTelegramApi<{ result: string }>("createInvoiceLink", params);

  return { link: result as unknown as string };
}

// ============================================================================
// PRE-CHECKOUT QUERY
// ============================================================================

export interface PreCheckoutQuery {
  id: string;
  from: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
    language_code?: string;
  };
  currency: string;
  total_amount: number;
  invoice_payload: string;
  subscription_expiration_date?: number;
  is_recurring?: boolean;
  is_first_recurring?: boolean;
}

/**
 * Answer a pre-checkout query (must respond within 10 seconds).
 *
 * @param queryId - The pre_checkout_query id
 * @param ok - Whether to approve the transaction
 * @param errorMessage - Optional error message if rejecting
 */
export async function answerPreCheckoutQuery(
  queryId: string,
  ok: boolean,
  errorMessage?: string,
): Promise<void> {
  const params: Record<string, unknown> = {
    pre_checkout_query_id: queryId,
    ok,
  };

  if (!ok && errorMessage) {
    params.error_message = errorMessage;
  }

  await callTelegramApi("answerPreCheckoutQuery", params);
}

// ============================================================================
// SUCCESSFUL PAYMENT
// ============================================================================

export interface SuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  subscription_expiration_date?: number;
  is_recurring?: boolean;
  is_first_recurring?: boolean;
  telegram_payment_charge_id: string;
  provider_payment_charge_id?: string;
}

// ============================================================================
// REFUND
// ============================================================================

/**
 * Refund a Telegram Stars payment.
 *
 * Uses the official refundStarPayment method.
 * Requires the user ID and the telegram_payment_charge_id.
 */
export async function refundStarPayment(
  userId: number,
  telegramPaymentChargeId: string,
): Promise<void> {
  await callTelegramApi("refundStarPayment", {
    user_id: userId,
    telegram_payment_charge_id: telegramPaymentChargeId,
  });

  logger.info("Star payment refunded", { userId, telegramPaymentChargeId });
}

// ============================================================================
// PAYLOAD GENERATION
// ============================================================================

/**
 * Generate a secure invoice payload.
 *
 * Format: vibe:{user_id}:{plan_slug}:{timestamp}:{random_suffix}
 *
 * This payload is:
 *   - Server-generated (client cannot forge)
 *   - Includes the user ID to bind the payment (prevent user A paying for user B)
 *   - Includes the plan slug so server can resolve current price
 *   - Includes timestamp for ordering
 *   - Includes random suffix to prevent collisions
 */
export function generateInvoicePayload(
  userId: string,
  planSlug: string,
): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `vibe:${userId}:${planSlug}:${timestamp}:${random}`;
}

/**
 * Parse an invoice payload to extract user ID and plan slug.
 *
 * Format: vibe:{user_id}:{plan_slug}:{timestamp}:{random_suffix}
 */
export function parseInvoicePayload(
  payload: string,
): { userId: string; planSlug: string } | null {
  const parts = payload.split(":");
  if (parts.length < 4 || parts[0] !== "vibe") return null;

  return {
    userId: parts[1],
    planSlug: parts[2],
  };
}
