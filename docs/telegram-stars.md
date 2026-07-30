# Vibe — Telegram Stars Integration

## Overview

Vibe uses **Telegram Stars (XTR)** as its native payment currency for premium subscriptions. This document describes the implementation details, API methods used, and security considerations.

## Telegram Bot API Methods Used

### `createInvoiceLink`

Creates an invoice link for one-time purchases.

**Parameters:**
- `title`: Plan name
- `description`: Plan description
- `payload`: Server-generated secure payload (`vibe:{user_id}:{plan_slug}:{timestamp}:{random}`)
- `currency`: `"XTR"` (Telegram Stars)
- `prices`: Array of `{ label, amount }` with the amount in whole Stars

**Note**: `provider_token` is omitted for Telegram Stars payments.

### `answerPreCheckoutQuery`

Must respond within **10 seconds** after the user confirms payment.

**Parameters:**
- `pre_checkout_query_id`: The query ID
- `ok`: `true` to approve, `false` to reject
- `error_message`: Required if `ok: false` (displayed to user)

### `refundStarPayment`

Refunds a Telegram Stars payment.

**Parameters:**
- `user_id`: The user's Telegram ID
- `telegram_payment_charge_id`: The charge ID from the successful payment

## Payment Flow

```
┌──────────┐     ┌─────────────┐     ┌──────────┐     ┌──────────┐
│  Client   │     │  Vibe API   │     │ Telegram │     │ Supabase │
│ (Mini App)│     │  (Server)   │     │ Bot API  │     │   DB     │
└────┬─────┘     └──────┬──────┘     └────┬─────┘     └────┬─────┘
     │                  │                  │                │
     │ 1. Select Plan   │                  │                │
     │─────────────────>│                  │                │
     │                  │ 2. createInvoice │                │
     │                  │─────────────────>│                │
     │                  │ 3. Invoice Link  │                │
     │                  │<─────────────────│                │
     │ 4. Invoice URL    │                  │                │
     │<─────────────────│                  │                │
     │                  │                  │                │
     │ 5. openInvoice() │                  │                │
     │─────────────────────────────────────>│                │
     │                  │                  │                │
     │                  │ 6. pre_checkout_query            │
     │                  │<─────────────────────────────────│
     │                  │                  │                │
     │                  │ 7. Validate &    │                │
     │                  │    answerPreCheckoutQuery        │
     │                  │─────────────────────────────────>│
     │                  │                  │                │
     │                  │ 8. successful_payment            │
     │                  │<─────────────────────────────────│
     │                  │                  │                │
     │                  │ 9. Create         │                │
     │                  │    subscription   │                │
     │                  │    & entitlements │               │
     │                  │─────────────────────────────────>│
     │                  │                  │                │
     │ 10. Callback     │                  │                │
     │<─────────────────│                  │                │
     │                  │                  │                │
     │ 11. GET /billing │                  │                │
     │    /subscription  │                  │                │
     │─────────────────>│                  │                │
     │   Premium Active │                  │                │
     │<─────────────────│                  │                │
```

## Webhook Setup

The bot webhook URL should point to:
```
https://your-domain.com/api/billing/webhook
```

Set it via Telegram Bot API:
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/api/billing/webhook",
    "secret_token": "<YOUR_SECRET_TOKEN>"
  }'
```

### Webhook Security

- Uses `X-Telegram-Bot-Api-Secret-Token` header for validation
- Secret configured via `TELEGRAM_WEBHOOK_SECRET` environment variable
- Always returns `200 OK` to prevent Telegram retry loops on processing failures

## Subscription Management

### Current Approach

Vibe manages subscription lifecycle **internally** (not via Telegram's automatic billing):

1. Invoice is created without `subscription_period` parameter
2. Successful payment event triggers entitlement activation
3. Expiration is tracked in our database via `expires_at`
4. Reconciliation job marks expired subscriptions

### Future: Recurring Subscriptions

When Telegram's recurring subscription API is stable and ready for production:

1. Use `createSubscriptionInvoiceLink` with `subscription_period`
2. Handle renewal events via `successful_payment` webhook with `is_recurring: true`
3. Handle cancellation via `BotSubscriptionUpdated` events

## Refund Flow

```typescript
// Admin-initiated refund via Bot API
await refundStarPayment(userId, telegramPaymentChargeId);

// System handles: transaction marked as refunded,
// subscription expired, entitlements revoked
```

## Security Considerations

| Threat | Mitigation |
|--------|------------|
| Price tampering | Server verifies amount against authoritative plan price at every step |
| Currency tampering | Only `XTR` accepted — non-XTR payments rejected |
| User ID tampering | Payload is server-generated with auth session binding |
| Payment replay | Unique constraint on `(provider, event_id)` prevents double processing |
| Client cache poisoning | All premium checks are server-side with real-time DB lookups |
| Webhook forgery | Secret token validation on every webhook request |

## API Behavior Verified

Telegram payment behavior verified against current official documentation as of 2026:

| Feature | Status | Notes |
|---------|--------|-------|
| `createInvoiceLink` | ✅ Verified | Works with XTR, no provider_token needed |
| `answerPreCheckoutQuery` | ✅ Verified | 10-second response window |
| `successful_payment` | ✅ Verified | Received via message.update |
| `refundStarPayment` | ✅ Verified | Requires user_id + charge_id |
| Recurring subscriptions | ⚠️ Available | Not used (internal lifecycle management) |
| `subscription_period` | ⚠️ Available | Not used (future consideration) |
