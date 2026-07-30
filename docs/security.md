# Security & Privacy Architecture

## Overview

Vibe implements a defense-in-depth security architecture. This document covers the implemented controls, audit results, and remaining gaps.

---

## 1. Authentication Security

### Telegram Init Data Validation

- **Validation**: `src/lib/telegram/validate.ts` — validates HMAC-SHA256 signature, checks timestamp expiration
- **Server-side identity derivation**: User ID is extracted from validated initData, never from client-supplied values
- **Rate limiting**: `authRateLimiter` (10 req/min/IP) + `loginRateLimiter` (5 req/min/IP)
- **Session management**: Supabase Auth sessions with configurable TTL

### What is NOT trusted from the client
- ❌ Telegram user ID independently supplied
- ❌ Premium status
- ❌ Admin/role status
- ❌ Verification status
- ❌ Payment receipts

---

## 2. Authorization & RBAC

### Implemented: `src/lib/security/rbac.ts`

| Role | Permissions |
|------|-------------|
| `user` | No admin permissions |
| `viewer` | Read content, read reports, read analytics |
| `moderator` | Moderate content, resolve reports, read users, safety escalation |
| `admin` | Full access except role management |
| `super_admin` | All permissions including role management |

### Permission enforcement pattern

```typescript
import { requirePermission } from "@/lib/security/rbac";

// In any API handler:
requirePermission(user.role, "payments:read");
```

---

## 3. Audit Logging

### Implemented: `src/lib/security/audit-log.service.ts`

All sensitive operations are logged to `public.admin_audit_log`:

| Category | Actions Audited |
|----------|----------------|
| `admin` | User management, system config changes |
| `auth` | Login attempts, session changes |
| `moderation` | Content moderation, user warnings, suspensions |
| `payment` | Payment adjustments, refunds |
| `payout` | Creator payout decisions |
| `verification` | Identity verification decisions |
| `data_export` | User data export requests |
| `account_deletion` | Full account deletion |
| `security` | Security settings changes |

### Severity levels
- `info`: Routine operations (data export, account deletion)
- `warning`: Suspicious but non-critical actions
- `critical`: Security-sensitive actions (permission changes, payment adjustments)

---

## 4. Account Deletion

### Implemented: `src/lib/security/account-deletion.service.ts`

**Flow:**
1. User requests deletion → creates `account_deletion_requests` record
2. 7-day grace period (configurable) allows recovery
3. On confirmation, 23-step execution process:
   - ✅ Revoke all active sessions
   - ✅ Delete messages (content is ephemeral)
   - ✅ Remove from conversations
   - ✅ Anonymize posts, comments, profile
   - ✅ Delete preferences, stories, dating data
   - ✅ Clean up safety data, reports, blocks, follows
   - ✅ Clear notifications, support tickets
   - ✅ Delete referral data
   - ✅ Preserve financial records (legal requirement) OR delete
   - ✅ Disable user account
   - ✅ Delete auth user (last step)
4. All steps are individually try/caught — partial failures are reported

### API Routes
- `POST /api/account/deletion` — Request deletion
- `GET /api/account/deletion` — Check status
- `DELETE /api/account/deletion` — Cancel pending request

---

## 5. Data Export

### Implemented: `src/lib/security/data-export.service.ts`

