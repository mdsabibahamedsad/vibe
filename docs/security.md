# Vibe — Security Rules & Guidelines

This document outlines the security principles and rules that must be followed throughout the application.

---

## 1. Never Expose Supabase Service-Role Key

The `SUPABASE_SERVICE_ROLE_KEY` has full access to your database and bypasses RLS.

- Must ONLY be used server-side
- Must NEVER be in client-side code
- Must NEVER be in environment variables exposed to the browser (`NEXT_PUBLIC_*`)
- Must NEVER be logged

## 2. Never Trust Client-Provided User IDs

A client can send any user ID in a request.

- Always derive the authenticated user from the session/token
- Never use a user ID from request body or query params for authorization decisions
- Compare the requested resource's owner against the authenticated user

## 3. Validate Telegram initData Server-Side

Telegram `initData` from the client is NOT verified.

Before trusting Telegram-provided user identity:

1. Receive the raw `initData` string from the client
2. Parse it into key-value pairs
3. Validate the HMAC-SHA-256 signature using the Telegram Bot Token
4. Check the `auth_date` is recent (e.g., within 24 hours)
5. Only then extract and trust the verified user data

## 4. Use Supabase Row Level Security (RLS)

Every table must have RLS enabled.

- Default: DENY all
- Grant access based on user identity via `auth.uid()`
- Use separate policies for SELECT, INSERT, UPDATE, DELETE
- Test policies thoroughly with different user roles

## 5. Users Must Only Modify Resources They Own

- RLS policies must check `user_id = auth.uid()`
- Prevent users from editing/deleting other users' content
- Prevent users from reading data they shouldn't access

## 6. Sensitive Operations Must Happen Server-Side

- Payment processing
- Admin operations
- Subscription management
- Data export/deletion
- User verification

These must be implemented in API routes, Server Actions, or Edge Functions — never in client code.

## 7. Payment Verification Must Happen Server-Side

- All Telegram Stars transactions must be verified server-side
- Never trust a client-reported payment success
- Verify transaction IDs against Telegram's API

## 8. Admin Operations Require Server-Side Authorization

- Admin role must be verified server-side
- Never rely on client-side role checks alone
- Admin API routes must validate admin status before executing operations
- Admin clients should use the service-role key (server-side only)

## 9. Rate-Limit Abuse-Prone Endpoints

Endpoints that require rate limiting:

- Authentication attempts
- Message sending
- Swipe/like actions
- Report submissions
- API endpoints in general

Implementation: Use middleware or a rate-limiting service (e.g., Upstash Redis).

## 10. Never Expose Private Location Data

- Location data (if implemented) must be anonymized or aggregated
- Never expose exact coordinates
- Implement proximity-based discovery without revealing precise location
- User must opt in to location sharing

## 11. Keep Secrets Out of Git

- `.env.local` is gitignored
- Only `.env.example` (with placeholder values) is committed
- Never commit real tokens, keys, or secrets
- Rotate any secrets accidentally committed immediately

## 12. Prepare for Report/Block/Moderation Systems

- Content reporting must be available from day one
- Blocking must prevent all interaction between users
- Moderation queue must be separate from public data
- Banned users must be rejected at the API/RLS level

---

## Data Protection Checklist

- [ ] All database tables have RLS enabled
- [ ] No service-role key in client code
- [ ] Telegram initData validated server-side before trust
- [ ] Payment operations server-side only
- [ ] Admin operations double-checked server-side
- [ ] Rate limiting on abuse-prone endpoints
- [ ] No sensitive data in logs
- [ ] `.env*.local` files in `.gitignore`
- [ ] Input validation with Zod on all API endpoints
- [ ] Prepared for future compliance (GDPR, etc.)
