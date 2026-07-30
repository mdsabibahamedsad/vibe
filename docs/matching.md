# Vibe — Mutual Matching System

## Overview

The Mutual Matching System detects when two users express mutual positive interest and atomically creates a match. It integrates with the dating discovery engine and notification systems.

---

## 1. Mutual Like Logic

### Flow

```
User A likes User B:
  1. Authenticate A
  2. Validate B (exists, active, not banned, not blocked)
  3. Save dating action: A → like → B (upsert)
  4. Check if B has also liked/super_liked A
  5. If reciprocal → atomically create match
  6. Create bidirectional notifications
  7. Return match result

User B likes User A:
  (Same flow — second request detects the existing reciprocal action)
```

### Positive Actions

For matching purposes, the following actions count as positive interest:

| Action | Positive? | Can create match? |
|--------|-----------|-------------------|
| `like` | ✅ Yes | ✅ With reciprocal like/super_like |
| `super_like` | ✅ Yes | ✅ With reciprocal like/super_like |
| `pass` | ❌ No | ❌ Never |

### Formula

```
isPositiveDatingAction(action) = action IN ('like', 'super_like')
```

---

## 2. Match Data Model

### matches table (extended)

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `user_a_id` | uuid FK | Lower UUID (canonical) |
| `user_b_id` | uuid FK | Higher UUID (canonical) |
| `status` | enum | `active`, `unmatched`, `blocked` |
| `matched_at` | timestamptz | When the match was first created |
| `unmatched_at` | timestamptz | When the match was ended |
| `unmatched_by` | uuid FK | Who initiated the unmatch |
| `last_activity_at` | timestamptz | Last interaction (for ordering) |
| `last_read_at_user_a` | timestamptz | Read state for user A |
| `last_read_at_user_b` | timestamptz | Read state for user B |
| `created_at` | timestamptz | Row creation |
| `updated_at` | timestamptz | Row update |

### Constraints

- `CHECK (user_a_id < user_b_id)` — canonical ordering
- `UNIQUE (user_a_id, user_b_id)` — prevents duplicate match pairs
- `CHECK (user_a_id != user_b_id)` — prevents self-match

---

## 3. Canonical Pair Strategy

User pairs are always stored with the smaller UUID as `user_a_id` and the larger UUID as `user_b_id`:

```sql
user_a_id = LEAST(actor_id, target_id)
user_b_id = GREATEST(actor_id, target_id)
```

This prevents:
- Duplicate match records (A-B and B-A)
- Conflicting read states
- Ambiguous match lookups

---

## 4. Match Uniqueness

The `UNIQUE (user_a_id, user_b_id)` constraint at the database level ensures exactly one match record per user pair. The `process_dating_action()` function uses `INSERT ... ON CONFLICT ... DO UPDATE` to safely handle:
- First-time match creation
- Match reactivation (unmatched → active)
- Idempotent re-processing

---

## 5. Atomic Transaction / RPC

The critical match creation is handled by the `process_dating_action()` database function:

```sql
process_dating_action(p_actor_id, p_target_id, p_action) RETURNS jsonb
```

This function is:
- **Atomic** — runs in a single database transaction
- **Security definer** — elevated privileges for match/notification creation
- **Idempotent** — ON CONFLICT handling prevents duplicates
- **Deterministic** — same inputs always produce same result

### What it does atomically:

1. Upserts the dating action (INSERT ... ON CONFLICT)
2. Checks for reciprocal positive action
3. Creates/activates match if reciprocal exists (INSERT ... ON CONFLICT)
4. Creates bidirectional match notifications
5. Returns structured JSON result

### Race Condition Protection

If A likes B and B likes A at the exact same time:

- Request A saves action, checks reciprocal, doesn't find it (B's action not yet saved), returns no match
- Request B saves action, checks reciprocal, finds A's action, creates match atomically
- Result: Exactly 1 match created, exactly 2 notifications (one for each user)

Or:
- Request A saves action, checks reciprocal, finds B's action (if B was faster)
- Creates match, returns match found

Either way: **exactly 1 match**.

---

## 6. Match Lifecycle

```
        ┌──────────┐
        │  ACTIVE  │ ◄──── Initial state on mutual like
        └────┬─────┘
             │
    ┌────────┼────────┐
    │        │        │
    ▼        ▼        ▼
 Unmatch   Block    (future: rematch)
    │        │
    ▼        ▼
 Unmatched (hidden from match list)
```

### States

| State | Meaning | Visible in match list? |
|-------|---------|------------------------|
| `active` | Mutual match active | ✅ Yes |
| `unmatched` | One user ended the match | ❌ No |
| `blocked` | One user blocked the other | ❌ No |

### Rematching

For V1, unmatched pairs cannot automatically recreate a match. A new mutual like sequence would be required, but the system's upsert behavior reactivates unmatched matches if a new reciprocal action occurs.

---

## 7. Match List

### Endpoint: GET /api/matches

Returns active matches ordered by `last_activity_at DESC`, with cursor pagination.

### Response format

```json
{
  "items": [
    {
      "matchId": "uuid",
      "user": {
        "id": "uuid",
        "displayName": "Sarah",
        "age": 24,
        "avatarUrl": null,
        "city": "New York"
      },
      "createdAt": "2024-01-15T10:00:00Z",
      "matchedAt": "2024-01-15T10:00:00Z",
      "lastActivityAt": "2024-01-15T10:00:00Z",
      "unread": true,
      "status": "active"
    }
  ],
  "nextCursor": "2024-01-15T10:00:00Z_uuid",
  "hasMore": false
}
```

### Privacy

Only returns: display name, age (calculated), city, avatar
Never returns: DOB, coordinates, preferences, moderation data

---

## 8. Read State

A match has two read timestamps — one per participant:

