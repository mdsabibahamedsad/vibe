# Vibe — Billing System

## Overview

The billing system provides a complete subscription management and payment processing infrastructure using Telegram Stars (XTR). It is designed to be secure, idempotent, auditable, and provider-agnostic.

### Architecture

```
Premium UI (/premium)
    ↓
Billing API Routes (/api/billing/*)
    ↓
Billing Service Layer
    ├── plan.service — Plan catalog
    ├── subscription.service — Subscription lifecycle
    ├── entitlement.service — Feature gating
    ├── telegram-stars.service — Telegram API integration
    └── payment-event.service — Update processing
    ↓
Supabase (tables + RLS + functions + triggers)
```

### Key Design Principles

1. **Server-side authority**: All pricing comes from the database (not client)
2. **Idempotent processing**: Duplicate events produce no duplicate effects
3. **Transactional activation**: Payment → subscription → entitlement → analytics in atomic steps
4. **Clear source separation**: Paid subscriptions vs admin grants vs promotions
5. **Audit trail**: Every billing operation creates an audit event

---

## 1. Subscription Plans

Plans are stored in `subscription_plans` table. This is the single source of truth for pricing.

| Plan | Stars | Duration | Effective Monthly |
|------|-------|----------|-------------------|
| Premium Monthly | 500 | 30 days | 500 ⭐/mo |
| Premium Quarterly | 1,275 | 90 days | ~425 ⭐/mo (save 15%) |
| Premium Yearly | 3,600 | 365 days | ~300 ⭐/mo (save 40%) |

### Features included per plan

| Feature | Monthly | Quarterly | Yearly |
|---------|:-------:|:---------:|:------:|
| Premium Badge | ✅ | ✅ | ✅ |
| Advanced Discovery | ✅ | ✅ | ✅ |
| Unlimited Likes | ✅ | ✅ | ✅ |
| Advanced Filters | ✅ | ✅ | ✅ |
| Who Liked You | ✅ | ✅ | ✅ |
| Read Receipts | ✅ | ✅ | ✅ |
| Incognito Mode | ❌ | ❌ | ✅ |
| Profile Boost | ❌ | ❌ | ✅ |

---

## 2. Entitlement Model

### Premium Feature Registry

All premium features are defined in `entitlement.service.ts`:

| Key | Feature |
|-----|---------|
| `premium_badge` | Premium badge on profile |
| `advanced_discovery` | Additional discovery filters |
| `unlimited_likes` | No daily like limit |
| `advanced_filters` | Filter by more criteria |
| `profile_boost` | Get seen by more people |
| `rewind` | Go back to passed profiles |
| `who_liked_you` | See who likes you |
| `read_receipts` | See message read status |
| `incognito_mode` | Browse without being seen |

### Entitlement Sources

| Source | Description |
|--------|-------------|
| `subscription` | Paid via Telegram Stars |
| `promotion` | Free trial or promo code (future) |
| `admin_grant` | Manual grant by admin |

### Checking Entitlements

```ts
import { hasEntitlement, requireEntitlement, PremiumFeatures } from "@/lib/billing/entitlement.service";

// Check
const hasBadge = await hasEntitlement(userId, PremiumFeatures.PREMIUM_BADGE);

// Require (throws 403 if not entitled)
await requireEntitlement(userId, PremiumFeatures.UNLIMITED_LIKES);
```

---

## 3. Telegram Stars Integration

### Invoice Flow

```
1. User selects plan on /premium
2. POST /api/billing/invoice → server creates Telegram invoice link
3. Client opens link via Telegram.WebApp.openInvoice(url, callback)
4. Telegram shows native payment sheet to user
5. User confirms → Telegram sends pre_checkout_query to webhook
6. Server validates (price, currency, plan) → answers query
7. Telegram processes payment → sends successful_payment to webhook
8. Server verifies and activates subscription + entitlements
9. Client refreshes subscription status via /api/billing/subscription
```

### Invoice Payload Security

Each invoice payload is server-generated with the format:
```
vibe:{user_id}:{plan_slug}:{timestamp}:{random_suffix}
```

This prevents:
- **User ID tampering**: Payment is bound to the authenticated user
- **Plan tampering**: Plan slug is embedded; server resolves current price
- **Replay attacks**: Payload includes timestamp + random suffix

### Price Tampering Protection

At every step, the server verifies the amount against the authoritative plan price:
- Plan lookup by slug (client never provides price)
- Pre-checkout amount verification
- Successful payment amount verification

### Currency

Only `XTR` (Telegram Stars) is accepted. Non-XTR payments are rejected.

---

## 4. Subscription Lifecycle

### States

```
pending → active → cancelled (at period end) → expired
           ↑                            ↓
           └────── restore ─────────────┘
           ↓
           expired (at period end)
```

### Activation

