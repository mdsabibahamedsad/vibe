# Reliability Engineering

## Service Dependency Map

| Dependency | Criticality | Timeout | Retry | Failure Mode | Fallback |
|-----------|-------------|---------|-------|-------------|----------|
| **Supabase PostgreSQL** | CRITICAL | 10s | 3x exponential backoff | Read-only mode, cached data | Graceful error page |
| **Supabase Storage** | HIGH | 30s (upload), 5s (download) | 3x upload, 2x download | Degraded media (no images) | Static placeholder |
| **Supabase Realtime** | HIGH (chat) | 10s connect, no sub timeout | Auto-reconnect (exponential backoff) | Offline chat | Message queue + deliver on reconnect |
| **Telegram Bot API** | HIGH (auth) | 5s | 3x exponential backoff + jitter | Auth fallback retry | Queue and retry |
| **Telegram WebApp** | HIGH | N/A (client-side) | N/A | Blank screen | N/A (client) |
| **AI Services** | LOW | 10s | 2x | Continue without AI | No AI personalization |
| **Recommendations** | LOW | 5s | 0 (circuit breaker) | Deterministic feed | Basic chronological feed |
| **Analytics** | LOW | 2s | 0 (fire-and-forget) | Continue without analytics | None needed |
| **Search** | LOW | 3s | 2x | Degraded search | Basic text match fallback |
| **Payments (Telegram Stars)** | CRITICAL | 30s | Idempotent only | Hold transaction | Retry with idempotency key |

## Service-Level Objectives (SLOs)

| Service | Target Availability | Acceptable Degradation | Measurement |
|---------|-------------------|----------------------|-------------|
| Authentication | 99.9% | Read-only mode | Uptime of auth API |
| Feed | 99.5% | Chronological fallback | Feed load success rate |
| Discovery | 99.5% | Basic filtering fallback | Discovery API error rate |
| Real-time Chat | 99.0% | Async message delivery | Message delivery latency |
| Payments | 99.9% | Hold + retry | Payment success rate |
| Media Upload | 99.0% | Compressed fallback | Upload success rate |
| Notifications | 99.0% | Queue + retry | Notification delivery rate |
| Admin Panel | 99.5% | Read-only mode | Admin API error rate |

### Error Budget

Monthly error budget = (1 - SLO) × total requests per month.

Example for Auth (99.9% SLO with 100K monthly requests):
- Error budget: 0.1% × 100,000 = **100 failed requests/month**
- If exceeded: Freeze non-critical feature releases until budget recovers

## Graceful Degradation

| Service | When Unavailable | User Experience |
|---------|-----------------|-----------------|
| AI personalization | AI provider down | Feed/discovery falls back to chronological/basic ranking |
| Recommendations | Rec engine fails | Users see basic chronological feed, no personalized suggestions |
| Analytics | Analytics service fails | App continues normally, events are silently dropped |
| Search engine | Search provider down | App falls back to basic PostgreSQL text search |
| Notifications | Delivery fails | Notifications queued for retry, no immediate alert |
| Media processing | Image processing fails | Original image shown without optimized derivatives |
| Realtime | WebSocket disconnected | Chat messages delivered on next poll/reconnect |

## Circuit Breakers

Pre-configured circuit breakers for external dependencies:

| Service | Failure Threshold | Reset Timeout | Max Concurrency |
|---------|------------------|---------------|-----------------|
| AI Services | 3 failures | 15s | 5 |
| Recommendations | 3 failures | 10s | 10 |
| Telegram Bot API | 5 failures | 30s | 20 |
| Search | 3 failures | 15s | 10 |
| Analytics | 10 failures | 60s | 50 |
| Payments | 10 failures | 60s | 10 |

## Rate Limits

