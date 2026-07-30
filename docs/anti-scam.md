# Anti-Scam System

## Overview

The anti-scam system uses behavioral pattern recognition to detect and flag suspicious activity. All detections generate **safety signals** for review — the system never automatically bans or restricts users based solely on AI predictions.

Human review remains available for all enforcement decisions.

## Detection Categories

### Romance Scam Detection

Detects patterns commonly associated with romance scams:

| Signal | Weight | Description |
|--------|--------|-------------|
| Rapid emotional escalation | +15 | "Soulmate," "love at first sight," declarations shortly after first contact |
| Off-platform requests | +15 | Asking to move to WhatsApp, Telegram, Signal, etc. |
| Financial requests | +15 | Requests for money, funds, payment |
| Investment/crypto | +15 | Bitcoin, crypto, guaranteed returns |
| Gift pressure | +15 | Gift cards, digital gifts |
| Financial emergencies | +15 | Hospital, medical bills, accidents requiring money |
| Copy-paste messages | +15 | Identical messages sent to multiple users |

### Financial Scam Protection

| Signal | Weight | Description |
|--------|--------|-------------|
| Investment promises | +20 | Guaranteed returns, no-risk investments |
| Fake giveaways | +20 | "You won!", "Selected winner" |
| Loan scams | +20 | Advance fee, no credit check |
| Phishing | +20 | Account verification, login links |
| Account recovery | +20 | Password requests, recovery codes |

### Impersonation Detection

| Signal | Weight | Description |
|--------|--------|-------------|
| Official claims | +20 | "I'm admin/support/moderator" |
| Verified badge claims | +20 | "Verified" combined with suspicious requests |
| Executive claims | +20 | "I'm the CEO/founder/owner" |

### Link Safety

**analyzeLinkSafety()** checks:
- Known-safe domain allowlist (Telegram, YouTube, Instagram, etc.)
- Suspicious TLDs (.tk, .ml, .ga, .xyz, .top, etc.)
- IP addresses used instead of domain names
- Excessive subdomain nesting (phishing indicator)
- Phishing keywords in URL (login, verify, secure, etc.)
- Unusual ports
- URL shorteners (bit.ly, tinyurl.com, etc.)

**SSRF Protection:** URLs are never fetched from privileged internal networks.

## Contextual Risk Signals

Additional risk factors that increase the detection score:

- **New account** (<7 days) + financial signals: +15
- **First message** + high-risk patterns: +10
- **New match** (<1 day) + suspicious patterns: +10
- **Unverified user** + suspicious patterns: +5

## Scoring & Severity

| Score Range | Severity | Action |
|-------------|----------|--------|
| 0-29 | None | No action |
| 30-49 | Medium | Record signal, log for review |
| 50-69 | High | Record signal, flag for priority review |
| 70+ | Critical | Record signal, create escalation |

## Signal Recording

All suspicious detections create a `safety_signals` record with:
- User ID, signal type, source, confidence, severity
- Metadata (message preview, signal count, category)
- Auto-expires after 90 days

Signals contribute to the trust profile recalculation, which affects:
- Recommendation visibility (low trust = reduced exposure)
- Message rate limits
- Verification status

## Limitations

1. **Pattern-based, not ML** — Rule-based detection can produce false positives
2. **No image analysis** — Duplicate profile detection is text-only (bio comparisons)
3. **No conversation graph analysis** — Checks individual messages, not conversation patterns
4. **No real-time threat intelligence** — Domain lists are static
5. **No semantic similarity** — Bulk detection checks exact text matches only

## Privacy

- Detection logic is NEVER revealed to users
- Safety warnings use educational language, not accusations
- Signal metadata is admin-only
- Signal data auto-expires after 90 days
