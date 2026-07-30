# Experimentation Governance

## Experiment Lifecycle

```
Hypothesis → Design → Review → Implement → Launch → Monitor → Analyze → Decide → Document
```

### Stage 1: Hypothesis

Every experiment must have:
- **Clear hypothesis**: "Changing X will improve Y by Z% because of reason W"
- **Primary metric**: Single metric the experiment aims to improve
- **Guardrail metrics**: Metrics that must not degrade
- **Target population**: Which users are included

Example:
```
Hypothesis: Adding conversation starters after match will increase 
first-message rate by 15% because users struggle with opening messages.

Primary Metric: First message sent within 24h of match
Guardrails: Message report rate, match rate, D7 retention
Population: New matches, first 7 days after match
```

### Stage 2: Design

| Element | Requirement |
|---------|-------------|
| **Duration** | Minimum 7 days, maximum 28 days |
| **Sample size** | Power analysis to detect minimum 5% relative change at 80% power |
| **Variants** | Max 4 (1 control + 3 treatments) |
| **Traffic split** | Equal split preferred, 50/50 or 25/25/25/25 |
| **Stratification** | By user type (social/dating/creator) if applicable |
| **Novelty effect** | Account for novelty by extending test to 2 full weeks |

### Stage 3: Review

| Reviewer | Checks |
|----------|--------|
| **Product Manager** | Hypothesis quality, metric relevance, user impact |
| **Engineer** | Implementation correctness, performance impact, no bugs |
| **Data Scientist** | Statistical validity, sample size, duration |
| **Safety Lead** | No safety regression, guardrail metrics |
| **Legal (if applicable)** | Privacy impact, regulatory compliance |

### Stage 4: Implementation

- All experiments use the existing A/B testing infrastructure (`src/lib/analytics/experiments.ts`)
- Feature flags for toggling treatment vs control
- No experiment should require separate deployment
- All experiment code must pass standard code review

### Stage 5: Monitor

- **Daily check**: Primary metric moving in expected direction?
- **Guardrail check**: Any guardrail metric crossed threshold?
- **Safety check**: Report rate, support tickets, moderation flags
- **Technical check**: Error rate, latency, crash rate

### Stage 6: Analyze

| Result | Action |
|--------|--------|
| **Significant positive** (+95% confidence) | Consider rollout, replicate if close to threshold |
| **Significant negative** | Stop experiment, investigate root cause |
| **Inconclusive** | Analyze for insights, consider higher-powered test |
| **Null result** | Document learnings, move on |

### Stage 7: Decide & Document

| Decision | Criteria |
|----------|----------|
| **Roll out** | Statistically significant positive on primary, no guardrail degradation |
| **Roll out with monitoring** | Mild positive, no guardrail issues |
| **Iterate** | Inconclusive but directional positive |
| **Discard** | Negative result or no impact |
| **Further investigation** | Unexpected guardrail changes or user feedback |

## NEVER A/B Test

These areas must NEVER be experimented on:
1. **Safety-critical enforcement** (rate limits, blocks, bans)
2. **Payment correctness** (prices, webhooks, refunds)
3. **Privacy controls** (data sharing, visibility settings)
4. **Account deletion flow** (must be clear and consistent)
5. **Age restrictions** (must be uniformly enforced)
6. **Content moderation** (moderation actions must be consistent)
7. **Reporting flow** (reporting must be accessible and reliable)

## Guardrail Metrics

| Guardrail | Threshold | Action on Breach |
|-----------|-----------|-----------------|
| **Report rate** (per 1000 users) | > 20% increase | Stop and investigate |
| **Block rate** (per 1000 users) | > 15% increase | Stop and investigate |
| **D7 Retention** | > 5% relative decrease | Stop and investigate |
| **D30 Retention** | > 3% relative decrease | Stop and investigate |
| **Error rate** | > 2x control rate | Stop immediately |
| **p95 Latency** | > 500ms increase | Stop and optimize |
| **Support tickets** | > 20% increase | Flag for investigation |
| **Payment failure rate** | > 2x control rate | Stop immediately |
| **Crash rate** | > 0.1% increase | Stop immediately |

## Experiment Registry

All experiments must be registered in the admin panel (`/admin/analytics/experiments`):

| Field | Required | Description |
|-------|----------|-------------|
| Name | ✅ | Human-readable experiment name |
| Hypothesis | ✅ | Clear hypothesis statement |
| Primary metric | ✅ | Single primary metric |
| Guardrails | ✅ | Comma-separated guardrail metrics |
| Owner | ✅ | Responsible team member |
| Status | ✅ | Draft → Running → Analyzing → Closed |
| Start date | ✅ | When experiment started |
| Planned end date | ✅ | When experiment should end |
| Variants | ✅ | Control + treatment definitions |

## Experiment Safety Rules

1. **Stop on guardrail breach**: Auto-stop if any guardrail crosses threshold
2. **Minimum sample**: No decisions before minimum sample size reached
3. **No peeking**: Don't stop early just because result looks significant
4. **Document null results**: Null results are as valuable as positive ones
5. **One change at a time**: Don't test multiple changes in one experiment
6. **User-facing changes**: Never experiment without users knowing (A/B testing is OK, hiding safety controls is not)
7. **Reversible**: All experiments must be reversible — rollback = remove feature flag override

## Experiment Implementation Checklist

- [ ] Experiment registered in admin panel
- [ ] Feature flag created for treatment variant
- [ ] Primary metric tracked via analytics events
- [ ] Guardrail metrics identified and tracked
- [ ] Sample size calculated (min 500 users per variant)
- [ ] Duration set (min 7 days)
- [ ] Safety review completed
- [ ] Rollback plan documented
- [ ] Auto-stop conditions configured
- [ ] Stakeholders notified of experiment start
