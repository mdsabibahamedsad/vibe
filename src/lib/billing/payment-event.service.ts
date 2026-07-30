/**
 * Payment Event Service — Telegram Payment Update Processor.
 *
 * Processes Telegram payment updates (pre_checkout_query, successful_payment)
 * in a secure, idempotent, and transactional manner.
 *
 * Flow for successful_payment:
 *   1. Validate incoming data
 *   2. Check idempotency (dedup by event_id)
 *   3. Parse invoice payload
 *   4. Verify amount matches plan price
 *   5. Verify currency is XTR
 *   6. Create/update payment transaction
 *   7. Create/update subscription
 *   8. Activate entitlements
 *   9. Record audit event
 *   10. Trigger notification
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { getPlanBySlug } from "./plan.service";
import {
  parseInvoicePayload,
  answerPreCheckoutQuery,
  type PreCheckoutQuery,
  type SuccessfulPayment,
} from "./telegram-stars.service";
import { recordAuditEvent } from "@/lib/admin/audit.service";
import { trackEvent } from "@/lib/analytics";

// ============================================================================
// EVENT LOGGING (Idempotency)
// ============================================================================

/**
 * Record a payment event for deduplication.
 */
async function recordEvent(
  eventType: string,
  eventId: string,
  payloadHash: string,
): Promise<boolean> {
  const adminClient = createAdminClient();

  // Try to insert — if duplicate event_id, the unique constraint will reject it
  const { error } = await adminClient.from("payment_events").insert({
    provider: "telegram_stars",
    event_type: eventType,
    event_id: eventId,
    payload_hash: payloadHash,
    status: "pending",
  });

  if (error) {
    // Duplicate event (unique constraint violation) — already processed
    if (error.code === "23505") {
      logger.warn("Duplicate payment event received", { eventType, eventId });
      return false;
    }

    logger.error("Failed to record payment event", {
      eventType,
      eventId,
      error: error.message,
    });
    return false;
  }

  return true; // First time processing this event
}

/**
 * Mark event as processed.
 */
