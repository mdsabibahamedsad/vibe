# Vibe — Authentication Architecture

## Overview

Vibe uses a **Telegram-initiated, server-verified** authentication flow. The application does NOT use a separate username/password system — all authentication flows through Telegram's Mini App identity system.

---

## Authentication Flow

```
Telegram User
     │
     ▼
1. Opens Telegram Mini App
     │
     ▼
2. Telegram injects WebApp with initData query string
     │
     ▼
3. Frontend extracts raw initData (available via window.Telegram.WebApp.initData)
     │
     ▼
4. Frontend sends initData to POST /api/auth/telegram
     │
     ▼
5. Server validates initData using HMAC-SHA-256 with Bot Token
     │  ├── Extracts hash
     │  ├── Builds data-check-string (sorted, joined with \n)
     │  ├── Derives secret key: HMAC-SHA-256("WebAppData", bot_token)
     │  ├── Computes verification hash
     │  └── Timing-safe comparison
     │
     ▼
6. Server validates auth_date (reject expired/future)
     │
     ▼
7. Server creates/looks up Supabase Auth user
     │  ├── Email: tg_{telegramUserId}@vibe-auth.app (deterministic)
     │  ├── Password: deterministic hash of telegramUserId + botToken
     │  └── UUID matches the public.users.id
     │
     ▼
8. Server upserts user in public.users table
     │
     ▼
9. Server signs in with Supabase Auth and returns session tokens
     │
     ▼
10. Client calls supabase.auth.setSession() with returned tokens
     │
     ▼
11. Supabase RLS policies use auth.uid() — which matches public.users.id
```

---

## initData Validation Algorithm

Reference: [Telegram Mini Apps — Validating Data](https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app)

### Step-by-step:

1. **Parse** the query string into key-value pairs
2. **Extract** the `hash` parameter and remove it from the set
3. **Sort** remaining keys alphabetically
4. **Build** `data_check_string` by joining `key=value` pairs with `\n`
5. **Derive** `secret_key = HMAC-SHA-256(key="WebAppData", message=bot_token)`
6. **Compute** `calculated_hash = HMAC-SHA-256(key=secret_key, message=data_check_string)`
7. **Compare** using `crypto.timingSafeEqual()` (timing-safe comparison)
8. **Validate** `auth_date` is within the allowed window (default: 24 hours)
9. **Extract** verified user data from the `user` JSON field

### Implementation:

`src/lib/telegram/validate.ts` — `validateTelegramInitData(initData, botToken)`

---

## Session Architecture

### Supabase Auth Bridge

The authentication system bridges Telegram identity to Supabase Auth sessions.

| Layer        | Technology            | Purpose                              |
| ------------ | --------------------- | ------------------------------------ |
| Identity     | Telegram              | User identity, initData              |
| Auth API     | Next.js Route Handler | POST /api/auth/telegram              |
| Auth Backend | Supabase Auth         | JWT session management               |
| Database     | Supabase PostgreSQL   | Application user data                |
| RLS          | Supabase RLS          | `auth.uid()` matches public.users.id |

### Key Insight

The **public.users.id** UUID is the **same** as the **Supabase Auth user ID** (`auth.users.id`). This ensures that:

- RLS policies using `auth.uid()` correctly identify the application user
- No custom session mapping is needed
- Supabase's built-in session refresh works automatically

### Session Storage

- **Supabase Auth JWT** — stored by the Supabase JS client (uses `localStorage` by default)
- **Access token** — short-lived (1 hour by default), used for API requests
- **Refresh token** — used to obtain new access tokens automatically

### Session Refresh

The Supabase client automatically refreshes sessions when the access token expires.

---

## User Upsert Process

### New User (First Login)

1. Supabase Auth user created with deterministic email/password
2. Application user created in `public.users` with matching UUID
3. Empty profile created in `public.profiles`
4. `needsOnboarding = true` returned to client

### Existing User (Subsequent Logins)

1. Auth user looked up by deterministic email
2. Safe Telegram fields updated:
   - `telegram_username`
   - `first_name`, `last_name`
   - `last_seen_at`
3. `avatar_media_id` updated only if changed
4. User-controlled profile data is NEVER overwritten
   - `bio`, `display_name` (custom), `gender`, `dating_intent`, preferences
   - Interests, profile photos
5. `needsOnboarding = false` if profile has bio + DOB + gender

### Idempotency

- Multiple logins do not create duplicate users
- Deterministic email ensures the same Telegram user maps to the same Supabase user
- ON CONFLICT handling prevents duplicate inserts

---

## API Endpoints

### POST /api/auth/telegram

Authenticate via Telegram initData.

**Request:**

```json
{
  "initData": "query_id=...&user=...&auth_date=...&hash=..."
}
```

**Response (200):**

```json
{
  "authenticated": true,
  "user": {
    "id": "uuid",
    "telegramUserId": 12345,
    "username": "username",
    "displayName": "Name",
    "needsOnboarding": true
  },
  "session": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 3600,
    "expiresAt": 1700000000
  }
}
```

### GET /api/auth/telegram/me

Get current user info.