### API Endpoints

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| Auth (login) | 10 | 1 minute | Per IP |
| Auth (register) | 3 | 1 hour | Per IP |
| Feed | 60 | 1 minute | Per user |
| Discovery | 30 | 1 minute | Per user |
| Likes | 100 | 1 hour | Per user |
| Super Likes | 10 | 1 hour | Per user |
| Messages | 100 | 1 minute | Per user |
| New Conversations | 50 | 1 day | Per user |
| Media Upload | 10 | 1 minute | Per user |
| Comments | 30 | 1 minute | Per user |
| Reports | 10 | 1 hour | Per user |
| Search | 30 | 1 minute | Per user |
| AI Requests | 20 | 1 minute | Per user |
| Profile Updates | 10 | 1 minute | Per user |
| Admin APIs | 100 | 1 minute | Per admin |

### Abuse-Resistant Design

Rate limiting uses combination of:
- **User ID** (primary) — Most reliable identifier
- **Account age** — New accounts get stricter limits
- **IP address** (secondary) — Compensates for unauthenticated endpoints
- **Session** — Prevents single-user farm attacks
- **Risk state** — High-risk accounts get reduced limits

Never rely exclusively on IP addresses (shared NAT, VPNs, etc.).

## Background Jobs

### Job Lifecycle

Every background job has:
- **Job ID** — Unique identifier
- **Status** — queued → running → completed / failed
- **Retry count** — Tracks retry attempts
- **Timeout** — Maximum execution time
- **Error state** — Last error message and stack trace
- **Idempotency key** — Prevents duplicate execution

### Priority Tiers

| Priority | Examples | Queue |
|----------|----------|-------|
| HIGH | Payment processing, security events, entitlement updates | Process immediately, max 3 retries |
| NORMAL | Notifications, feed processing, moderation actions | Process within 5 minutes, max 3 retries |
| LOW | Analytics aggregation, non-critical recommendations | Process within 30 minutes, max 2 retries |

### Dead-Letter Queue

Permanently failing jobs move to the DLQ. Admins can:
- Inspect job details and error messages
- Retry jobs (with backoff)
- Cancel/discard jobs
- Resolve jobs (acknowledge without retrying)

The dead-letter queue is implemented in `src/lib/reliability/dead-letter-queue.ts` with:
- Full CRUD operations
- Cursor-based pagination
- Per-type statistics
- Admin audit trail for all DLQ actions

### Cron / Scheduled Jobs

| Job | Frequency | Lock | Idempotent |
|-----|-----------|------|------------|
| Expire stale stories | Every 5 minutes | Distributed lock | Yes |
| Cleanup orphaned media | Every hour | Distributed lock | Yes |
| Reconcile expired subscriptions | Every hour | Distributed lock | Yes |
| Record daily safety metrics | Daily at 00:05 UTC | Distributed lock | Yes |
| Refresh materialized views | Every 15 minutes | Distributed lock | Yes |
| Recalculate trust tiers | Daily | Distributed lock | Yes |

### Concurrent Execution Prevention

All scheduled jobs use distributed locking:
1. Acquire lock in database (advisory lock or lock table)
2. Execute job
3. Release lock
4. If lock acquisition fails, skip execution (another instance is running)

## Realtime Scaling

### Chat

- WebSocket connections via Supabase Realtime
- Connection pool limits: 500 concurrent per instance
- Exponential backoff reconnection (1s, 2s, 4s, 8s, max 30s)
- No broadcast storms: events scoped to conversation channel
- Duplicate event prevention via client-side deduplication

### Notifications

- Realtime broadcasts on INSERT to notifications table
- Automatic via Supabase Realtime subscriptions
- No additional fan-out needed for in-app delivery

### Live Streaming

- Connection limits per stream
- Viewer presence tracked via Realtime
- Moderation actions broadcast to all viewers

## Caching

### Cache Candidates

| Data | Cache Duration | Invalidation Trigger |
|------|---------------|---------------------|
| Public configuration | 5 minutes | Admin update |
| Translation resources | 30 minutes | Translation update |
| Help articles | 1 hour | Content update |
| Feature flags | 30 seconds | Admin update |
| Non-sensitive discovery metadata | 1 minute | Profile update |
| Interest catalog | 1 hour | Admin update |

