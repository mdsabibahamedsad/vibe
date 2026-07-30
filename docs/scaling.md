# Scaling

## Architecture Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Telegram     │────▶│  Next.js     │────▶│  Supabase    │
│  Mini App     │     │  API Server  │     │  PostgreSQL  │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │                          │
                     ┌──────▼───────┐     ┌──────────────┘
                     │  Vercel      │     │
                     │  Edge/Func   │     ▼
                     └──────────────┘  ┌──────────────┐
                                        │  Supabase     │
                                        │  Storage      │
                                        └──────────────┘
```

## Scaling Strategy by Phase

### Phase 1: 0–10K DAU (Shared Infrastructure)

**Architecture:**
- Single Next.js deployment on Vercel (Pro plan)
- Shared Supabase instance (Pro plan)
- No caching layer needed
- No read replicas

**Capacity:**
- Vercel: 1000 concurrent function executions
- Database: 120 max connections, 8GB RAM
- Storage: 100GB

**Bottlenecks to monitor:**
- Database connection exhaustion under spike load
- Analytics event volume (retention tuning)
- Media upload bandwidth

### Phase 2: 10K–50K DAU (Dedicated + Caching)

**Architecture:**
- Vercel (Team plan) or dedicated hosting
- Supabase dedicated instance (Team plan)
- Redis/Vercel KV for distributed rate limiting
- CDN for media delivery

**Additions:**
- Background job worker (separate deployment)
- Read-only database replica for feed/discovery queries
- Redis for session cache and rate limiting

**Key metrics:**
- Max concurrent API calls: ~200 RPS
- Database: 500 max connections, 16GB RAM
- Realtime: 1000 concurrent connections

### Phase 3: 50K–250K DAU (Horizontal Scaling)

**Architecture:**
- Multiple API server instances behind load balancer
- Supabase read replicas (1+ replicas)
- Dedicated search infrastructure (Meilisearch/Typesense)
- Redis cluster for caching and rate limiting
- Background job queue (RQ/Celery/Bull)

**Database scaling:**
- Read replicas for feed, discovery, analytics queries
- Connection pooling via PgBouncer
- Table partitioning for analytics_events, messages

**Additions:**
- Dedicated media processing pipeline
- CDN with edge caching for media
- WebSocket gateway for realtime

### Phase 4: 250K+ DAU (Global)

**Architecture:**
- Multi-region deployment
- Database sharding or Citus
- Global CDN with edge compute
- Dedicated event pipeline (Kafka/Redpanda)
- Read-write splitting with eventual consistency for non-critical reads

## Database Scaling

### Connection Pooling

**Current state:** Default Supabase pooling (15 direct + 15 pooler connections per instance)

**Recommended settings:**
- Transaction mode pooling for web requests
- Session mode pooling for background jobs
- Max pool size: 20 (adjust based on concurrent requests)
- Pool timeout: 30 seconds
- Idle timeout: 300 seconds

### Read Replicas

When to add replicas:
- Database CPU consistently > 60%
- Query latency p95 > 500ms
- Feed/discovery queries taking > 30% of database time

Replica strategy:
- 1 replica for feed and discovery reads
- 1 replica for analytics and reporting
- Writes always go to primary

### Table Partitioning

Partition by time for high-volume tables:

```sql
-- Analytics events: partition by month
CREATE TABLE analytics_events (
  id UUID,
  event_name TEXT,
  created_at TIMESTAMPTZ
) PARTITION BY RANGE (created_at);

