# Retention Strategy

## Retention Metrics

| Metric | Definition | Target | Current Baseline |
|--------|-----------|--------|-----------------|
| **D1 Retention** | % of users active day after signup | > 50% | — |
| **D7 Retention** | % of users active on day 7 | > 30% | — |
| **D30 Retention** | % of users active on day 30 | > 20% | — |
| **D90 Retention** | % of users active on day 90 | > 15% | — |
| **Weekly Active Users (WAU)** | Unique users active in 7-day window | Growth ≥ 10% MoM | — |
| **Monthly Active Users (MAU)** | Unique users active in 30-day window | Growth ≥ 10% MoM | — |
| **Churn Rate** | % of users inactive for 30+ days | < 30% monthly | — |

## Segmentation for Retention

| Segment | D7 Target | D30 Target | Primary Churn Risk |
|---------|-----------|------------|-------------------|
| **Social Browsers** | 35% | 25% | No content creators to follow |
| **Dating Users** | 40% | 30% | Low match quality/volume |
| **Dating with Match** | 55% | 40% | Conversation fizzles |
| **Creators** | 60% | 45% | Low engagement/audience |
| **Fans** | 50% | 35% | Creator inactivity |
| **Premium Users** | 70% | 55% | Diminishing feature value |

## Churn Signals

### Early Churn (D0-D7)

| Signal | Detection | Intervention |
|--------|-----------|-------------|
| **No profile photo** | Profile incomplete after 1 hour | Push notification: "Add a photo to get noticed" |
| **No discovery interaction** | No likes/swipes in first session | In-app: "Check out who's near you" |
| **No match** | No match within first 3 days | Notification: "New people joined today" |
| **Profile incomplete** | < 3 interests selected | In-app prompt: "Help us find your people" |
| **No content interaction** | No feed views in first session | Onboarding: Show trending content |

### Medium-Term Churn (D7-D30)

| Signal | Detection | Intervention |
|--------|-----------|-------------|
| **Declining discovery usage** | Likes/swipes down 50% WoW | Notification: "Someone liked you" |
| **No new matches** | No matches in 7 days | Profile quality suggestion prompt |
| **Conversations dying** | No messages sent in 5 days | In-app: "Send a message to [match]" |
| **No content created** | No posts/stories in 14 days | Creator prompt: "Share what you're up to" |
| **Notification opt-out** | Disabled notifications | In-app: value of notifications |

### Late Churn (D30+)

| Signal | Detection | Intervention |
|---------|-----------|-------------|
| **Login frequency drop** | From daily to weekly | In-app feature highlight |
| **Feature adoption** | Never used video/stories/live | In-app discovery prompt |
| **Premium expiry** | Subscription ending soon | Email/in-app: renewal offer |
| **Creator inactivity** | No posts in 30 days | Analytics insights + posting tips |

## Win-Back Campaigns

### Trigger-Based Win-Back

| Trigger | Delay | Channel | Message |
|---------|-------|---------|---------|
| No app opens in 7 days | 7 days | Push notification | "Miss you! Here's what's new" |
| No app opens in 14 days | 14 days | Push notification | "You have pending matches" |
| No app opens in 30 days | 30 days | Push notification | "Your profile is still getting views" |
| Match not messaged in 3 days | 3 days | Push notification | "Say hi to [name] — you matched!" |
| Subscription expired | 1 day | Push notification | "Your premium benefits are still available" |
| Creator inactivity (30d) | 30 days | In-app | "Your audience misses you" |

### Win-Back Rules

- **Respect preferences**: Never send win-back if user disabled notifications
- **Frequency cap**: Max 2 win-back notifications per 30-day window
- **Content relevance**: Win-back should reference specific value (match, message, content)
- **Terminal**: After 3 unresponded win-back attempts, move to email-only (if available) or stop
- **Deletion**: If user deleted account, immediately stop all communication

## Retention Interventions by Segment

### New Users (D0-D7)

| Day | Action | Success Metric |
|-----|--------|---------------|
| D0 | Complete onboarding | Profile completion rate |
| D1 | First discovery view | D1 retention |
| D2 | First like/super-like | Dating activation |
| D3 | First follow | Social activation |
| D5 | First content view (story/video) | Feature adoption |
| D7 | First post (if content-oriented) | Creator activation |

### Dating Users

| Day | Intervention | Channel |
|-----|-------------|---------|
| D0-D1 | Show high-quality profiles first | In-discovery |
| D1-D3 | "Someone liked you" notification | Push |
| D3-D5 | Conversation starters after match | In-app |
| D5-D7 | Low match → profile quality suggestions | In-app |
| D7+ | New profiles in area | Push |

### Social Users

| Day | Intervention | Channel |
|-----|-------------|---------|
| D0-D1 | Follow trending creators | In-feed |
| D1-D3 | "Creator you follow posted" | Push |
| D3-D5 | Recommended similar creators | In-feed |
| D5-D7 | Social feed highlights | Push |
| D7+ | Weekly digest (popular in your network) | In-app |

### Creators

| Day | Intervention | Channel |
|-----|-------------|---------|
| D0-D1 | First post suggestions | In-app |
| D1-D3 | Engagement notification | Push |
| D3-D5 | Analytics insights | In-app |
| D5-D7 | Monetization eligibility | In-app |
| D7+ | Best-performing content | In-app |

## Notification Policy

| Type | Max/Day | Cooldown | Batch |
|------|---------|----------|-------|
| Match | 10 | 5 min | Yes |
| Message | 20 | 1 min (same match) | No |
| Like/Follow | 15 | 5 min | Yes |
| Creator update | 3 | 60 min | Yes |
| System | 5 | No limit | No |
| Marketing | 2 | 24h | Yes |
| Win-back | 2 | 7 days | No |
