# Launch Checklist

## Pre-Flight Checks

### Authentication & Access

- [ ] Telegram initData HMAC-SHA-256 validation active and verified
- [ ] `auth_date` expiry enforced (24h configurable)
- [ ] Rate limiting active on auth endpoint (10/min per IP)
- [ ] Dev auth disabled (`VIBE_DEV_AUTH_ENABLED=false`)
- [ ] Logout properly revokes sessions
- [ ] Session timeout configured (1 hour access token)
- [ ] No stale test accounts

### Database

- [ ] RLS enabled on all user-accessible tables
- [ ] RLS policies verified against threat model
- [ ] No public tables exposed unintentionally
- [ ] `security definer` functions audited
- [ ] All RPC functions require auth where appropriate
- [ ] Backups active and verified (PITR, daily snapshots)
- [ ] Readiness check passes (`GET /api/health/ready` → 200)

### Storage

- [ ] Bucket policies verified:
  - `public`: public read, authenticated write
  - `private`: authenticated read/write, owner check
  - `verification-media`: admin-only access
- [ ] Signed URL expiration configured (1 hour)
- [ ] MIME type validation enforced
- [ ] File size limits configured (images: 10MB, videos: 50MB)
- [ ] No public bucket enumeration possible

### API

- [ ] All endpoints require authentication (except health and auth)
- [ ] Rate limiting active on all public endpoints
- [ ] Input validation (Zod schemas) on all mutation endpoints
- [ ] CORS restricted to Telegram domains
- [ ] No debug/development endpoints exposed
- [ ] Maximum payload sizes enforced
- [ ] Pagination limits enforced on all list endpoints

### Payments

- [ ] Webhook secret configured and verified
- [ ] Idempotency keys active for payment events
- [ ] Price verification server-side (not client-provided)
- [ ] Test payment flows disabled
- [ ] Refund policy documented
- [ ] Payment reconciliation procedure documented

### Moderation & Safety

- [ ] Report submission working for all content types
- [ ] Block enforcement working server-side
- [ ] Trust profile initialization active for new users
- [ ] Safety warnings active for high-risk conversations
- [ ] Message limits enforced (new accounts, bulk detection)
- [ ] Moderation queue accessible by moderators
- [ ] Appeal system working

### Notifications

- [ ] In-app notifications delivering correctly
- [ ] Telegram notification delivery working
- [ ] Notification preferences respected
- [ ] Notification rate limits configured

### Monitoring & Observability

- [ ] Health checks active (`/api/health`, `/api/health/ready`)
- [ ] Structured logging configured (JSON format)
- [ ] Error tracking active (all 500 errors captured)
- [ ] Database query monitoring active
- [ ] Rate limit metrics tracked
- [ ] Alerting configured for critical metrics

### Admin Panel

- [ ] RBAC verified (admin, moderator, support roles)
- [ ] All admin actions require server-side authorization
- [ ] Audit logging active for all privileged operations
- [ ] Admin session timeout configured
- [ ] No unauthorized admin panel access possible

### Security

- [ ] CSP headers configured (frame-ancestors for Telegram)
- [ ] Security headers active (X-Content-Type-Options, Referrer-Policy)
- [ ] No hardcoded secrets in codebase
- [ ] All environment variables verified
- [ ] Dependency audit clean (no known vulnerabilities)
- [ ] Snyk/npm audit completed

### Infrastructure

- [ ] Environment variables correct for production
- [ ] Supabase project on production tier
- [ ] Vercel project on production tier
- [ ] Custom domain configured
- [ ] SSL/TLS active
- [ ] CDN configured for media delivery
- [ ] Scaling limits appropriate for expected traffic

### Documentation

- [ ] Terms of Service published and versioned
- [ ] Privacy Policy published and versioned
- [ ] Community Guidelines published
- [ ] Safety Center content published
- [ ] Account deletion flow documented
- [ ] Data retention policy documented
- [ ] Incident response plan documented

## Go/No-Go Security Gate

### BLOCKER (Must Fix Before Launch)

| ID | Issue | Status | Owner | Due |
|----|-------|--------|-------|-----|
| B-01 | Authentication bypass allowing unauthorized access | ✅ Not present | — | — |
| B-02 | Admin privilege escalation without authorization | ✅ Not present | — | — |
| B-03 | Payment manipulation vulnerability | ✅ Not present | — | — |
| B-04 | Private data exposure via IDOR | ✅ Not present | — | — |
| B-05 | RLS bypass allowing direct database access | ✅ Not present | — | — |
| B-06 | Critical storage exposure (public/private bucket misconfig) | ✅ Not present | — | — |
| B-07 | Secret leakage in codebase or CI/CD | ✅ Not present | — | — |
| B-08 | Dev auth enabled in production | Verify VIBE_DEV_AUTH_ENABLED=false | Ops | Pre-launch |

### HIGH (Strongly Recommended Before Launch)

| ID | Issue | Status | Owner | Due |
|----|-------|--------|-------|-----|
| H-01 | Session token in localStorage | Consider httpOnly cookies | Engineering | Post-launch |
| H-02 | No refresh token rotation | Enable in Supabase Auth | Engineering | Post-launch |
| H-03 | No explicit DB query timeouts | Add timeout middleware | Engineering | Post-launch |
| H-04 | CSP limited to frame-ancestors only | Extend to script-src, connect-src | Engineering | Post-launch |
| H-05 | No rate limiter on search/feed | Already has basic limits | — | — |

### MEDIUM (Can Schedule Post-Launch)

| ID | Issue | Mitigation |
|----|-------|------------|
| M-01 | No comprehensive XSS sanitization on HTML input | React renders text by default (XSS unlikely) |
| M-02 | No CSRF tokens | Token-based auth + SameSite cookies mitigate |
| M-03 | No audit for all admin actions | Audit logging already covers key actions |
| M-04 | No formal penetration test | Security testing checklist created |
| M-05 | No bug bounty program | Consider post-launch |

## Rollback Plan

If issues are discovered post-launch:

1. **Feature flag kill switch**: Disable problematic feature via emergency kill switch
2. **Application rollback**: Deploy previous Vercel deployment (instant via Vercel)
3. **Database rollback**: Restore from PITR backup (if data corruption)
4. **DNS failover**: Point to standby deployment if primary unavailable

## Post-Launch Monitoring (First 48 Hours)

- [ ] Monitor error rate (< 1%)
- [ ] Monitor p95 latency (< 2s)
- [ ] Monitor auth success rate (> 95%)
- [ ] Monitor payment success rate (> 99%)
- [ ] Monitor database connections (< 50% of max)
- [ ] Monitor queue depth (< 100)
- [ ] Review first-day crash reports
- [ ] Review user feedback and support tickets
- [ ] Check backup integrity (first automatic backup after launch)