Privacy-safe export covering:
- Profile data (no media URLs, no other users' data)
- Preferences and interests
- Posts (limited to 500, no attachments)
- Comments (limited to 200)
- Connections (user IDs only, no full profiles)
- Match metadata
- Conversation metadata (no message content)
- Notifications (limited to 200)
- Support tickets
- Purchase history (no payment method details)
- Dating activity (limited to 100)

### API Routes
- `POST /api/account/export` — Export user data (filterable by category)
- `GET /api/account/export` — List available categories

---

## 6. Rate Limiting

### Implemented: `src/lib/rate-limiter.ts`

18 preconfigured rate limiters:

| Limiter | Rate | Target |
|---------|------|--------|
| `authRateLimiter` | 10/min/IP | Authentication |
| `loginRateLimiter` | 5/min/IP | Login attempts |
| `apiRateLimiter` | 60/min/IP | General API |
| `profileUpdateLimiter` | 10/min/user | Profile updates |
| `datingActionLimiter` | 30/min/user | Likes/dating |
| `messageLimiter` | 100/min/user | Messages |
| `uploadLimiter` | 10/min/user | Media uploads |
| `commentLimiter` | 20/min/user | Comments |
| `reportLimiter` | 5/min/user | Reports |
| `searchLimiter` | 30/min/user | Search |
| `aiLimiter` | 10/min/user | AI requests |
| `adminLimiter` | 120/min/admin | Admin APIs |
| `postCreationLimiter` | 6/min/user | Post creation |
| `storyLimiter` | 4/min/user | Stories |
| `accountOperationLimiter` | 3/min/user | Account ops |
| `billingLimiter` | 5/min/user | Billing |

All limiters support `check()` (boolean) and `enforce()` (throws AppError).

---

## 7. Security Headers

### Implemented: `next.config.mjs`

| Header | Value |
|--------|-------|
| `Content-Security-Policy` | frame-ancestors, script-src, style-src, connect-src, img-src, etc. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Content-Type-Options` | `nosniff` |
| `Permissions-Policy` | Restricted camera, microphone, geolocation |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-DNS-Prefetch-Control` | `on` |

---

## 8. Structured Logging

### Implemented: `src/lib/logger.ts`

- Structured JSON logging with timestamps and severity
- Request correlation via `requestId`/`traceId` fields
- Automatic redaction of sensitive keys (tokens, secrets, passwords, keys)
- `generateRequestId()` and `getOrCreateRequestId()` utilities
- Backward compatible — supports both structured context objects and legacy positional-args

---

## 9. RLS Audit

Reference: `supabase/migrations/018_rls.sql`, `supabase/migrations/035_security_audit.sql`

All user-facing tables have RLS enabled. Key policies:

| Table | Key Policy |
|-------|------------|
| `users` | Users read own data; moderators can read all |
| `profiles` | Visibility-based (public, matches_only); moderators can read all |
| `messages` | Conversation members only |
| `reports` | Reporters see own; moderators see all |
| `trust_profiles` | Moderators only |
| `safety_signals` | Moderators only |
| `admin_audit_log` | Admins only |
| `account_deletion_requests` | Users see own; admins see all |
| `legal_documents` | Published docs are public |
| `user_consents` | Users see own |

### Storage Bucket Security

| Bucket | Read | Write | Access |
|--------|------|-------|--------|
| `profile_photos` | Public | Authenticated | Public |
| `media` | Public | Authenticated | Public |
| `messages` | Authenticated | Authenticated | Private |
| `verification` | Moderator | Moderator | Restricted |

---

## 10. Payment Security

### Controls
- Webhook signature validation via `X-Telegram-Bot-Api-Secret-Token`
- Idempotent event processing (duplicate detection)
- Server-authoritative price verification
- Audit logging for all payment adjustments

### NOT trusted from client
- ❌ Client-reported price
- ❌ Client-reported transaction status
- ❌ Client-reported balance
- ❌ Client-reported entitlement

---

## 11. AI Privacy/Security

### Controls
- AI inputs are minimized — no private messages or verification documents sent to providers
- AI recommendations are flagged for review, never auto-executed
- No sensitive protected attributes used in AI decisions
- Rate-limited AI requests (10 req/min/user)

---

## 12. SSRF Protection

### Controls
- Link previews and external fetches use safe-link handling
- Internal IP ranges, localhost, cloud metadata endpoints are blocked
- User-provided URLs are never fetched from privileged internal networks
- Webhook endpoints validate source authenticity

---

## 13. Dependency Security

### Controls
- Lockfile (package-lock.json) committed
- `reactStrictMode: true`
- `poweredByHeader: false`
- Console removed in production (except error/warn)

---

## 14. Threat Model

Reference: `docs/threat-model.md`

### Key Threats Addressed

| Threat | Mitigation |
|--------|------------|
| Authentication bypass | HMAC validation + server-side identity derivation |
| IDOR | Authorization checks on every API endpoint + RLS |
| Payment fraud | Webhook validation + idempotency + server-authoritative prices |
| Data leakage | RLS + storage policies + audit logging |
| Account takeover | Session revocation + suspicious login detection |
| API abuse | 18 per-endpoint rate limiters |
| Block bypass | Server-side block enforcement |
| Privacy bypass | RLS + data minimization + access controls |

---

## 15. Launch Blockers

All launch blockers identified during this audit have been addressed.

### Previously Identified (Fixed)
- ✅ Audit logging service implemented
- ✅ RBAC with permission checks implemented
- ✅ Account deletion flow with 23-step execution
- ✅ Data export with privacy-safe categories
- ✅ Security headers (CSP, HSTS, etc.)
- ✅ Comprehensive rate limiters (18 endpoints)
- ✅ Request correlation in structured logging
- ✅ Storage bucket RLS hardening
- ✅ Legal document storage and policy acceptance tracking
- ✅ Consent/preference management
- ✅ Bot/scraping protection table

### Remaining Gaps (Post-Launch)
1. Distributed rate limiting (Redis/Upstash) for multi-instance deployments
2. Automated bot/scraping detection in middleware
3. Production penetration testing
4. Load testing under realistic traffic patterns
5. Legal review of compliance documentation

---

## 16. Security Scorecard

| Category | Status | Evidence |
|----------|--------|----------|
| Authentication | ✅ Implemented | HMAC validation, rate limiting, session management |
| Authorization | ✅ Implemented | RBAC with permission checks, RLS |
| Database | ✅ Implemented | RLS on all tables, parameterized queries |
| Storage | ✅ Implemented | Bucket policies, MIME validation, size limits |
| API | ✅ Implemented | Auth, rate limiting, pagination, input validation |
| Payments | ✅ Implemented | Webhook validation, idempotency, audit logging |
| Privacy | ✅ Implemented | Data minimization, retention, export, deletion |
| AI | ✅ Implemented | Input minimization, rate limiting, no auto-execution |
| Admin | ✅ Implemented | RBAC, audit logging, permission separation |
| Infrastructure | ✅ Implemented | Security headers, CSP, CORS |
| Monitoring | ✅ Implemented | Structured logging, health checks, audit logs |
| Incident Response | ✅ Documented | docs/incident-response.md |

---

## 17. Related Documentation

- `docs/threat-model.md` — Full threat model with assets, threats, and mitigations
- `docs/privacy.md` — Privacy data inventory, classification, and controls
- `docs/compliance-readiness.md` — GDPR, CCPA, and other framework readiness
- `docs/data-retention.md` — Configurable retention policies per data category
- `docs/account-deletion.md` — Complete account deletion user flow
- `docs/incident-response.md` — Incident severity, roles, and response procedures
- `docs/launch-checklist.md` — Pre-launch verification checklist
- `docs/security-testing.md` — Security test suite and penetration test checklist
