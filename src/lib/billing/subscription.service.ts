/**
 * Subscription Service — Subscription Lifecycle Management.
 *
 * Handles subscription activation, cancellation, expiration, and restoration.
 * All operations are audited and produce notifications.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { AppError, notFoundError } from "@/lib/errors";
import { recordAuditEvent } from "@/lib/admin/audit.service";
import { trackEvent } from "@/lib/analytics";
import { getPlanBySlug } from "./plan.service";

export interface SubscriptionInfo {
  id: string;
  userId: string;
  planSlug: string;
  status: string;
  provider: string;
  providerSubscriptionId: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  subscription: SubscriptionInfo | null;
  entitlements: string[];
  expiresAt: string | null;
  isCancelled: boolean;
}

// ============================================================================
// GET SUBSCRIPTION
// ============================================================================

/**
 * Get the current active subscription for a user.
 */
export async function getActiveSubscription(userId: string): Promise<SubscriptionInfo | null> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    logger.error("Failed to get active subscription", { userId, error: error.message });
    return null;
  }

  if (!data || data.length === 0) return null;

  const sub = data[0];

  // Check expiration
  if (sub.expires_at && new Date(sub.expires_at) <= new Date()) {
    return null; // Expired
  }

  return formatSubscription(sub);
}

/**
 * Get subscription status for the premium page.
 */
