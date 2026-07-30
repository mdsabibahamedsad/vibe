# Dating Safety

## Consent-First Design

Vibe's dating features are designed around mutual consent:

- **No forced messaging** — Users cannot message non-matched users without permission
- **No forced matches** — Matches require mutual likes (both users must express interest)
- **No auto-sending messages** — Messages are only sent intentionally by users
- **No repeated contact after rejection** — Block and unmatch are respected server-side
- **Discovery exclusion** — Rejected/blocked users are not re-surfaced

## Match Quality

Matching uses the following signals:
- **Shared interests** — Number of overlapping interests
- **Explicit preferences** — Age range, gender, distance, dating intent
- **Activity compatibility** — Recency of activity, engagement levels
- **Profile quality** — Completion percentage, photos, verified status
- **Mutual signals** — Both users must express interest

### Prohibited Ranking Signals
The ranking system NEVER uses:
- Race, ethnicity, or national origin
- Religion or religious beliefs
- Disability status
- Genetic information
- Any other protected characteristics under applicable law

## Healthy Discovery

The discovery engine ensures:
- **Fresh profiles** — Recently active users are prioritized
- **Relevant profiles** — Matched against explicit preferences
- **Diverse profiles** — Variety in results (not the same profiles repeatedly)
- **Appropriate profiles** — Blocked/banned/inactive users excluded server-side
- **Variety** — Cursor-based pagination avoids infinite loops

## Age Safety

Server-side enforcement of dating eligibility:
- Minimum dating age: 18 (configurable via `MIN_DATING_AGE`)
- Birth dates validated server-side, not just on the client
- `dating_eligibility` table tracks eligibility status
- No adult-to-minor discovery or matching

## Location Privacy

- **Precise location NEVER shared** — Only approximate distance shown
- **Configurable precision** — Users can choose: exact, approximate, city, region, or disabled
- **RLS protected** — Location data has strict Row-Level Security policies
- **Minimal retention** — Location history not stored
- **Server-side authorization** — Access checks enforced server-side

## Safety Features

- **Block system** — Hide profile, prevent messaging, prevent discovery
- **Report system** — Report harassment, spam, scam, impersonation, fake profiles
- **Safety warnings** — Contextual reminders in high-risk conversations
- **Message requests** — Configurable who can message you
- **Safe limits** — Rate limiting for new/unverified accounts

## Security

- All enforcement is server-authoritative
- Frontend checks are UX-only conveniences
- RLS policies protect all sensitive data
- Audit logging for all moderation actions