When a successful_payment is received:
1. Payment event recorded (idempotency)
2. Payment transaction created
3. Subscription created/extended
4. Entitlements activated per plan features
5. Purchase record updated

### Extending Existing Subscriptions

If a user already has an active subscription and purchases more:
- The new period is appended to the existing subscription
- `expires_at` is extended by the plan's duration days
- No overlapping subscriptions

### Cancellation

- Sets `cancelled_at` timestamp
- Premium continues until `expires_at`
- Auto-renewal stops
- User can still use premium features until expiry

### Expiration

- Checked server-side on every entitlement check
- Scheduled reconciliation via `expire_stale_subscriptions()` function
- Expired entitlements automatically deny feature access

### Restoration

- The `/api/billing/restore` endpoint re-checks server-side records
- Never trusts cached client state
- Finds any active or recently-cancelled (still within expiry) subscriptions

---

## 5. Payment Events

All Telegram payment updates are processed through `payment_event.service.ts`:

| Event Type | Handler | Purpose |
|------------|---------|---------|
| `pre_checkout_query` | `handlePreCheckoutQuery` | Validate before charging |
| `successful_payment` | `handleSuccessfulPayment` | Activate subscription |
| `subscription_update` | Logged | Track subscription changes |

### Idempotency

- Each event is recorded with a unique `event_id`
- Database unique constraint prevents duplicate processing
- Duplicate events are logged and skipped

### Retry Safety

If processing fails:
- Event is marked as "failed" with error message
- Can be reprocessed manually via admin
- Safe to retry due to idempotency checks

---

## 6. Refund Handling

When a payment is refunded via `refundStarPayment`:

1. Transaction status updated to "refunded"
2. Associated subscription expired
3. All entitlements from that subscription revoked
4. Audit event created

---

## 7. API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/billing/plans` | Public | List available plans |
| POST | `/api/billing/invoice` | Bearer | Create invoice for purchase |
| GET | `/api/billing/subscription` | Bearer | Current subscription status |
| POST | `/api/billing/cancel` | Bearer | Cancel subscription |
| POST | `/api/billing/restore` | Bearer | Restore premium status |
| GET | `/api/billing/transactions` | Bearer | Payment history |
| POST | `/api/billing/webhook` | Secret | Telegram payment updates |

---

## 8. Database Tables

| Table | Purpose |
|-------|---------|
| `subscription_plans` | Plan catalog (prices, features, active) |
| `premium_entitlements` | Per-user feature grants |
| `payment_transactions` | Payment records |
| `payment_events` | Telegram update event log (dedup) |

### RLS Policies

| Table | User | Admin |
|-------|------|-------|
| `subscription_plans` | Public read | All |
| `premium_entitlements` | Own read only | All |
| `payment_transactions` | Own read only | All |
| `payment_events` | No access | All |

---

## 9. Security Tests

### Price Manipulation
Client sends `{ planSlug: "premium_monthly" }` but intercepts and changes the invoice:
- **Server response**: Invoice created with authoritative price from DB
- **Pre-checkout**: Amount verified against plan price
- **Result**: Manipulation detected and rejected

### User ID Tampering
Client attempts to change user_id in payload:
- **Protection**: Payload is server-generated and signed with auth session
- **Result**: User B cannot use User A's payment

### Payment Replay
Same successful_payment event sent twice:
- **Protection**: Unique constraint on `(provider, event_id)`
- **Result**: Second event is ignored (idempotent)

### Expired Subscription Bypass
Client sends `expires_at=2099`:
- **Protection**: Server ignores client-provided dates; uses authoritative calculations
- **Result**: Access denied

---

## 10. Analytics Events

| Event | When |
|-------|------|
| `premium_page_viewed` | User loads /premium |
| `plan_selected` | User clicks a plan |
| `purchase_started` | Invoice link created |
| `purchase_completed` | Payment verified successfully |
| `purchase_failed` | Payment failed or rejected |
| `subscription_renewed` | Subscription extended |
| `subscription_cancelled` | Subscription cancelled |
| `subscription_expired` | Subscription expired |
| `premium_restored` | Premium restored via restore flow |

---

## 11. Retention

| Data | Retention |
|------|-----------|
| Payment transactions | Indefinite (financial records) |
| Subscriptions | Indefinite |
| Entitlements | Indefinite |
| Payment events | 90 days (dedup log) |
| Audit logs | Indefinite |

---

## 12. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot API token for invoice creation |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (server-side only) |
| `TELEGRAM_WEBHOOK_SECRET` | Production | Secret token for webhook validation |

---

## 13. Failure Recovery

| Failure | Recovery |
|---------|----------|
| Payment processed but entitlement not activated | Reconciliation detects inconsistency |
| Invoice link creation fails | Client shows error with retry option |
| Webhook processing fails | Idempotent — safe to retry |
| Duplicate payment event | Unique constraint prevents double processing |
