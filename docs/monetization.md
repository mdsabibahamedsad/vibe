# Monetization Strategy

## Revenue Streams

| Stream | Description | Priority | Maturity |
|--------|-----------|----------|----------|
| **Premium Subscriptions** | Monthly/annual recurring subscription via Telegram Stars | Primary | ✅ Implemented |
| **Telegram Stars Gifts** | Fan-to-creator instant gifts during live streams and content | Secondary | ✅ Implemented |
| **Advertising** | In-feed and interstitial ad placements | Tertiary | ✅ Implemented |
| **Creator Subscriptions** | Recurring fan subscriptions to specific creators | Future | 📋 Planned |
| **Promoted Content** | Creator/ brand sponsored content boosts | Future | 📋 Planned |

## Premium Subscriptions

### Plans

| Plan | Price (Stars) | Duration | Key Features | Target Segment |
|------|--------------|----------|-------------|----------------|
| **Premium Monthly** | 100 | 30 days | Badge, advanced filters, unlimited likes | Dating users |
| **Premium Annual** | 800 | 365 days | All premium features, best value | Power users |
| **Premium Boost** | 50 | 7 days | Profile boost, who liked you | New users |

### Feature-to-Plan Mapping

| Feature | Free | Premium Monthly | Premium Annual |
|---------|------|----------------|---------------|
| Profile visibility | Public | Public + Boost | Public + Boost |
| Daily likes | 30 | Unlimited | Unlimited |
| Super likes | 3/day | 10/day | 10/day |
| Discovery filters | Basic | Advanced | Advanced |
| Who liked you | Hidden | Visible | Visible |
| Read receipts | No | Yes | Yes |
| Incognito mode | No | Yes | Yes |
| Premium badge | No | Yes | Yes |
| Profile boost | No | 1/week | 2/week |
| Rewind (undo swipe) | No | Yes | Yes |

### Conversion Optimization

| Tactic | Expected Lift | Implementation |
|--------|--------------|---------------|
| **Paywall after high-value action** (e.g., ran out of likes) | +15-20% | Show paywall when user hits like limit |
| **First-week discount** | +10-15% | Reduced price for first 7 days |
| **Match quality preview** (show who liked you without premium) | +5-10% | Blurred faces, show count |
| **Time-limited offer** | +10-15% | "Premium at this price for 24h" |
| **Social proof** ("2,000+ users upgraded this week") | +5-10% | In-paywall counter |

### Paywall Design Principles

1. **Clear value proposition**: Feature comparison (free vs premium)
2. **Transparent pricing**: Stars amount, duration, auto-renewal terms
3. **Easy cancellation**: One-click cancel, no dark patterns
4. **Feature gate accuracy**: Never upsell features that don't exist
5. **Recovery path**: Expired subscription → restore flow

## Creator Monetization

### Creator Revenue Sources

| Source | Description | Platform Cut |
|--------|-----------|-------------|
| **Gifts** | Instant fan gifts (hearts, stars, etc.) | 30% |
| **Tip Jar** | Direct tips on profile | 30% |
| **Premium Content** | Pay-per-view exclusive content | 20% |
| **Creator Subscriptions** | Monthly fan subscriptions | 20% |

### Monetization Eligibility

| Requirement | Description | Verification |
|-------------|-----------|-------------|
| Min age | 18+ | Self-reported + verification |
| Content policy | No policy violations | Moderation review |
| Min followers | 100 | Automated check |
| Min content | 5 posts | Automated check |
| Active period | 30+ days since signup | Automated check |
| Identity verification | Basic KYC for payouts | Manual review (≥500 Stars) |

### Creator Payouts

| Tier | Payout Threshold | Method | Frequency |
|------|-----------------|--------|-----------|
| Standard | 100 Stars | Telegram Stars transfer | On request |
| Verified | 50 Stars | Telegram Stars transfer | Weekly |
| Partner | Custom | Telegram Stars transfer | Weekly |

## Advertising

### Ad Placements

| Placement | Format | Pricing | Max Frequency/User/Day |
|-----------|--------|---------|----------------------|
| **Feed (Sponsored Posts)** | Native card | CPM | 3 |
| **Feed (Interstitial)** | Full-screen | CPM | 2 |
| **Discovery** | Profile card | CPM | 2 |
| **Stories** | Story frame | CPM | 2 |
| **Banner** | Top/bottom bar | CPM | 5 |
| **Creator placements** | Promoted content | CPM/CPC | Creator decides |

### Ad Targeting (Permitted Signals)

| Signal | Allowed | Notes |
|--------|---------|-------|
| Age range | ✅ | Self-reported only |
| Gender | ✅ | Self-reported only |
| Country/region | ✅ | From IP + profile |
| Language | ✅ | App language |
| Interest categories | ✅ | From profile interests |
| **Dating preferences** | ❌ | Never used for ads |
| **Private messages** | ❌ | Never used for ads |
| **Location (precise)** | ❌ | Never used for ads |
| **Sensitive attributes** | ❌ | Religion, politics, health |

### Ad Experience Rules

1. Max 3 feed ads per 24 items
2. No back-to-back ads
3. Ads clearly labeled "Sponsored" or "Promoted"
4. Ad reporting available (misleading, inappropriate, offensive)
5. Ad frequency cap enforced server-side
6. No ads in safety contexts (report page, block confirmation, moderation)

## Unit Economics

| Metric | Target | How to Measure |
|--------|--------|---------------|
| **ARPU** (Average Revenue Per User) | ≥ 0.50 Stars/month | Total revenue / MAU |
| **ARPPU** (Average Revenue Per Paying User) | ≥ 10 Stars/month | Subscription + gift revenue / paying users |
| **Premium Conversion Rate** | ≥ 3% | Active premium users / MAU |
| **Ad RPM** (Revenue Per Mille) | ≥ 2 Stars | Ad revenue / (impressions / 1000) |
| **Creator Monetization Rate** | ≥ 10% | Creators with revenue / total creators |
| **Gift Conversion Rate** | ≥ 5% of viewers | Gift senders / unique live viewers |
| **Infrastructure Cost per DAU** | ≤ 0.10 Stars/month | Total infra cost / DAU |
| **Acquisition Cost per Install** | Organic only | Referral reward cost / referred installs |

## Revenue Analytics

| Dashboard | Metrics | Refresh | Audience |
|-----------|---------|---------|----------|
| **Executive Overview** | Revenue by stream, MAU, ARPU | Daily | Leadership |
| **Premium Dashboard** | Conversion, churn, LTV | Daily | Product |
| **Ads Dashboard** | Impressions, RPM, fill rate | Hourly | Ad Ops |
| **Creator Revenue** | Payouts, top creators, gift volume | Daily | Creator team |
| **Unit Economics** | ARPU, ARPPU, infra cost | Weekly | Leadership |

## Monetization Guardrails

Never optimize for revenue at the expense of:
1. **User safety** — No pay-to-contact, no safety feature gating
2. **Retention** — Aggressive monetization should not cause churn
3. **Trust** — Transparent pricing, no hidden fees
4. **Creator health** — Fair revenue share, predictable payouts
5. **Privacy** — No monetization of sensitive data
6. **Quality** — No pay-for-engagement (fake likes, fake followers)
