# Launch Readiness

## Launch Readiness Scorecard

### Product

| Area | Status | Evidence | Notes |
|------|--------|----------|-------|
| **Onboarding UX** | ✅ PASS | 5-step onboarding with progress indicator, skip options | Users can skip steps |
| **Profile Creation** | ✅ PASS | Photo, bio, interests, preferences | Optional fields allowed |
| **Discovery UI** | ✅ PASS | Dating + Social modes, filters, recommendations | Cursor pagination |
| **Dating Flow** | ✅ PASS | Like → Match → Message → Conversation | Match celebration |
| **Social Feed** | ✅ PASS | Chronological + ranked, creator content, videos | Cursor pagination |
| **Chat** | ✅ PASS | Realtime, media, safety warnings, typing indicators | Block/report available |
| **Stories** | ✅ PASS | Create, view, react, privacy controls | 24h expiry |
| **Short Videos** | ✅ PASS | Upload, feed, creator profiles, premium-only flag | Rate limited |
| **Live Streaming** | ✅ PASS | Host, viewer, gifts, moderation | Host controls |
| **Search** | ✅ PASS | Social + dating modes, text + interest search | Cursor pagination |

### Monetization

| Area | Status | Evidence | Notes |
|------|--------|----------|-------|
| **Premium Paywall** | ✅ PASS | Feature comparison, transparent pricing, cancel flow | Stars prices |
| **Subscription Management** | ✅ PASS | Plans, activation, cancel, restore, history | Server-authoritative |
| **Gifts** | ✅ PASS | During live streams, gift catalog, transaction history | Idempotent processing |
| **Ads** | ✅ PASS | Placements, frequency caps, reporting, sponsored labels | CPM pricing |
| **Creator Monetization** | ✅ PASS | Eligibility, payouts, earnings dashboard, analytics | Min 100 Stars payout |

### Safety

| Area | Status | Evidence | Notes |
|------|--------|----------|-------|
| **Moderation** | ✅ PASS | Content moderation, user restriction, appeal system | Queue with pagination |
| **Anti-Scam** | ✅ PASS | Keyword detection, URL safety, behavioral signals | Configurable thresholds |
| **Chat Safety** | ✅ PASS | Warnings, harassment detection, message controls | Progressive enforcement |
| **Reporting** | ✅ PASS | All content types, block enforcement, report queue | Abuse prevention |
| **Blocking** | ✅ PASS | Server-side enforcement, prevents all interaction | Audit logged |
| **Trust Profiles** | ✅ PASS | Scoring, badges, behavioral signals | Internal only |
| **Age Safety** | ⚠️ NEEDS WORK | Self-reported age, no verification | Dating 18+ enforced |
| **Privacy Controls** | ✅ PASS | Profile visibility, message controls, discovery opt-out | Per-setting |

### Reliability

| Area | Status | Evidence | Notes |
|------|--------|----------|-------|
| **Performance** | ✅ PASS | Cursor pagination, lazy loading, optimized media | CDN delivery |
| **Monitoring** | ✅ PASS | Health checks, structured logging, metrics defined | Alert rules |
| **Backup** | ✅ PASS | PITR + daily snapshots + weekly | Restore script |
| **Recovery** | ✅ PASS | Disaster recovery plan, rollback plan | Documented |
| **Error Handling** | ✅ PASS | Typed errors, safe responses, gracefulness | Circuit breakers |

### Growth

| Area | Status | Evidence | Notes |
|------|--------|----------|-------|
| **Referral** | ✅ PASS | Referral codes, tracking, rewards | Abuse detection in place |
| **Deep Linking** | ✅ PASS | Posts, profiles, stories, matches notifications | Telegram share |
| **Sharing** | ✅ PASS | Post share, profile share, story share | Telegram WebApp API |
| **Notifications** | ✅ PASS | Granular preferences, cooldowns, grouping, dedup | All channels |

### Overall Score

| Category | Status |
|----------|--------|
| Product | ✅ 10/10 PASS |
| Monetization | ✅ 5/5 PASS |
| Safety | ✅ 7/8 PASS (1 Needs Work) |
| Reliability | ✅ 5/5 PASS |
| Growth | ✅ 4/4 PASS |
| **Overall** | **✅ 31/32 PASS** |

## Launch Dashboard

### Real-Time Metrics

| Metric | Source | Refresh | Alert Threshold |
|--------|--------|---------|-----------------|
| **Active Users (current)** | Realtime count | 1 min | Sudden 50% drop |
| **New Users (today)** | Analytics events | Real-time | — |
| **Activation Rate** | Onboarding completion / signups | 1 hour | < 40% |
| **DAU** | Unique users today | 1 hour | 20% drop from projection |
| **Error Rate** | 5xx responses / total | 1 min | > 1% |
| **p95 Latency** | API latency histogram | 1 min | > 2000ms |
| **Auth Success Rate** | Successful auth / total | 1 min | < 95% |
| **Payment Failure Rate** | Failed payments / total | 1 min | > 5% |
| **Moderation Queue** | Pending reports | Real-time | > 100 |
| **Chat Messages/min** | Messages sent in last minute | 1 min | — |
| **Feed Loads/min** | Feed API requests | 1 min | — |
| **Media Uploads/min** | Upload requests | 1 min | — |

### Business Metrics Dashboard (Daily)

