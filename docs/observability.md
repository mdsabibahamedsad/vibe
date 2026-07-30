# Observability

## Overview

Vibe's observability stack consists of three pillars:
1. **Logs** — Structured event records
2. **Metrics** — Numerical measurements over time
3. **Traces** — Request flow across services

## Structured Logging

### Log Format

All application logs use structured JSON format:

```json
{
  "timestamp": "2026-07-29T12:00:00.000Z",
  "level": "INFO",
  "service": "vibe-api",
  "requestId": "req_abc123",
  "traceId": "trace_xyz789",
  "operation": "auth.login",
  "message": "User authenticated successfully",
  "userId": "user_42",
  "durationMs": 145,
  "errorCode": null
}
```

### Required Fields

| Field | Required | Description |
|-------|----------|-------------|
| timestamp | Always | ISO 8601 UTC |
| level | Always | DEBUG, INFO, WARN, ERROR |
| service | Always | Service identifier |
| requestId | Request context | Correlates logs for a single request |
| traceId | Request context | Correlates logs across services |
| operation | Always | What operation was being performed |
| message | Always | Human-readable description |

### Never Logged

- Passwords or authentication secrets
- Bot tokens or API keys
- Payment credentials or full card numbers
- Private message contents (metadata only)
- Private media or file paths
- Sensitive verification data (selfies, documents)
- Session tokens or refresh tokens

### Log Levels

| Level | When to Use |
|-------|------------|
| DEBUG | Development details, verbose state dumps |
| INFO | Normal operation, state transitions |
| WARN | Unexpected but handled conditions, rate limit exceeded, retry |
| ERROR | Failed operations requiring investigation |

## Metrics

### Key Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| `api.requests.total` | Counter | Total API requests | N/A |
| `api.requests.errors` | Counter | API error responses | > 1% of total requests |
| `api.latency.p50` | Histogram | Median request latency | > 500ms |
| `api.latency.p95` | Histogram | 95th percentile latency | > 2000ms |
| `api.latency.p99` | Histogram | 99th percentile latency | > 5000ms |
| `auth.success_rate` | Gauge | Authentication success rate | < 95% |
| `db.connections.active` | Gauge | Active database connections | > 80% of max |
| `db.connections.idle` | Gauge | Idle database connections | > 50% of active |
| `db.query.latency_p50` | Histogram | Median query latency | > 100ms |
| `queue.depth` | Gauge | Background job queue depth | > 1000 |
| `queue.failed` | Counter | Failed background jobs | > 10 in 5 minutes |
| `realtime.connections` | Gauge | Active Realtime connections | > 80% of limit |
| `realtime.events_per_sec` | Gauge | Realtime events per second | > 1000/s |
| `storage.upload.bytes` | Histogram | Upload sizes | N/A |
| `payment.failure_rate` | Gauge | Payment failure rate | > 5% |
| `media.processing_queue` | Gauge | Media processing queue depth | > 500 |

## Health Checks

### Endpoints

| Endpoint | Purpose | Dependencies Checked |
|----------|---------|---------------------|
| `GET /api/health` | Liveness | None — process running |
| `GET /api/health/ready` | Readiness | Database only |
| `GET /api/health/deps` | Dependency status | Database, Storage, Telegram |

### Response Format

```json
{
  "status": "ok",
  "service": "vibe-api",
  "uptime": 3600,
  "dependencies": [
    {
      "name": "supabase_postgresql",
      "status": "healthy",
      "latencyMs": 5
    }
  ],
  "timestamp": "2026-07-29T12:00:00.000Z"
}
```

## Alerting

### Alert Rules