### Cache Invalidation Rules

A stale cache must NEVER:
- Bypass authorization
- Expose private data to wrong users
- Grant premium features without subscription
- Show blocked users as available
- Allow messaging after block

Invalidation triggers for critical changes:
- **Profile update** → Invalidate profile-related caches
- **Block** → Invalidate discovery/feed caches for both users
- **Privacy setting** → Invalidate profile visibility caches
- **Premium status** → Invalidate entitlement caches
- **Moderation restriction** → Invalidate recommendation caches

## Media Scaling

### Upload Pipeline

1. **Client uploads** → Direct upload to storage (multi-part, resumable)
2. **Server validates** → MIME type, file size, malware scan
3. **Original stored** → In private bucket with versioned path
4. **Processing job created** → Image optimization/video transcoding
5. **Derivatives generated** → Thumbnails, optimized variants
6. **Original can be deleted** → After derivatives confirmed

### Storage Lifecycle

| Item | Retention | Cleanup |
|------|-----------|---------|
| Profile photos | Indefinite | Manual delete |
| Post media | Indefinite | Post delete → 30 day grace → cleanup |
| Story media | 24-48 hours | Expired → 24h grace → cleanup |
| Message media | 90 days | After 90 days → cleanup |
| Moderation evidence | 1 year | After 1 year → review → delete |
| Support attachments | 90 days | After ticket close → 90 day grace → delete |
| Deleted/orphaned media | 24 hours | Grace period → soft delete |

## Deployment

### CI/CD Pipeline

```
Code push → Lint → Type check → Unit tests → Build → Migration check → Deploy staging → Integration tests → Canary → Production rollout
```

### Canary Releases

1. Deploy to 1% of users
2. Monitor errors, latency, conversion for 5 minutes
3. Gradually increase: 5% → 25% → 50% → 100%
4. Auto-rollback if error rate exceeds 1% threshold

### Rollback Safety

- All migrations are backward-compatible (7-step process)
- Application rollback does not require database rollback
- Payments use idempotency keys — safe to retry after rollback
- Moderation state is append-only — safe to rollback application

### Zero-Downtime Migrations

1. **Add** new table/column (no existing code depends on it)
2. **Deploy** application code that is compatible with both old and new schema
3. **Backfill** data for new structures
4. **Switch** reads/writes to new structures
5. **Remove** old structures in a subsequent migration
6. **Deploy** code that no longer needs old structures
7. **Drop** old columns/tables in final migration

## Capacity Planning

### Assumptions (Phase 1 — 10K DAU)

| Metric | Per User Per Day | Total Per Day | Peak Per Second |
|--------|-----------------|---------------|-----------------|
| Feed views | 10 | 100K | ~5 |
| Messages sent | 20 | 200K | ~10 |
| Media uploads | 0.5 | 5K | ~0.5 |
| Likes | 15 | 150K | ~8 |
| Discovery swipes | 30 | 300K | ~15 |
| Matches created | 2 | 20K | ~1 |
| Story views | 20 | 200K | ~10 |
| Profile views | 10 | 100K | ~5 |
| Notifications sent | 30 | 300K | ~15 |
| API requests | 100 | 1M | ~50 |

### Database Projections

| Table | Current Size | Growth/Month | Indexes |
|-------|-------------|--------------|---------|
| users | ~10K rows | ~500/month | 5 |
| profiles | ~10K rows | ~500/month | 4 |
| messages | ~200K rows | ~100K/month | 6 |
| posts | ~20K rows | ~5K/month | 5 |
| analytics_events | ~1M rows | ~500K/month | 4 |

### Scaling Strategy

1. **Phase 1 (0-10K DAU):** Shared Supabase instance, no caching needed
2. **Phase 2 (10K-50K DAU):** Dedicated Supabase, Redis for rate limiting
3. **Phase 3 (50K-250K DAU):** Read replicas, CDN for media, background job workers
4. **Phase 4 (250K+ DAU):** Sharding, global CDN, dedicated search infrastructure
