# Load Testing

## Testing Tool

Recommended tool: **k6** (Grafana k6) — open-source, scriptable, JavaScript-native load testing.

Installation: `npm install -g @grafana/k6`

## Test Scenarios

### Scenario 1: Authentication Burst

Simulates a Telegram notification burst causing many users to authenticate simultaneously.

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 50 },   // Ramp up to 50 VUs
    { duration: '30s', target: 100 },  // Ramp to 100 VUs
    { duration: '60s', target: 100 },  // Stay at 100
    { duration: '10s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95% of requests under 2s
    http_req_failed: ['rate<0.01'],     // Less than 1% failure rate
  },
};

export default function () {
  const payload = JSON.stringify({
    initData: 'test_init_data_' + __VU,
  });

  const res = http.post('https://api.vibe.app/api/auth/telegram', {
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });

  check(res, {
    'auth status is 200': (r) => r.status === 200,
    'response time < 3s': (r) => r.timings.duration < 3000,
  });

  sleep(1);
}
```

### Scenario 2: Feed Browsing

Simulates users scrolling through the feed.

```javascript
export default function () {
  const res = http.get('https://api.vibe.app/api/feed?cursor=' + __VU, {
    headers: {
      'Authorization': `Bearer ${__ENV.AUTH_TOKEN}`,
    },
  });

  check(res, {
    'feed status is 200': (r) => r.status === 200,
    'feed returns items': (r) => JSON.parse(r.body).items.length > 0,
    'feed latency < 1s': (r) => r.timings.duration < 1000,
  });

  sleep(Math.random() * 3 + 2); // 2-5 seconds between feed loads
}
```

### Scenario 3: Chat Messaging

Simulates users sending messages in conversations.

```javascript
export default function () {
  const payload = JSON.stringify({
    conversationId: 'conv_' + (__VU % 100),
    content: 'Test message from load test ' + __ITER,
  });

  const res = http.post('https://api.vibe.app/api/chat/messages', {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${__ENV.AUTH_TOKEN}`,
    },
    body: payload,
  });

  check(res, {
    'message sent': (r) => r.status === 200 || r.status === 201,
    'message latency < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

### Scenario 4: Discovery Swiping

Simulates users swiping through discovery profiles.

```javascript
export default function () {
  const res = http.get('https://api.vibe.app/api/discovery?mode=dating&limit=10', {
    headers: {
      'Authorization': `Bearer ${__ENV.AUTH_TOKEN}`,
    },
  });

  check(res, {
    'discovery status is 200': (r) => r.status === 200,
    'discovery latency < 2s': (r) => r.timings.duration < 2000,
  });

  if (res.status === 200) {
    const body = JSON.parse(res.body);
    if (body.items && body.items.length > 0) {
      const targetId = body.items[0].id;
      const actionRes = http.post('https://api.vibe.app/api/discovery/like', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${__ENV.AUTH_TOKEN}`,
        },
        body: JSON.stringify({ targetUserId: targetId }),
      });

      check(actionRes, {
        'like action succeeds': (r) => r.status === 200,
      });
    }
  }

  sleep(Math.random() * 2 + 1); // 1-3 seconds between swipes
}
```

### Scenario 5: Media Upload

Simulates users uploading profile photos and post media.

```javascript
import http from 'k6/http';

export default function () {
  const file = open('/path/to/test-image.jpg', 'b');
  
  const formData = {
    file: http.file(file, 'test-image.jpg', 'image/jpeg'),
    purpose: 'profile',
  };

  const res = http.post('https://api.vibe.app/api/media/upload', {
    headers: {
      'Authorization': `Bearer ${__ENV.AUTH_TOKEN}`,
    },
    body: formData,
  });

  check(res, {
    'upload status is 200': (r) => r.status === 200,
    'upload latency < 5s': (r) => r.timings.duration < 5000,
  });
}
```

### Scenario 6: Premium Purchase Flow

Simulates the checkout and payment flow.

```javascript
export default function () {
  // View premium page
  http.get('https://api.vibe.app/api/premium', {
    headers: { 'Authorization': `Bearer ${__ENV.AUTH_TOKEN}` },
  });

  // Attempt checkout
  const checkoutRes = http.post('https://api.vibe.app/api/billing/checkout', {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${__ENV.AUTH_TOKEN}`,
    },
    body: JSON.stringify({ planSlug: 'monthly', provider: 'telegram_stars' }),
  });

  check(checkoutRes, {
    'checkout initializes': (r) => r.status === 200,
    'checkout latency < 3s': (r) => r.timings.duration < 3000,
  });
}
```

## Load Test Execution

### Running Tests

```bash
# Single scenario
k6 run --vus 50 --duration 2m scenarios/auth-burst.js

# With environment variables
k6 run -e AUTH_TOKEN=<token> scenarios/feed-browsing.js

# All scenarios sequentially
k6 run scenarios/all-scenarios.js
```

### Metrics to Monitor

| Metric | Target | Critical |
|--------|--------|----------|
| Error rate | < 1% | > 5% |
| p95 latency | < 2s | > 5s |
| p99 latency | < 5s | > 10s |
| Requests/sec | Stable | Dropping |
| Memory (per instance) | < 512MB | > 1GB |
| CPU (per instance) | < 70% | > 90% |
| Database connections | < 50% of max | > 80% of max |

## Stress Testing

### Spike Test

Simulates a sudden traffic spike (e.g., viral notification):

```javascript
export const options = {
  stages: [
    { duration: '1m', target: 200 },   // Normal load ramp
    { duration: '10s', target: 2000 }, // Spike to 2000 VUs
    { duration: '30s', target: 2000 }, // Hold spike
    { duration: '1m', target: 200 },   // Return to normal
  ],
};
```

### Soak Test

Simulates sustained load over hours to detect memory leaks:

```javascript
export const options = {
  stages: [
    { duration: '10m', target: 100 },
    { duration: '4h', target: 100 },   // 4 hours sustained
    { duration: '10m', target: 0 },
  ],
};
```

## Chaos / Failure Testing

Simulate failures in a non-production environment:

| Scenario | How to Simulate | Expected Behavior |
|----------|----------------|-------------------|
| Database latency | Network latency injection (tc) | Queries timeout, fallback to cached data |
| Database unavailable | Block database port | Readiness fails, app shows error page |
| Storage unavailable | Block storage endpoint | Media shows placeholders, upload fails gracefully |
| AI unavailable | Block AI provider | Circuit breaker opens, app continues without AI |
| Search unavailable | Block search provider | Fallback to basic PostgreSQL search |
| Queue failure | Stop background worker | Jobs remain queued, no data loss |
| Notification failure | Block notification endpoint | Queued for retry, no immediate delivery |
| Realtime disconnect | Kill WebSocket connections | Chat delivers on next poll/reconnect |

## Pre-Production Checklist

- [ ] Run all load test scenarios with expected peak traffic
- [ ] Verify error rate < 1% under load
- [ ] Verify p95 latency under SLO thresholds
- [ ] Verify no authorization/rate-limit bypass under load
- [ ] Run chaos tests for each dependency failure scenario
- [ ] Verify database connection pool does not exhaust
- [ ] Verify background queue does not grow unbounded
- [ ] Document test results and any tuning changes
- [ ] Share results with engineering team