**Headers:** `Authorization: Bearer <access_token>`

**Response (200):**

```json
{
  "user": {
    "id": "uuid",
    "telegramUserId": 12345,
    "username": "username",
    "displayName": "Name",
    "needsOnboarding": false
  }
}
```

### POST /api/auth/logout

Invalidate the current session.

**Headers:** `Authorization: Bearer <access_token>`

**Response (200):**

```json
{ "success": true }
```

### POST /api/auth/dev (Development Only)

Development authentication endpoint.

**Only works when:**

- `NODE_ENV !== 'production'`
- `VIBE_DEV_AUTH_ENABLED=true`

Returns a real Supabase session using configured dev user.

---

## Development Authentication

For testing outside Telegram, Vibe provides a development authentication mode.

### Enabling

```env
VIBE_DEV_AUTH_ENABLED=true
VIBE_DEV_TELEGRAM_USER_ID=123456789
VIBE_DEV_TELEGRAM_FIRST_NAME=Dev
VIBE_DEV_TELEGRAM_USERNAME=dev_user
```

### Safety Guards

1. **Automatically disabled** when `NODE_ENV === 'production'`
2. **Requires explicit env var** `VIBE_DEV_AUTH_ENABLED=true`
3. **Server-side user ID** — the client cannot pass an arbitrary user ID
4. **Real Supabase session** — uses the same `createAuthSession()` flow
5. **Clear logging** — all dev auth requests are logged as development

---

## Rate Limiting

| Endpoint                | Rate Limit        | Implementation                 |
| ----------------------- | ----------------- | ------------------------------ |
| POST /api/auth/telegram | 10 req/min per IP | In-memory (dev) / Redis (prod) |
| POST /api/auth/dev      | 10 req/min per IP | Same limiter                   |

The rate limiter uses an abstract interface that can be swapped from in-memory to Redis/Upstash for production.

---

## Security Rules

### What is TRUSTED

| Data                      | Source                            | Why Trusted   |
| ------------------------- | --------------------------------- | ------------- |
| `telegram_user_id`        | Extracted from validated initData | HMAC-verified |
| `first_name`, `last_name` | Extracted from validated initData | HMAC-verified |
| `username`                | Extracted from validated initData | HMAC-verified |
| `auth_date`               | Extracted from validated initData | HMAC-verified |

### What is NOT TRUSTED

| Data                                    | Source           | Why NOT Trusted         |
| --------------------------------------- | ---------------- | ----------------------- |
| `window.Telegram.WebApp.initDataUnsafe` | Client browser   | Can be modified by user |
| User ID from request body               | Client request   | Can be spoofed          |
| User ID from query params               | URL              | Can be spoofed          |
| `telegram_username` alone               | Multiple sources | Can change over time    |

### Critical Rules

1. **Never accept `userId` from client request body** as proof of identity
2. **Never expose `TELEGRAM_BOT_TOKEN`** to the client
3. **Never expose `SUPABASE_SERVICE_ROLE_KEY`** to the client
4. **Always validate initData server-side** before trusting user identity
5. **Always use timing-safe comparison** for HMAC verification
6. **Always validate `auth_date` freshness** to prevent replay attacks

---

## Threat Model

| Attack                                                             | Mitigation                                                       |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| **Replay attack** — Attacker captures valid initData and reuses it | `auth_date` expiration (configurable, default 24h)               |
| **Tampering** — Attacker modifies user data in initData            | HMAC verification fails on tampered data                         |
| **Impersonation** — Attacker provides fake user ID                 | Server extracts user ID from verified initData, not request body |
| **Bot token leak** — Attacker obtains bot token                    | Token is server-only, never in client code, never logged         |
| **Session hijacking** — Attacker steals access token               | Short-lived JWT + refresh token rotation                         |
| **Timing attack** — Attacker measures hash comparison time         | `crypto.timingSafeEqual()`                                       |
| **Rate limiting bypass** — Attacker floods auth endpoint           | IP-based rate limiting                                           |

---

## Logout / Session Expiration

### Logout Flow

1. Client calls `POST /api/auth/logout` with the access token
2. Server revokes the Supabase Auth session
3. Client calls `supabase.auth.signOut()` to clear local state
4. Auth state is reset to unauthenticated

### Session Expiration

- Access tokens expire according to Supabase Auth settings (default: 1 hour)
- Refresh tokens can be used to obtain new access tokens
- If refresh fails, the user is redirected to authentication

---

## Environment Variables

```env
TELEGRAM_BOT_TOKEN=              # Telegram Bot token (server-side only)
TELEGRAM_INIT_DATA_MAX_AGE_SECONDS=86400  # Max age for initData (default 24h)
TELEGRAM_WEBHOOK_SECRET=         # For Telegram Bot webhooks (future)

VIBE_DEV_AUTH_ENABLED=false      # Development auth toggle
VIBE_DEV_TELEGRAM_USER_ID=       # Dev auth Telegram user ID
VIBE_DEV_TELEGRAM_FIRST_NAME=    # Dev auth display name
VIBE_DEV_TELEGRAM_USERNAME=      # Dev auth username
```