-- Messages: partition by month
CREATE TABLE messages (
  id UUID,
  conversation_id UUID,
  created_at TIMESTAMPTZ
) PARTITION BY RANGE (created_at);
```

### Query Optimization

**Always use LIMIT with ORDER BY** — unbounded sorted queries are the most common performance issue.

**Avoid N+1 queries** — use batch fetching with `IN()` clauses.

**Materialized views** — Pre-compute expensive aggregations:
- Daily engagement metrics (`mv_daily_engagement`)
- User recommendation scores
- Ad inventory availability

## Caching Strategy

### What to Cache

| Data | Cache Strategy | TTL | Stale-While-Revalidate |
|------|---------------|-----|----------------------|
| User profiles | Redis + CDN | 5 minutes | 1 hour |
| Feed items | Redis | 1 minute | 5 minutes |
| Discovery results | Redis | 1 minute | 5 minutes |
| Interest catalog | Memory | 1 hour | 24 hours |
| Feature flags | Memory | 30 seconds | 5 minutes |
| Translations | Memory | 30 minutes | 2 hours |
| Help articles | CDN | 1 hour | 24 hours |
| Public config | Memory | 5 minutes | 1 hour |
| Media URLs | CDN | 1 year (immutable) | N/A |

### Cache Keys

Format: `vibe:{service}:{entity}:{id}:{variant}`

Examples:
- `vibe:profile:user_123:v2`
- `vibe:feed:user_456:page_2`
- `vibe:discovery:user_789:dating:page_1`

### Cache Invalidation

Invalidation strategy by entity type:

| Entity Change | Invalidate |
|---------------|-----------|
| Profile update | `vibe:profile:{userId}:*` |
| Block created | `vibe:discovery:{blockerId}:*`, `vibe:discovery:{blockedId}:*` |
| Privacy change | `vibe:profile:{userId}:*` |
| Premium status | `vibe:entitlements:{userId}:*` |
| Moderation action | `vibe:recommendation:*` |
| Feature flag change | Entire flag cache |

## Media Delivery

### CDN Strategy

- **Static assets**: Vercel CDN (built-in)
- **User-uploaded media**: Supabase Storage CDN
- **Optimized images**: WebP/AVIF with responsive sizes
- **Video**: HLS streaming with adaptive bitrate

### Image Optimization

| Variant | Max Size | Format | Use Case |
|---------|----------|--------|----------|
| Thumbnail | 150x150 | WebP | Avatars, thumbnails |
| Small | 400x400 | WebP | Feed cards, story thumbnails |
| Medium | 800x800 | WebP/AVIF | Profile photos, feed images |
| Large | 1200x1200 | WebP/AVIF | Full-screen media |
| Original | Original | Original | Download, editing |

### Cache Headers

```typescript
// Public media (profile photos, post images)
Cache-Control: public, max-age=31536000, immutable

// Private media (message attachments)
Cache-Control: private, max-age=3600

// Dynamic content (feed, API responses)
Cache-Control: no-cache, must-revalidate
```

## Background Jobs

### Queue Architecture

```
API Server ──► Queue (Redis/Bull) ──► Worker 1
                                      Worker 2
                                      Worker 3
                                      └── Failed ──► Dead-Letter Queue
```

### Worker Scaling

| Job Type | Workers | Priority | Concurrency |
|----------|---------|----------|-------------|
| Payment processing | 2 | HIGH | 5 |
| Entitlement updates | 1 | HIGH | 5 |
| Notification delivery | 3 | NORMAL | 20 |
| Feed generation | 2 | NORMAL | 10 |
| Media processing | 2 | LOW | 3 |
| Analytics aggregation | 1 | LOW | 2 |
| Content moderation | 2 | NORMAL | 5 |
| Data cleanup | 1 | LOW | 1 |

## Real-time Scaling

### Supabase Realtime

| Tier | Max Connections | Max Channels | Events/sec |
|------|----------------|-------------|------------|
| Pro | 500 | Unlimited | 1000 |
| Team | 2000 | Unlimited | 5000 |
| Enterprise | Custom | Unlimited | 10000+ |

### Connection Management

- Client-side: Reconnect with exponential backoff (1s → 60s max)
- Server-side: Clean up idle connections after 5 minutes
- Channel subscription limits: 10 channels per client

## Cost Optimization

### Database

- Archive analytics events older than 90 days to cold storage
- Remove unused indexes (monitor index usage with `pg_stat_user_indexes`)
- Use partitioning for automatic data lifecycle management

### Storage

- Compress images before upload (client-side)
- Automatically delete expired story media
- Set lifecycle policies for temporary uploads
- Use CDN caching to reduce origin bandwidth

### AI

- Cache common AI queries
- Rate limit per user to prevent abuse
- Batch non-urgent AI processing
- Use smaller/faster models for classification

### Bandwidth

- Compress API responses (gzip/brotli)
- Use CDN for all static and user-uploaded media
- Implement lazy loading for images and videos
- Reduce payload size with field selection

## Capacity Planning Process

1. **Monthly review**: Review actual vs projected growth
2. **Bottleneck analysis**: Identify current bottleneck (database, compute, storage, bandwidth)
3. **Cost analysis**: Track cost per DAU per service
4. **Capacity projection**: Predict when next scaling phase is needed
5. **Budget planning**: Allocate budget for next phase infrastructure
6. **Testing**: Load test at projected scale before reaching capacity limits

### Capacity Formula

```
Required capacity = Peak DAU × Requests per user per day / (24 × 3600) × Peak factor

Example: 10K DAU × 100 requests/user/day / 86400 × 3 (peak factor)
= 10,000 × 100 / 86400 × 3
= ~35 RPS sustained, ~105 RPS peak
```