| Metric | Target | Alert |
|--------|--------|-------|
| DAU | ≥ projection | < 80% of projection |
| New users | ≥ projection | < 50% of projection |
| Activation rate | ≥ 45% | < 30% |
| D1 retention | ≥ 50% | < 35% |
| D7 retention | ≥ 30% | < 20% |
| Premium conversion | ≥ 2% | < 1% |
| Premium churn (monthly) | ≤ 10% | > 20% |
| Creator posts/day | ≥ 5% of DAU | < 2% |
| Reports/1000 users | ≤ 5 | > 15 |
| Block rate/1000 users | ≤ 3 | > 10 |

## Launch Day Alerts

| Alert | Severity | Condition | Response |
|-------|----------|-----------|----------|
| **Auth Down** | CRITICAL | Auth success < 50% for 2 min | Immediate investigation |
| **Feed Down** | CRITICAL | Feed error > 20% for 2 min | Rollback or feature flag |
| **Payments Failing** | CRITICAL | Payment failure > 10% for 5 min | Stop payment flow, investigate |
| **Chat Unavailable** | HIGH | Chat latency > 5s for 5 min | Check realtime infrastructure |
| **Database Exhaustion** | CRITICAL | Active connections > 80% | Scale or throttle |
| **Storage Errors** | HIGH | Upload error > 20% for 5 min | Check storage provider |
| **Moderation Backlog** | HIGH | Pending reports > 500 | Alert moderation team |
| **Error Rate Spike** | HIGH | 5xx rate > 5% for 2 min | Check recent deployment |
| **Traffic Spike** | INFO | Requests > 3x normal | Monitor all systems |
| **Fraud Spike** | HIGH | Same-IP accounts > 20/hour | Rate limit enforcement |

## Launch Day Feature Flags

| Flag | Description | Action |
|------|-------------|--------|
| `disable_new_registrations` | Block new user signups | Toggle if abuse detected |
| `disable_referrals` | Stop referral program | Toggle if referral abuse |
| `disable_gifts` | Disable gift sending | Toggle if payment issues |
| `disable_live_streaming` | Turn off live streaming | Toggle if performance issues |
| `reduce_notifications` | Cut notification volume by 50% | Toggle if notification fatigue |
| `disable_ads` | Stop ad delivery | Toggle if ad system issues |
| `disable_experiments` | Pause all A/B tests | Toggle if experiment contamination |
| `disable_recommendations` | Fall back to chronological feed | Toggle if rec engine issues |
| `maintenance_mode` | Show maintenance page | Last resort for critical issues |

**Safety-critical features must NOT have kill switches**: auth, moderation, reporting, blocking, privacy controls, payments.

## Product Kill Switches (Non-Critical Only)

| Module | Kill Switch | Impact | Recovery |
|--------|------------|--------|----------|
| Live Streaming | `disable_live_streaming` | Hosts can't stream | Re-enable flag |
| Gifts | `disable_gifts` | Gifts disabled | Re-enable flag |
| Referral Rewards | `disable_referrals` | No new rewards | Re-enable flag |
| Experimental Recommendations | `disable_recommendations` | Chronological feed | Re-enable flag |
| Specific Ad Formats | `disable_ads` | No ads shown | Re-enable flag |
| New Creator Features | Per-feature flag | Feature hidden | Re-enable flag |
| AI Recommendations | Circuit breaker | Rule-based fallback | Auto-recovery |

## Production Smoke Test

Run this checklist against production (or staging if production not available):

### Authentication
- [ ] Open Telegram Mini App
- [ ] Complete Telegram login
- [ ] Verify redirect to onboarding/home
- [ ] Logout and verify session cleared
- [ ] Re-login with remembered session

### Onboarding
- [ ] Complete all onboarding steps
- [ ] Skip optional steps
- [ ] Verify profile created accurately

### Discovery
- [ ] View discovery profiles
- [ ] Apply filters
- [ ] Paginate through results

### Dating
- [ ] Send a like
- [ ] Receive a match (coordinated test)
- [ ] Use match celebration UI

### Social Feed
- [ ] View feed
- [ ] Like a post
- [ ] Comment on a post
- [ ] Share a post

### Chat
- [ ] Send a message in matched conversation
- [ ] Send a media message (image)
- [ ] Verify realtime delivery
- [ ] Block the conversation partner
- [ ] Verify block prevents further interaction

### Media
- [ ] Upload a profile photo
- [ ] Upload to a post
- [ ] Create a story
- [ ] View uploaded media

### Premium
- [ ] View premium page
- [ ] Initiate test purchase
- [ ] Verify entitlement activated
- [ ] Cancel subscription
- [ ] Verify restoration flow

### Reporting and Safety
- [ ] Report a post
- [ ] Report a user
- [ ] Block a user
- [ ] Verify block enforcement in chat

### Settings
- [ ] Update profile
- [ ] Change privacy settings
- [ ] Verify settings persisted

### Account
- [ ] Request data export
- [ ] Verify export contains expected data
- [ ] Request account deletion
- [ ] Verify account disabled

## Post-Launch Monitoring (First 72 Hours)

| Time | Action |
|------|--------|
| **T+0 (Launch)** | Monitor auth + payments + feed continuously |
| **T+1 hour** | Check error rate, auth success, DAU tracking |
| **T+2 hours** | Review first support tickets for patterns |
| **T+4 hours** | Check moderation queue for new content |
| **T+8 hours** | Review D0 activation rate |
| **T+24 hours** | D1 retention check, compare to projection |
| **T+48 hours** | D1 + D2 retention, check for churn signals |
| **T+72 hours** | First 3-day health review, adjust monitoring |