| Alert Name | Condition | Severity | Response |
|-----------|-----------|----------|----------|
| High Error Rate | API error rate > 1% for 5 minutes | SEV-2 | Investigate recent deployment |
| High Latency | p95 latency > 2s for 5 minutes | SEV-2 | Check database queries |
| Database Exhaustion | Active connections > 80% | SEV-2 | Check connection pooling |
| Queue Backlog | Queue depth > 1000 | SEV-3 | Investigate worker health |
| Payment Failures | Failure rate > 5% for 5 minutes | SEV-1 | Immediate investigation |
| Auth Failures | Auth success rate < 95% | SEV-1 | Check Telegram Bot API |
| Storage Failures | Upload errors > 10% | SEV-2 | Check storage provider |
| Realtime Down | Realtime connections drop | SEV-3 | Check Realtime status |
| AI Outage | AI provider unavailable | SEV-4 | Check circuit breaker |
| DLQ Growing | DLQ entries > 50 in 1 hour | SEV-3 | Investigate failed jobs |

### Alert Fatigue Prevention

- No alerts for transient issues (single request failure)
- Aggregation window of 5 minutes minimum
- Skip alert if already acknowledged
- Separate notification routes: PagerDuty for SEV-1/2, Slack for SEV-3/4

## Request Correlation

### Request ID Flow

1. **API Entry**: Request ID generated at first middleware/route handler
2. **Database**: Request ID attached to all queries as comment
3. **Background Jobs**: Request ID stored in job metadata
4. **External Calls**: Request ID forwarded as header
5. **Logs**: Request ID included in all log entries

### Trace ID

Trace ID spans multiple services:
- Client → API Gateway → API Server → Database → AI Service
- Same trace ID across all hops enables end-to-end tracing

## Error Tracking

### Error Response Format

```json
{
  "error": "User-friendly message",
  "code": "ERROR_CODE",
  "requestId": "req_abc123",
  "timestamp": "2026-07-29T12:00:00.000Z"
}
```

### What Errors Include

- Safe user-facing message
- Internal error code (machine-readable)
- Request ID (for support)
- Timestamp

### What Errors NEVER Include

- Stack traces (in production)
- Internal IP addresses
- Database connection strings
- File paths
- API keys or tokens

## Database Performance Monitoring

Implemented in `src/lib/reliability/db-monitor.ts` — a lightweight, embedded monitor:

| Feature | Description |
|---------|-------------|
| Slow query tracking | Configurable threshold (default 500ms), logs and records all slow queries |
| Query duration histogram | P50, P95, P99 tracking per service/endpoint |
| Failure tracking | All query failures recorded with error messages |
| Recent records | Ring buffer of last 1000 queries for debugging |

Usage:
```typescript
import { dbMonitor } from "@/lib/reliability/db-monitor";

const result = await dbMonitor.trackQuery("get_user_profile", () => {
  return adminClient.from("users").select("*").eq("id", userId);
});

const stats = dbMonitor.getStats();
// { totalQueries, slowQueries, p95DurationMs, ... }
```

## Error Budget Tracking

Implemented in `src/lib/reliability/error-budget.ts`:

| Feature | Description |
|---------|-------------|
| SLO tracking | Per-service availability tracking against defined SLOs |
| Latency SLO | Tracks requests exceeding P95 latency targets |
| Budget consumption | Real-time error budget consumption tracking |
| Exhaustion alerts | Warnings when budget is exhausted |
| Period reset | Configurable reset at month boundaries |

SLOs tracked:
- Authentication: 99.9%
- Feed: 99.5%
- Discovery: 99.5%
- Chat: 99.0%
- Payments: 99.9%
- Media Upload: 99.0%
- Notifications: 99.0%
- Admin: 99.5%

## Cost Observability

### Tracked Cost Drivers

| Resource | Cost Driver | Optimization |
|----------|------------|-------------|
| Database | CPU, RAM, disk IOPS | Index optimization, query tuning |
| Storage | Data stored, bandwidth | Compression, CDN, lifecycle policies |
| Realtime | Active connections | Connection pooling, disconnect stale |
| AI Calls | API usage | Caching, throttling, prompt optimization |
| Search | Index size, query volume | Caching, rate limiting |
| Analytics | Event volume | Batch processing, retention limits |
| Bandwidth | CDN egress | Compression, lazy loading |

### Cost Alerts

- Monthly spending > 80% of budget
- AI API costs spike > 50% week-over-week
- Storage costs growing > 20% month-over-month
- Unexpected bandwidth spikes
