# Age & Child Safety Compliance

> **IMPORTANT**: This document identifies technical age-safety measures only. It does NOT constitute legal compliance with COPPA, the UK Age-Appropriate Design Code, or any other children's privacy regulation. Review by qualified legal counsel is required before public launch.

---

## 1. Age Gates & Restrictions

### Current Implementation

| Feature | Age Restriction | Enforcement |
|---------|----------------|-------------|
| Dating & matching | 18+ | Self-reported during onboarding |
| Stories | None | Not age-gated |
| Social feed | None | Not age-gated |
| Messaging | None | Not age-gated |
| Premium purchases | None | Not age-gated |
| Creator monetization | 18+ | Self-reported |
| Live streaming | 18+ (host), none (viewer) | Self-reported |
| Advertising | None | Not age-gated |

### Gaps

| Gap | Risk | Recommended Action |
|-----|------|-------------------|
| No platform-wide age collection | Minors may access adult-oriented features | Add age gate at registration |
| Self-reported age is not verified | Users can falsify age | Consider optional verification for high-risk features |
| No age-based content filtering | Minors may see adult content | Implement content tiering based on age |
| Dating features accessible to self-reported minors | Regulatory risk | Stronger dating age verification |

## 2. Age Verification Strategy

### Tier 1: Self-Reported Age (All Users)

Minimum implementation for all regions:
- Collect date of birth during onboarding
- Store date of birth (not just derived age) for accuracy
- Deny access to 18+ features if age < 18
- Deny platform access if age < 13 (or applicable minimum)
- Allow correction if user claims incorrect age entry

### Tier 2: Enhanced Verification (High-Risk Features)

For dating, live streaming hosting, and creator monetization:
- Periodic re-verification prompts
- Photo-based age estimation (AI-assisted)
- ID document verification for payout eligibility

### Tier 3: Legal Verification (Payouts)

For creator payouts above threshold:
- Government ID verification
- Tax information collection (W-9/W-8BEN)
- Identity match verification

## 3. Child Safety Controls

### Content Moderation

| Measure | Implementation | Coverage |
|---------|---------------|----------|
| Prohibited content detection | AI moderation + human review | All public content |
| Private chat safety warnings | Behavioral detection | High-risk conversations |
| Reporting system | In-app + Telegram reporting | All content types |
| Blocking | Server-side enforcement | All interactions |
| Trust profiles | Behavioral scoring | All users |

### Messaging Protections

| Feature | Status | Description |
|---------|--------|-------------|
| Unknown sender filtering | ✅ Implemented | Messages from non-contacts flagged |
| Scam detection | ✅ Implemented | Anti-scam service active |
| Link safety analysis | ✅ Implemented | URL scanning for phishing |
| Password sharing detection | ✅ Implemented | Warning on password-related messages |
| Image safety scanning | ⚠️ Planned | Automated CSAM detection |

### Discovery Protections

| Feature | Status | Description |
|---------|--------|-------------|
| Age-based discovery filtering | ⚠️ Planned | Users outside appropriate age range filtered |
| Adult content filtering | ⚠️ Planned | Content tiering by age |
| Safe search default | ⚠️ Planned | Strict filtering for younger users |

## 4. Age-Appropriate Design (UK Code) Readiness

| Requirement | Status | Evidence |
|-------------|--------|----------|
| **Best interests of the child** | Not assessed | Need child rights impact assessment |
| **Age-appropriate application** | Partial | Basic age gate, no content tiering |
| **Transparency** | Partial | Privacy notice needed for data practices |
| **Detrimental use** | Not assessed | Need assessment of potential harms |
| **Policies & community standards** | ✅ Published | Community guidelines planned |
| **Default settings** | Partial | High privacy defaults exist for all users |
| **Data minimization** | ✅ Implemented | Only essential data collected |
| **Data sharing** | ✅ Limited | No data sharing with third parties for marketing |
| **Geolocation** | ✅ Off by default | Location sharing is opt-in |
| **Parental controls** | Not implemented | Not currently supported |
| **Profiling** | ✅ Limited | No profiling for marketing |
| **Nudge techniques** | ✅ Not used | No dark patterns |
| **Connected toys** | N/A | Not applicable |
| **Online tools** | ⚠️ Partial | Reporting tools available, safety center planned |

## 5. COPPA Readiness (US)

| Requirement | Status | Gap |
|-------------|--------|-----|
| **Age screening** | Self-reported DOB only | No verifiable parental consent mechanism |
| **Privacy notice for children** | Not published | Need child-specific privacy notice |
| **Parental consent** | Not implemented | Need COPPA-compliant consent mechanism |
| **Parental rights** | Not implemented | Need parent access to child's data |
| **Data collection limits** | ✅ Minimal collection | Need to verify no unnecessary collection |
| **Retention limits** | ✅ Standard policy | May need stricter retention for children |

**Current stance**: The platform does not intentionally collect data from children under 13. Self-reported age below 13 should result in account denial. No verifiable parental consent mechanism exists — this is a gap for COPPA compliance if users under 13 access the platform.

## 6. Dating Age Safety

### Minimum Age Enforcement

- **Dating features**: 18+ required (self-reported)
- **Age range matching**: Users cannot set age preferences that include minors
- **Profile age display**: Only displayed as "X years old", never exact date of birth
- **Age verification**: Follow-up verification for flagged accounts

### Cross-Age Interaction Prevention

- Users 18-20 can only match with users 18-25 (default range)
- Age range filters respect legal minimums
- Suspicious age-mismatch patterns flagged for review

## 7. Advertising & Monetization Age Safety

| Feature | Age Restriction | Implementation |
|---------|----------------|---------------|
| Ad targeting | No age-based targeting for under 18 | Age data not used for ad targeting |
| Premium purchases | 18+ recommended | No specific enforcement |
| Creator monetization | 18+ required | Self-reported during application |
| Gifts | 18+ recommended | No specific enforcement |

## 8. Content Moderation for Child Safety

### Prohibited Content (Zero Tolerance)

- Child sexual abuse material (CSAM) — automated detection + immediate report to authorities
- Grooming behavior — behavioral detection + moderation intervention
- Inappropriate contact attempts — pattern detection + safety warnings
- Self-harm content — detection + resource provision

### Reporting Obligations

| Jurisdiction | Requirement | Status |
|-------------|-------------|--------|
| US (NCMEC) | Report CSAM to CyberTipline | ⚠️ Need procedure |
| EU | Report to national authorities | ⚠️ Need procedure |
| UK (IWF) | Report to IWF | ⚠️ Need procedure |

## 9. Recommended Actions

### Pre-Launch (HIGH Priority)

1. **Age gate at registration**: Minimum age 13 for platform, 18 for dating
2. **Content tiering**: Basic age-based content filtering
3. **Safety center**: Published safety resources
4. **CSAM reporting procedure**: Documented reporting process

### Post-Launch (MEDIUM Priority)

1. **Photo age estimation**: AI-assisted age verification
2. **Enhanced verification**: For dating and monetization
3. **Parental controls**: Basic parental access tools
4. **Age-appropriate design audit**: Full UK Code assessment

### Backlog (LOW Priority)

1. ID document verification for high-value accounts
2. Third-party age verification service integration
3. Cross-platform child safety data sharing

## 10. Related Documentation

- `docs/dating-safety.md` — Dating-specific safety controls
- `docs/trust-and-safety.md` — Trust & Safety system overview
- `docs/anti-scam.md` — Anti-scam detection system
- `docs/moderation.md` — Content moderation pipeline
- `docs/privacy.md` — Data privacy controls
