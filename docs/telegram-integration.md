# Telegram Integration

## Architecture

```
Telegram User
    ↓
Telegram Bot (@vibe_app_bot)
    ↓
Telegram Mini App (WebView within Telegram)
    ↓
Vibe Frontend (Next.js)
    ↓
Vibe Backend API (Next.js Route Handlers)
    ↓
Supabase
    ├── PostgreSQL (users, profiles, messages, payments, etc.)
    ├── Storage (profile photos, media, verification documents)
    └── Realtime (chat, notifications, live interactions)
```

## Authentication Flow

```
1. User opens Mini App → Telegram injects initData
2. Frontend sends raw initData to POST /api/auth/telegram
3. Server validates HMAC-SHA-256 signature (src/lib/telegram/validate.ts)
4. Server checks auth_date freshness (configurable max age)
5. Server creates/looks up Supabase Auth user
6. Server returns Supabase session tokens
7. Frontend stores session and makes authenticated requests
```

## Security Rules

- **Never trust** `window.Telegram.WebApp.initDataUnsafe` as proof of identity
- **Always validate** initData server-side using HMAC-SHA-256
- **Bot Token** is server-side only (`TELEGRAM_BOT_TOKEN`)
- **User IDs** are extracted from validated initData, never from client
- **Premium status** from client is never trusted; verified via entitlements
- **Admin roles** are server-authoritative; never from Telegram data

## Telegram Bot (@BotFather Configuration)

### Required Bot Settings

| Setting | Value |
|---------|-------|
| **Bot name** | Vibe |
| **Bot username** | `vibe_app_bot` (or your chosen username) |
| **Description** | Social, Dating & Creator Community on Telegram |
| **About text** | Vibe — Social, Dating & Creator Community. Discover people, match, chat, and share. |
| **Profile photo** | Vibe logo (icon or wordmark) |

### BotFather Commands

```
/myvibe — Open Vibe Mini App
/start — Welcome + Mini App launch
/help — Help Center
/privacy — Privacy information
/terms — Terms of Service
```

### Mini App Configuration

In BotFather, use `/mybot` → select bot → **Bot Settings** → **Menu Button**:

| Setting | Value |
|---------|-------|
| **Mini App URL** | `https://yourdomain.com` (production) |
| **Menu button text** | Open Vibe |

### Webhook Configuration

If using webhook mode (recommended for production):

```bash
# Set webhook URL
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourdomain.com/api/billing/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["pre_checkout_query", "message"]
  }'

# Verify webhook
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

### Polling vs Webhook

**Recommended: Webhook** for production. Reasons:
- Real-time payment processing
- No polling infrastructure needed
- Lower latency for payment confirmation
- Automatic retry by Telegram

**Polling** may be used during development when the server isn't publicly accessible.

## Mini App Deep Link Format

```
https://t.me/<BOT_USERNAME>/<APP_NAME>?startapp=<entity_type>_<entity_id>

Examples:
https://t.me/vibe_app_bot/vibe?startapp=post_abc123
https://t.me/vibe_app_bot/vibe?startapp=profile_user_456
https://t.me/vibe_app_bot/vibe?startapp=ref_abc123 (referral)
```

## /start Parameter Handling

The `startapp` param from `initDataUnsafe.start_param` is securely extracted during server-side initData validation. Supported entity types:

| Entity Type | Description | Access Control |
|-------------|-------------|---------------|
| `post` | Deep link to a post | Public, or 404 if deleted |
| `profile` | Deep link to a user profile | Respects privacy settings |
| `story` | Deep link to a story | Must be active (not expired) |
| `match` | Deep link to a match | Must be the matched user |
| `chat` | Deep link to a conversation | Must be a participant |
| `notifications` | Open notification center | Authenticated user only |
| `ref` | Referral attribution | No access granted, attribution only |

## Telegram Stars Payments

### Payment Flow

```
1. User clicks "Buy Premium" → Frontend calls POST /api/billing/invoice
2. Server creates invoice link via Telegram Bot API createInvoiceLink
3. Frontend opens invoice via Telegram.WebApp.openInvoice(invoiceLink)
4. Telegram sends pre_checkout_query to webhook → Server validates
5. User completes payment → Telegram sends successful_payment to webhook
6. Server processes payment: creates ledger entry, activates entitlements
7. Frontend refreshes premium status via GET /api/billing/subscription
```

### Security

- **Pre-checkout query** validated server-side within 10-second Telegram timeout
- **Prices** verified against authoritative plan prices from database
- **Idempotency** via event_id unique constraint
- **No client trust**: Server never trusts client-reported payment success
- **Webhook secret** validated via `X-Telegram-Bot-Api-Secret-Token` header

## Telegram Notifications

Notifications are delivered asynchronously via delivery jobs:

```
Notification created → createTelegramDeliveryJob()
  → Job queued (pending status)
  → processDeliveryJob() sends via Bot API sendMessage
  → Includes inline "Open Vibe" keyboard button with deep link
  → Respects user preferences (quiet hours, category toggles)
  → Retries with exponential backoff (1s, 5s, 30s)
  → Max 3 retries, then marked failed
```

## Theme Integration

The Mini App uses Telegram theme variables via CSS custom properties:

```css
background: var(--tg-theme-bg-color, #ffffff);
color: var(--tg-theme-text-color, #000000);
--tg-theme-button-color: #0088cc;
```

## Environment Variables

See `.env.example` for required variables. Key Telegram-specific vars:

| Variable | Purpose | Required | Server/Client |
|----------|---------|----------|---------------|
| `TELEGRAM_BOT_TOKEN` | Bot authentication | ✅ | Server only |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Deep link construction | ✅ | Client |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook validation | ✅ (production) | Server only |
| `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` | Session freshness | Optional (default: 86400) | Server only |
| `TELEGRAM_MINI_APP_URL` | Production Mini App URL | ✅ | Server only |