```sql
last_read_at_user_a  -- Set when user A views the match
last_read_at_user_b  -- Set when user B views the match
```

A match is considered **unread** for a user if:

```text
last_read_at_user < last_activity_at
```

### Mark as Read

`POST /api/matches/:id/read` — sets the current user's read timestamp to now.

---

## 9. Notifications

### Match Created Notification

When a match is created, the `process_dating_action()` function creates two notification records:

| Field | Actor's Notification | Target's Notification |
|-------|---------------------|----------------------|
| `recipient_id` | Actor | Target |
| `type` | `new_match` | `new_match` |
| `actor_id` | Target | Actor |
| `entity_type` | `match` | `match` |
| `entity_id` | Match UUID | Match UUID |
| `title` | "New Match! 🎉" | "New Match! 🎉" |
| `body` | "You matched!" | "You matched!" |

### Notification Table Structure

The existing `notifications` table from migration 010 is reused:
- `recipient_id` — who gets the notification
- `type` — `notification_type` enum (includes `new_match`)
- `actor_id` — who triggered it
- `entity_type` — `match`, `post`, etc.
- `entity_id` — UUID of the referenced entity
- `title`, `body` — display text
- `is_read`, `read_at` — read state
- `created_at` — timestamp

---

## 10. Unmatch Behavior

### Endpoint: POST /api/matches/:id/unmatch

**Requirements:**
- Authenticated user must be a match participant
- Match must be `active`
- Only the participant can unmatch

**Effects:**
- Status → `unmatched`
- `unmatched_at` → now
- `unmatched_by` → user who initiated
- Match hidden from active match list
- Future access denied

**V1 Rule:** Unmatched pairs cannot automatically recreate a match. The `process_dating_action` function does reactivate unmatched matches if a new reciprocal action occurs (ON CONFLICT DO UPDATE SET status = 'active').

---

## 11. Block Behavior

If either user blocks the other after matching:
- The match is filtered out of the active match list via RLS
- The `can_access_match()` function returns false
- The match is not deleted (preserved for moderation/analytics)
- Future discovery excludes the blocked user

---

## 12. Report Behavior

A user can report their match using the existing reports system:
- `POST /api/reports` with `reportedUserId` and reason
- Report categories: spam, harassment, nudity, hate_speech, violence, impersonation, copyright, other
- Moderation decisions not exposed to users

---

## 13. Deep Links

### Match Deep Link

```
startapp=match_<MATCH_ID>
```

### Notification Deep Link

Match notifications contain:
```json
"entity_type": "match",
"entity_id": "<match_id>"
```

Navigation target: `/matches/<matchId>`

All access is verified server-side via `canAccessMatch()`.

---

## 14. RLS

### matches

- **Select:** User must be a participant (`user_a_id = auth.uid()` OR `user_b_id = auth.uid()`) AND match is active AND neither user blocked the other
- **Update:** User can only update matches they participate in (read state, etc.)
- **Insert/Delete:** Handled by security-definer `process_dating_action()` function

### notifications

- **Select:** `recipient_id = auth.uid()`
- **Update:** Only read state (`is_read`, `read_at`)
- **Insert:** Created by security-definer `process_dating_action()` function

---

## 15. Race-Condition Handling

**Scenario:** A likes B and B likes A simultaneously.

**Protection strategy:**
1. Database-level `UNIQUE (actor_id, target_id)` on dating_actions prevents duplicate actions
2. `INSERT ... ON CONFLICT` on matches prevents duplicate match creation
3. The `process_dating_action()` function checks for the reciprocal action AFTER saving the current action
4. Both requests complete successfully — at most one match is created

**Result:** Exactly 1 active match, exactly 2 notifications (one per user), no database errors.

---

## 16. Analytics Events

| Event | Trigger |
|-------|---------|
| `match_created` | New match created |
| `match_screen_opened` | User opens match screen |
| `match_marked_read` | User marks match as read |
| `match_unmatched` | User unmatches |
| `match_reported` | User reports match |
| `match_blocked` | User blocks match partner (indirect) |

---

## 17. API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/discovery/action` | Like/pass/super_like with match detection |
| GET | `/api/matches` | List active matches (paginated) |
| GET | `/api/matches/:id` | Get single match |
| POST | `/api/matches/:id/read` | Mark match as read |
| POST | `/api/matches/:id/unmatch` | Unmatch |

---

## 18. Performance

### Indexes

| Index | Purpose |
|-------|---------|
| `matches_active_user_a_idx` | Active matches for user A, ordered by activity |
| `matches_active_user_b_idx` | Active matches for user B, ordered by activity |
| `matches_participants_idx` | Fast match lookup by participant pair |
| `dating_actions_reciprocal_idx` | Fast reciprocal action detection |
| `notifications_match_unread_idx` | Unread match notifications |

### Optimizations

- Batch enrichment: user info and profiles fetched in single queries
- Block checks: batched per match list page
- No N+1 queries for the match list
- Cursor pagination prevents loading all matches

---

## 19. File Structure

```
src/
  features/
    matching/
      services/
        match.service.ts        — Core matching service
      components/
        MatchCard.tsx            — Match list card
        MatchCelebration.tsx     — Match success celebration
      hooks/
        useMatches.ts            — Match list data hook
  app/
    api/
      discovery/
        action/
          route.ts               — Updated with match detection
      matches/
        route.ts                 — GET (list matches)
        [id]/
          route.ts               — GET (single match)
          read/
            route.ts             — POST (mark read)
          unmatch/
            route.ts             — POST (unmatch)
    matches/
      page.tsx                   — Updated match screen
supabase/
  migrations/
    022_matching_system.sql      — Read states, RPC function, RLS, indexes
docs/
  matching.md                    — This document
```
