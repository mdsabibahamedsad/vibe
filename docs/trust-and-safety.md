# Trust & Safety System

## Architecture Overview

Vibe's Trust & Safety system is built on three layers:

1. **Prevention** — User education, consent-first design, privacy controls, message requests
2. **Detection** — AI-assisted analysis, behavioral pattern recognition, user reports, trust signals
3. **Enforcement** — Warnings, restrictions, suspension, banning, escalation, appeals

All safety enforcement is **server-authoritative**. Frontend checks are UX-only conveniences — every enforcement decision is validated and enforced server-side.

### Key Principles

- **No duplicate systems** — Reuse existing moderation, report, block, and notification infrastructure
- **Privacy by design** — Safety signals and internal trust scores are NEVER exposed to users
- **Progressive enforcement** — Start with warnings, escalate only when necessary
- **Human review** — AI recommends and flags; humans make enforcement decisions
- **Appeals** — Every enforcement action is appealable

---

## Trust Profiles

### Internal Trust Score

Each user has an internal trust profile stored in `trust_profiles`. The profile contains:

| Signal | Weight | Description |
|--------|--------|-------------|
| Account age | Up to +25 | Older accounts score higher |
| Verification | +20 | Verified/enhanced verification |
| Positive interactions | Up to +15 | Successful matches contribute |
| Reports received | Up to -30 | Multiple reports decrease trust |
| Active warnings | Up to -20 | Each active warning reduces trust |
| Active restrictions | Up to -30 | Restrictions decrease trust |
| Safety signals | Up to -25 | Suspicious signals decrease trust |
| Scam signals | Up to -30 | Scam-related signals heavily weighted |
| Past suspension | -15 | Account was suspended before |
| Past ban | -25 | Account was banned before |

### Trust Tiers

| Tier | Score Range | Meaning |
|------|-------------|---------|
| Trusted | 60+ | Verified, long-standing, positive history |
| High | 40-59 | Good standing, minimal issues |
| Medium | 20-39 | New or some signals |
| Low | 0-19 | Multiple signals or new account |
| Unknown | — | Not yet evaluated |

### User-Facing Indicators (safe to expose)

- **Verified Profile** — Identity verified via selfie
- **Verified Creator** — Creator identity verified
- **Established Account** — Account >365 days old
- **Recently Active** — Active in recent period
- **Trusted Member** — High trust tier (badge)

Internal trust tier is NEVER exposed.

---

## Dating Safety

### Consent-First Design

- No forced messaging or auto-sending messages
- No repeated contact after rejection or block
- Mutual match required for chat
- User controls who can message them

### Match Quality

Matching uses:
- Shared interests
- Explicit preferences (age, gender, distance, intent)
- Activity compatibility
- Mutual signals

Never ranks based on sensitive protected characteristics.

### Healthy Discovery

- Fresh profiles prioritized
- Relevant, diverse, appropriate profiles
- No endless loops of same recommendations
- Blocked users excluded server-side

### Age Safety

- Minimum dating age: 18 (configurable via `MIN_DATING_AGE`)
- Server-side age verification
- `dating_eligibility` table tracks eligibility status
- No adult-minor discovery or messaging
- Birth dates stored securely, never exposed publicly

### Location Privacy

- Precise location never shared with other users
- Uses approximate distance, region, or city-level precision
- Configurable location visibility settings
- RLS protects location data
- Minimal retention of location history

---

## Anti-Scam System

### Romance Scam Detection

Detects patterns:
- Rapid emotional escalation
- Requests to move off-platform
- Financial requests
- Investment/crypto solicitations
- Gift pressure
- Repeated financial emergencies
- Copy-pasted messages

### Financial Scam Protection

Detects:
- Investment promises / guaranteed returns
- Payment requests
- Fake giveaways
- Loan scams
- Phishing links
- Account-recovery scams

### Link Safety

- Domain reputation analysis
- Suspicious TLD detection
- Phishing keyword scanning
- URL shortener detection
- SSRF protection (never fetches from privileged networks)

### Behavioral Signals

- New account + financial request = elevated risk
- First message + scam patterns = elevated risk
- Very new match + patterns = elevated risk
- Unverified user + patterns = elevated risk

Signals generate `safety_signals` records and contribute to trust profile recalculation.

---

## Block & Report System

### Block Enforcement

When User A blocks User B:
- Profile hidden in discovery/social recommendations
- Messaging prevented (server-side)
- Interactions restricted (follow, comment, like)
- Story/content visibility enforced
- Notification leakage prevented
- Existing interactions cleaned up (follows removed, conversations muted)

Server-side enforcement via `block-enforcement.service.ts`.

### Report System

Report reasons (reusing existing):
- spam, harassment, nudity, hate_speech, violence
- impersonation, copyright, other, minor_safety
- self_harm, illegal_activity, privacy, scam

### Report Abuse Prevention

- Coordinate reporting detection (multiple reports from same IP/pattern)
- Repeated malicious reporting flagged
- False reporting penalized in trust profile
- Evidence-based moderation review

---

## Chat Safety

### Safety Warnings

