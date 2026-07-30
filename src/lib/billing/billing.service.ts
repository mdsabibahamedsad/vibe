/**
 * Billing Service — Main Entry Point.
 *
 * Centralizes billing operations and provides the unified API for all
 * subscription and payment functionality.
 *
 * All entry points:
 *   - getSubscriptionStatus — Current premium state for a user
 *   - getPlans — Available subscription plans
 *   - createPurchaseInvoice — Generate invoice for a plan
 *   - cancelSubscription — Cancel active subscription
 *   - restoreSubscription — Check and restore premium status
 *   - getTransactionHistory — User's payment history
 *   - processTelegramUpdate — Handle incoming Telegram payment updates
 */

export { getActivePlans, getPlanBySlug, requireActivePlan, calculateMonthlyPrice } from "./plan.service";
export type { SubscriptionPlan, PlanUpdateInput } from "./plan.service";

export {
  getActiveSubscription,
  getSubscriptionStatus,
  getUserSubscriptions,
  cancelSubscription,
  restoreSubscription,
  reconcileExpiredSubscriptions,
  manualGrantEntitlement,
  manualRevokeEntitlement,
} from "./subscription.service";
export type { SubscriptionInfo, SubscriptionStatus } from "./subscription.service";

export {
  hasEntitlement,
  requireEntitlement,
  getUserEntitlements,
  isPremiumUser,
  getDailyLikeLimit,
  getAllFeatures,
  PremiumFeatures,
} from "./entitlement.service";
export type { PremiumFeatureKey } from "./entitlement.service";

export {
  createInvoiceLink,
  createSubscriptionInvoiceLink,
  generateInvoicePayload,
  parseInvoicePayload,
} from "./telegram-stars.service";

export {
  handlePreCheckoutQuery,
  handleSuccessfulPayment,
  handlePaymentRefund,
} from "./payment-event.service";