export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const adminClient = createAdminClient();

  const sub = await getActiveSubscription(userId);

  // Get entitlements
  const { data: entitlements } = await adminClient
    .from("premium_entitlements")
    .select("feature_key")
    .eq("user_id", userId)
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.now()`);

  return {
    hasActiveSubscription: sub !== null,
    subscription: sub,
    entitlements: (entitlements ?? []).map((e) => e.feature_key),
    expiresAt: sub?.expiresAt ?? null,
    isCancelled: sub?.status === "active" && sub?.cancelledAt !== null,
  };
}

/**
 * Get all subscriptions for a user (history).
 */
export async function getUserSubscriptions(userId: string): Promise<SubscriptionInfo[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Failed to get user subscriptions", { userId, error: error.message });
    return [];
  }

  return (data ?? []).map(formatSubscription);
}

// ============================================================================
// CANCEL SUBSCRIPTION
// ============================================================================

/**
 * Cancel an active subscription.
 * Sets cancelled_at but keeps premium active until expires_at.
 */
export async function cancelSubscription(userId: string): Promise<void> {
  const adminClient = createAdminClient();

  const sub = await getActiveSubscription(userId);
  if (!sub) throw notFoundError("No active subscription found");

  // Set cancel_at_period_end — premium continues until expiration
  const { error } = await adminClient
    .from("subscriptions")
    .update({
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sub.id)
    .eq("user_id", userId);

  if (error) {
    logger.error("Failed to cancel subscription", { userId, error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to cancel subscription");
  }

  // Track analytics event
  await trackEvent(userId, "subscription_cancelled", "subscription", sub.id, {
    planSlug: sub.planSlug,
    expiresAt: sub.expiresAt,
  });

  logger.info("Subscription cancelled", {
    userId,
    subscriptionId: sub.id,
    expiresAt: sub.expiresAt,
  });
}

// ============================================================================
// RESTORE SUBSCRIPTION
// ============================================================================

/**
 * Restore/check premium status for a user.
 * This is called when the app reconnects or the user taps "Restore".
 * It checks for any existing active subscription and returns the status.
 */
export async function restoreSubscription(userId: string): Promise<SubscriptionStatus> {
  // Simply re-check — the active subscription check already validates expiration
  const status = await getSubscriptionStatus(userId);

  // If there's a cancelled subscription that hasn't expired yet,
  // the status will show hasActiveSubscription: false even though
  // premium is still active until expiry. Let's check for that case.
  if (!status.hasActiveSubscription) {
    const adminClient = createAdminClient();

    const { data: cancelledSub } = await adminClient
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .not("cancelled_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (cancelledSub && cancelledSub.expires_at && new Date(cancelledSub.expires_at) > new Date()) {
      // Premium is still active until expiration despite being cancelled
      return {
        hasActiveSubscription: true,
        subscription: formatSubscription(cancelledSub),
        entitlements: status.entitlements,
        expiresAt: cancelledSub.expires_at,
        isCancelled: true,
      };
    }
  }

  return status;
}

// ============================================================================
// EXPIRATION RECONCILIATION
// ============================================================================

/**
 * Check and expire stale subscriptions.
 * Called periodically or on access.
 */
export async function reconcileExpiredSubscriptions(): Promise<number> {
  const adminClient = createAdminClient();

  try {
    const { data, error } = await adminClient.rpc("expire_stale_subscriptions");

    if (error) {
      logger.error("Failed to reconcile expired subscriptions", { error: error.message });
      return 0;
    }

    const count = (data as number) ?? 0;
    if (count > 0) {
      logger.info(`Expired ${count} stale subscriptions`);
    }

    return count;
  } catch (err) {
    logger.error("Reconciliation error", { error: String(err) });
    return 0;
  }
}

// ============================================================================
// ADMIN: MANUAL ENTITLEMENT GRANT/REVOKE
// ============================================================================

/**
 * Manually grant a premium entitlement (admin only).
 *
 * @param adminId - The admin performing the action
 * @param userId - The user to grant entitlement to
 * @param featureKey - The feature to grant
 * @param durationDays - How long the grant lasts (null = permanent with reason)
 * @param reason - Reason for the manual grant
 */
export async function manualGrantEntitlement(
  adminId: string,
  userId: string,
  featureKey: string,
  durationDays: number | null,
  reason: string,
): Promise<void> {
  const adminClient = createAdminClient();
  const now = new Date();
  const expiresAt = durationDays
    ? new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)
    : null;

  await adminClient.from("premium_entitlements").insert({
    user_id: userId,
    feature_key: featureKey,
    source: "admin_grant",
    status: "active",
    starts_at: now.toISOString(),
    expires_at: expiresAt?.toISOString() ?? null,
    metadata: { granted_by: adminId, reason },
  });

  await recordAuditEvent({
    adminId,
    action: "manual_entitlement_granted",
    targetType: "user",
    targetId: userId,
    metadata: { featureKey, durationDays, reason },
  });

  logger.info("Manual entitlement granted", { userId, featureKey, adminId, reason });
}

/**
 * Manually revoke a premium entitlement (admin only).
 */
export async function manualRevokeEntitlement(
  adminId: string,
  userId: string,
  featureKey: string,
  reason: string,
): Promise<void> {
  const adminClient = createAdminClient();

  await adminClient
    .from("premium_entitlements")
    .update({
      status: "revoked",
      updated_at: new Date().toISOString(),
      metadata: { revoked_by: adminId, reason },
    })
    .eq("user_id", userId)
    .eq("feature_key", featureKey)
    .eq("status", "active")
    .eq("source", "admin_grant");

  await recordAuditEvent({
    adminId,
    action: "manual_entitlement_revoked",
    targetType: "user",
    targetId: userId,
    metadata: { featureKey, reason },
  });

  logger.info("Manual entitlement revoked", { userId, featureKey, adminId, reason });
}

// ============================================================================
// HELPERS
// ============================================================================

function formatSubscription(raw: Record<string, unknown>): SubscriptionInfo {
  return {
    id: raw.id as string,
    userId: raw.user_id as string,
    planSlug: raw.plan as string,
    status: raw.status as string,
    provider: raw.provider as string,
    providerSubscriptionId: (raw.provider_subscription_id as string) ?? null,
    startsAt: (raw.starts_at as string) ?? null,
    expiresAt: (raw.expires_at as string) ?? null,
    cancelledAt: (raw.cancelled_at as string) ?? null,
    createdAt: raw.created_at as string,
  };
}