Contextual warnings shown when high-risk patterns detected:
- 💰 Payment warnings — "Never send money..."
- 📈 Investment warnings — "Be cautious of investment offers..."
- 🔐 Password warnings — "Never share your password..."
- 👋 Off-platform warnings — "Stay on Vibe for safety..."
- 🎣 Phishing warnings — "Be careful with links..."

Warnings are educational, not accusatory. Internal detection logic is never revealed.

### Harassment Detection

Detects:
- Insults and abusive language
- Threats
- Repeated unwanted messages
- Message flooding
- Targeted harassment

Progressive controls:
1. Warning
2. Rate limiting
3. Temporary messaging restriction
4. Moderation review

### Message Requests

Configurable intake:
- Everyone
- Followers only
- Matches only
- Nobody

Respects existing block settings.

### Safe Message Limits

- New accounts (<24h): 20 messages/hour, 5 conversations/day
- Normal accounts: 100 messages/hour, 50 conversations/day
- Bulk identical message detection (5+ copies in 10min window)

---

## AI Safety Layer

### AI-Assisted Detection

AI assists with:
- Scam classification
- Spam detection
- Harassment detection
- Duplicate profile detection
- Impersonation signals
- Report prioritization

### Model Safety

AI systems are prevented from:
- Making unsupported accusations
- Exposing private information
- Auto-banning on uncertain predictions
- Using sensitive protected attributes
- Revealing internal safety rules

AI recommends and flags. Human review handles enforcement.

---

## Escalation

### Escalation Categories

- Severe harassment
- Credible threats
- Financial fraud
- Account takeover
- Impersonation
- Child safety concerns
- Coordinated abuse
- Romance scam
- Extreme spam
- Other critical

### Escalation Workflow

1. Signal detected (AI, user report, or auto-detector)
2. Safety signal recorded
3. If critical → escalation created
4. Admin reviews escalation
5. Appropriate enforcement action
6. User notified (if policy permits)
7. User can appeal

---

## Appeals

- Reuses existing appeal system
- User can appeal: restrictions, verification decisions, messaging limits, content removals, monetization restrictions
- 24-hour cooldown between appeals for same action
- Auditable history maintained

---

## Safety Notifications

Users are notified about:
- Safety warnings — contextual reminders in risky conversations
- Report outcomes (where policy permits)
- Account security events
- Suspicious login attempts
- Safety restrictions
- Verification changes

Confidential moderation information is never revealed in notifications.

---

## Analytics & Metrics

### Safety Metrics (Aggregate, Not Individual)

- Scam reports (daily)
- Harassment reports (daily)
- Fake-profile rate (daily)
- Block rate (daily)
- Report resolution time (average hours)
- Appeal outcomes (approval rate)
- Safety-warning effectiveness (dismissal rate)
- False-positive rate (AI)

### Admin Safety Dashboard

Available at `/admin/safety`:

- Overview cards (open escalations, pending reports, signals)
- Quick links to reports, appeals, escalations
- Recent escalation queue
- Trend charts (30-day safety metrics)

---

## File Map

### Services
- `src/lib/safety/trust-profile.service.ts` — Internal trust profile management
- `src/lib/safety/anti-scam.service.ts` — Scam, impersonation, link safety detection
- `src/lib/safety/block-enforcement.service.ts` — Block enforcement
- `src/lib/safety/chat-safety.service.ts` — Safety warnings, harassment, message limits

### API Routes
- `GET/PATCH /api/safety/warnings` — User safety warnings
- `GET/PUT /api/safety/message-requests` — Message request settings
- `GET/POST/PATCH /api/admin/safety/dashboard` — Admin dashboard data
- `GET/POST/PATCH /api/admin/safety/escalations` — Escalation management

### Frontend
- `src/features/safety/components/SafetyCenter.tsx` — User safety education
- `src/app/safety/page.tsx` — Safety Center route
- `src/app/admin/safety/page.tsx` — Admin safety dashboard

### Database
- `supabase/migrations/033_trust_safety.sql` — Trust profiles, safety signals, escalations, metrics

---

## Known Limitations

1. **AI classification** uses rule-based pattern matching rather than ML model — can produce false positives
2. **Duplicate profile detection** is bio-comparison only (not image-based)
3. **Link safety** uses static domain lists rather than real-time threat intelligence APIs
4. **Romance scam detection** is content-based only (no conversation graph analysis)
5. **Bulk message detection** checks identical text only (not semantic similarity)
6. **Report abuse detection** lacks sophisticated network analysis for coordinated attacks

These limitations are acceptable for v1 and can be addressed in subsequent iterations.

---

## Legal & Policy Assumptions

1. **Age verification** relies primarily on self-declaration with optional document verification
2. **Location data** is approximate only — no GPS tracking or precise coordinate storage
3. **Content moderation** follows a notice-and-action framework
4. **Appeals** are reviewed by human moderators with discretion
5. **Safety warnings** are educational and do not constitute legal advice
6. **Emergency guidance** directs users to local emergency services rather than providing direct intervention
7. **Data retention** for safety signals is 90 days (configurable)

These policies should be reviewed by legal counsel before production deployment.
