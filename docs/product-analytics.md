# Product Analytics & Growth

## North Star Metrics

| Metric | Definition | Target | Why |
|--------|-----------|--------|-----|
| **Meaningful Interactions** | Sum of likes, matches, messages, follows, comments per user per day | > 5 per DAU | Core engagement signal |
| **D7 Retention** | % of users active on day 7 after signup | > 30% | Product-market fit indicator |
| **Premium Conversion** | % of active users with active subscription | > 3% | Sustainable revenue |
| **Creator Engagement** | % of creators active per week | > 40% | Supply-side health |

## Activation Events

| Event | Definition | Target | Measurement |
|-------|-----------|--------|-------------|
| **Profile Completed** | Photo + bio + 3 interests | > 70% of signups | Tracking: `profile_created` event |
| **First Discovery View** | Opens discovery feed | > 85% | Tracking: `discovery_view` event |
| **First Like** | Sends first like (dating) or follows (social) | > 50% of retained users | Tracking: `like_sent` or `follow` |
| **First Match** | Receives first mutual match | > 30% of active dating users | Tracking: `match_created` event |
| **First Message** | Sends first message after match | > 60% of matched users | Tracking: `message_sent` event |
| **First Content** | Creates post, story, or video | > 20% of users | Tracking: `post_create` event |

## Funnels

### Dating Funnel
```
Discovery → Profile View → Like → Match → Message → Conversation
```

| Step | Expected Drop-off | Key Levers |
|------|------------------|------------|
| Discovery → Like | 70-80% | Profile quality, photos, bio |
| Like → Match | 80-90% (mutual) | Like volume, reciprocity |
| Match → Message | 50-60% | Conversation starters, timing |
| Message → Conversation (3+ msgs) | 40-50% | Chat quality, shared interests |

### Social Funnel
```
Discovery → Profile View → Follow → Engagement → Return
```

| Step | Expected Drop-off | Key Levers |
|------|------------------|------------|
| Discovery → Follow | 60-70% | Content quality, relevance |
| Follow → Engagement (like/comment) | 50-60% | Feed quality, notifications |
| Engagement → Return (within 24h) | 40-50% | Feed freshness, creators |

### Premium Funnel
```
Exposure → Paywall View → Checkout → Purchase → Active
```

| Step | Expected Drop-off | Key Levers |
|------|------------------|------------|
| Exposure → Paywall View | 60-70% | Paywall placement, timing |
| Paywall View → Checkout | 10-20% | Price, value prop, urgency |
| Checkout → Purchase | 60-80% | Payment flow, Telegram Stars UX |
| Purchase → Active (keep 30d) | 70-80% | Feature delivery, onboarding |

## Growth Loops

### Content Loop
```
User creates content → Feed shows to followers → Followers engage → Creator notified → Creates more
```

### Dating Loop
```
User likes profile → Match created → Message sent → Conversation → Dating → (Optional) Remove from discovery
```

### Referral Loop
```
User invites friend → Friend signs up → Both get reward → User invites more
```

### Creator Loop
```
Creator publishes → Audience engages → Algorithm shows more → New audience follows → Creator publishes more
```

## Segmentation

| Segment | Definition | Primary Metric | Retention Strategy |
|---------|-----------|---------------|-------------------|
| **Social Browsers** | Use feed but not dating | Feed sessions/week | Creator follow suggestions |
| **Dating Users** | Active on discovery | Likes/day | Match quality, conversation starters |
| **Creators** | Published content | Content/week | Analytics, monetization insights |
| **Fans** | Follow creators, engage | Engagement/week | Creator updates, exclusive content |
| **Premium Users** | Active subscription | Subscription length | Feature value, renewal reminders |

## Acquisition Channels

| Channel | Cost | Quality (D30) | Measurement |
|---------|------|--------------|-------------|
| Telegram Search | Free | Medium | Organic discovery |
| Referral | Reward cost | High | Referral code tracking |
| Telegram Ads | Paid | Medium | Ad campaign tracking |
| Social (cross-platform) | Free | Low-Moderate | Deep link tracking |
| Creator cross-promotion | Free | High | Creator attribution |