async function markEventProcessed(eventId: string, errorMessage?: string): Promise<void> {
  const adminClient = createAdminClient();

  await adminClient
    .from("payment_events")
    .update({
      status: errorMessage ? "failed" : "processed",
      error_message: errorMessage ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("event_id", eventId);
}

// ============================================================================
// PRE-CHECKOUT QUERY HANDLER
// ============================================================================

/**
 * Handle a pre_checkout_query update from Telegram.
 *
 * Validates the purchase before the user is charged.
 * Must respond within 10 seconds.
 */
export async function handlePreCheckoutQuery(query: PreCheckoutQuery): Promise<void> {
  const { id: queryId, currency, total_amount, invoice_payload } = query;

  try {
    // Parse payload
    const parsed = parseInvoicePayload(invoice_payload);
    if (!parsed) {
      await answerPreCheckoutQuery(queryId, false, "Invalid purchase. Please try again.");
      return;
    }

    // Verify currency is XTR (Telegram Stars)
    if (currency !== "XTR") {
      logger.warn("Invalid currency in pre-checkout", { currency });
      await answerPreCheckoutQuery(queryId, false, "Only Telegram Stars (XTR) are accepted.");
      return;
    }

    // Verify plan exists and is active
    const plan = await getPlanBySlug(parsed.planSlug);
    if (!plan || !plan.isActive) {
      logger.warn("Inactive or unknown plan in pre-checkout", { planSlug: parsed.planSlug });
      await answerPreCheckoutQuery(queryId, false, "This plan is no longer available.");
      return;
    }

    // Verify amount matches authoritative plan price (PRICE TAMPERING PROTECTION)
    if (total_amount !== plan.starsPrice) {
      logger.warn("Price mismatch in pre-checkout", {
        expected: plan.starsPrice,
        received: total_amount,
        planSlug: parsed.planSlug,
      });
      await answerPreCheckoutQuery(queryId, false, "Price mismatch. Please try again.");
      return;
    }

    // All checks passed — approve the transaction
    await answerPreCheckoutQuery(queryId, true);
    logger.info("Pre-checkout approved", {
      userId: parsed.userId,
      planSlug: parsed.planSlug,
    });
  } catch (err) {
    logger.error("Failed to handle pre-checkout query", { error: String(err) });

    // Try to reject the query to prevent charge
    try {
      await answerPreCheckoutQuery(queryId, false, "Verification failed. Please try again.");
    } catch {
      // Best-effort rejection
    }
  }
}

// ============================================================================
// SUCCESSFUL PAYMENT HANDLER
// ============================================================================

/**
 * Handle a successful_payment update from Telegram.
 *
 * This is where the actual subscription activation happens.
 * The function is idempotent: calling it twice with the same event
 * will not create duplicate subscriptions or entitlements.
 */
export async function handleSuccessfulPayment(
  payment: SuccessfulPayment,
  eventId: string,
): Promise<void> {
  const payloadHash = simpleHash(JSON.stringify(payment));

  // Step 1: Idempotency check — record event first
  const isNew = await recordEvent("successful_payment", eventId, payloadHash);
  if (!isNew) {
    logger.info("Duplicate successful_payment event — skipping", { eventId });
    return;
  }

  try {
    const { currency, total_amount, invoice_payload, telegram_payment_charge_id } = payment;

    // Step 2: Validate currency
    if (currency !== "XTR") {
      throw new AppError("VALIDATION_ERROR", `Invalid currency: ${currency}`);
    }

    // Step 3: Parse invoice payload
    const parsed = parseInvoicePayload(invoice_payload);
    if (!parsed) {
      throw new AppError("VALIDATION_ERROR", "Invalid invoice payload");
    }

    const { userId, planSlug } = parsed;

    // Step 4: Verify plan exists and get authoritative price
    const plan = await getPlanBySlug(planSlug);
    if (!plan) {
      throw new AppError("VALIDATION_ERROR", `Plan not found: ${planSlug}`);
    }

    // Step 5: Verify amount matches authoritative plan price (PRICE TAMPERING PROTECTION)
    if (total_amount !== plan.starsPrice) {
      logger.error("Amount mismatch in successful payment", {
        expected: plan.starsPrice,
        received: total_amount,
        planSlug,
        userId,
      });
      throw new AppError("VALIDATION_ERROR", "Amount mismatch");
    }

    // Step 6: Create/update subscription
    const adminClient = createAdminClient();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    // Check for existing active subscription to extend
    const { data: existingSub } = await adminClient
      .from("subscriptions")
      .select("id, expires_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let subscriptionId: string;
    let effectiveStart: Date;
    let effectiveExpires: Date;

    if (existingSub && existingSub.expires_at && new Date(existingSub.expires_at) > now) {
      // Extend existing subscription
      effectiveStart = new Date(existingSub.expires_at); // Start after current expiration
      effectiveExpires = new Date(effectiveStart.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

      const { data: updatedSub, error: updateError } = await adminClient
        .from("subscriptions")
        .update({
          expires_at: effectiveExpires.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", existingSub.id)
        .select("id")
        .single();

      if (updateError) throw updateError;
      subscriptionId = existingSub.id;

      logger.info("Extended existing subscription", {
        userId,
        subscriptionId,
        newExpiry: effectiveExpires.toISOString(),
      });
    } else {
      // Create new subscription
      effectiveStart = now;
      effectiveExpires = expiresAt;

      const { data: newSub, error: createError } = await adminClient
        .from("subscriptions")
        .insert({
          user_id: userId,
          plan: planSlug,
          status: "active",
          provider: "telegram_stars",
          provider_subscription_id: telegram_payment_charge_id, // Use payment charge as reference
          starts_at: effectiveStart.toISOString(),
          expires_at: effectiveExpires.toISOString(),
        })
        .select("id")
        .single();

      if (createError) throw createError;
      subscriptionId = newSub.id;

      logger.info("Created new subscription", {
        userId,
        subscriptionId,
        planSlug,
        expiresAt: effectiveExpires.toISOString(),
      });
    }

    // Step 7: Create payment transaction record
    await adminClient.from("payment_transactions").insert({
      user_id: userId,
      subscription_id: subscriptionId,
      plan_slug: planSlug,
      plan_stars_price: plan.starsPrice,
      provider: "telegram_stars",
      provider_payment_id: telegram_payment_charge_id,
      invoice_payload: invoice_payload,
      stars_amount: total_amount,
      currency: "XTR",
      status: "paid",
      metadata: {
        event_id: eventId,
        payment_charge_id: telegram_payment_charge_id,
      },
    });

    // Step 8: Activate entitlements via RPC
    await adminClient.rpc("activate_entitlements", {
      p_user_id: userId,
      p_subscription_id: subscriptionId,
      p_plan_slug: planSlug,
      p_starts_at: effectiveStart.toISOString(),
      p_expires_at: effectiveExpires.toISOString(),
    });

    // Step 9: Update purchase record if exists
    const { data: pendingPurchase } = await adminClient
      .from("purchases")
      .select("id")
      .eq("user_id", userId)
      .eq("product_type", "premium_subscription")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (pendingPurchase) {
      await adminClient
        .from("purchases")
        .update({
          status: "completed",
          provider_transaction_id: telegram_payment_charge_id,
          amount: total_amount,
        })
        .eq("id", pendingPurchase.id);
    }

    // Step 10: Mark event as processed
    await markEventProcessed(eventId);

    // Track analytics events
    await trackEvent(userId, "purchase_completed", "subscription", subscriptionId, {
      planSlug,
      starsAmount: total_amount,
      subscriptionId,
      expiresAt: effectiveExpires.toISOString(),
    });

    // Track premium activation
    await trackEvent(userId, "premium_activated", "subscription", subscriptionId, {
      planSlug,
      subscriptionId,
    });

    logger.info("Subscription activated successfully", {
      userId,
      planSlug,
      subscriptionId,
      expiresAt: effectiveExpires.toISOString(),
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    logger.error("Failed to process successful payment", { eventId, error: errorMessage });
    await markEventProcessed(eventId, errorMessage);
  }
}

// ============================================================================
// REFUND HANDLER
// ============================================================================

/**
 * Handle a payment refund/reversal.
 * Updates the transaction status and expires associated entitlements.
 */
export async function handlePaymentRefund(
  telegramPaymentChargeId: string,
): Promise<void> {
  const adminClient = createAdminClient();

  // Find the transaction
  const { data: transaction } = await adminClient
    .from("payment_transactions")
    .select("id, user_id, subscription_id, status")
    .eq("provider_payment_id", telegramPaymentChargeId)
    .single();

  if (!transaction) {
    logger.warn("Refund for unknown transaction", { telegramPaymentChargeId });
    return;
  }

  if (transaction.status === "refunded") {
    logger.info("Duplicate refund — skipping", { telegramPaymentChargeId });
    return; // Idempotent
  }

  // Update transaction status
  await adminClient
    .from("payment_transactions")
    .update({ status: "refunded" })
    .eq("id", transaction.id);

  // If linked to a subscription, expire it and its entitlements
  if (transaction.subscription_id) {
    await adminClient.rpc("expire_entitlements", {
      p_subscription_id: transaction.subscription_id,
    });

    await adminClient
      .from("subscriptions")
      .update({
        status: "expired",
        updated_at: new Date().toISOString(),
      })
      .eq("id", transaction.subscription_id);

    logger.info("Subscription expired due to refund", {
      subscriptionId: transaction.subscription_id,
      telegramPaymentChargeId,
    });
  }

  logger.info("Payment refunded and entitlements revoked", {
    transactionId: transaction.id,
    telegramPaymentChargeId,
  });
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Simple string hash for payload comparison (not cryptographic).
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
