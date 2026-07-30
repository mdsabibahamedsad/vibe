# Vibe — Dating Discovery Engine

## Overview

The Dating Discovery Engine provides candidate discovery, filtering, ranking, and swipe actions for the dating product. It is strictly server-side enforced — the frontend never implements eligibility rules by itself.

---

## 1. Architecture

```
Client (Discovery UI)
    │
    ▼
GET /api/discovery  ──▶  discovery.service.ts
                              │
                              ├── checkUserEligibility()
                              ├── queryCandidates()
                              │     ├── Age/gender/intent filtering
                              │     ├── Block/excluded filtering
                              │     ├── Distance calculation
                              │     └── Rank/score computation
                              └── enrichCandidates()
                                    ├── Photos (batch)
                                    ├── Interests (batch)
                                    └── User info (batch)

POST /api/discovery/action  ──▶  dating-action.service.ts
                                    ├── likeCandidate()
                                    ├── passCandidate()
                                    └── superLikeCandidate()
                                          └── Rate limiting
```

### Separation of Concerns

| Layer | Responsibility | Location |
|-------|---------------|----------|
| **Eligibility** | Who is allowed to discover/be discovered | `discovery.service.ts` |
| **Filtering** | Age, gender, intent, distance, blocks | `discovery.service.ts` |
| **Ranking** | Score computation and sorting | `discovery.service.ts` |
| **Actions** | Like/pass/super_like with rate limiting | `dating-action.service.ts` |
| **Presentation** | Mobile-first UI with swipe/buttons | `features/dating/components/` |

---

## 2. Candidate Eligibility

### Current User Must Be

- **18+** (DOB verified server-side)
- **Active account** (`is_active = true`)
- **Not banned** (`is_banned = false`)
- **Profile complete** (has display name, DOB, gender, intent, at least 1 photo, completion ≥ 50%)
- **Discovery enabled** (`profile_preferences.discovery_enabled = true`)

### Candidate Must Be

- **Not the current user**
- **18+** (DOB verified server-side)
- **Active & not banned**
- **Profile public** (`profile_visibility = 'public'`)
- **Discoverable** (`show_in_discovery = true` or absent)
- **Profile complete** (has gender, intent, DOB, completion ≥ 50%, at least 1 photo)
- **Not blocked** by current user (mutual)
- **Not previously acted on** (passed/liked/super_liked)
- **Within gender preference** (if set)
- **Within age range** (user's min_age to max_age)
- **Intent compatible** (via compatibility matrix)
- **Within max distance** (if location available and filtering enabled)

### Ineligibility Reasons

| Reason | Meaning |
|--------|---------|
| `PROFILE_INCOMPLETE` | Missing required profile fields |
| `UNDERAGE` | User is under 18 |
| `DISCOVERY_DISABLED` | Discovery toggle is off |
| `ACCOUNT_RESTRICTED` | Banned or inactive account |

---

## 3. Age Filtering

- Source of truth: `profiles.date_of_birth` (protected, never exposed)
- Age calculated server-side using `calculateAge()`
- Boundary dates computed: `today - maxAge` to `today - minAge`
- Signed date comparison: `date_of_birth >= minBirthDate AND date_of_birth <= maxBirthDate`
- Minimum age: **18** (enforced at database and application level)
- Invalid ranges rejected server-side

---

## 4. Gender Filtering

- Uses `profiles.gender` enum and `profile_preferences.preferred_genders` array
- If preferred_genders is empty or not set: **all genders shown** (inclusive default)
- If preferred_genders has values: candidates must match any selected gender
- Respects all gender enum values: `male`, `female`, `non_binary`, `prefer_not_to_say`

---

## 5. Intent Compatibility

### Compatibility Matrix

Current User \ Candidate | dating | friendship | chat | relationship | not_sure
---|---|---|---|---|---
**dating** | ✅ | ❌ | ❌ | ✅ | ✅
**friendship** | ❌ | ✅ | ✅ | ❌ | ✅
**chat** | ❌ | ✅ | ✅ | ❌ | ✅
**relationship** | ❌ | ❌ | ❌ | ✅ | ✅
**not_sure** | ✅ | ✅ | ✅ | ✅ | ✅

### Implementation

```typescript
isIntentCompatible(currentUserIntent, candidateIntent): boolean
```

This function is:
- **Deterministic**: same inputs always produce same output
- **Testable**: pure function with no side effects
- **Documented**: matrix above
- **Isolated**: separate from UI and database

The database function `public.is_intent_compatible()` mirrors this logic.

---

## 6. Distance Filtering

### Calculation

- Server-side Haversine formula (in km)
- Uses `profiles.latitude` and `profiles.longitude` (both RLS-protected)
- Also available as `public.haversine_distance()` database function

### Privacy

- **Never exposed**: exact latitude, longitude, address, location history
- **Exposed in API**: `distanceKm` (rounded to 1 decimal) and `city`

### Behavior

- If user has no location: candidate is **excluded** when distance filter is active
- If candidate has no location: candidate is **excluded** when distance filter is active
- If distance filter disabled (max_distance_km = 0): candidates with or without location are included (distance returned as null)

---

## 7. Block Filtering

- Uses existing `blocks` table (bidirectional check)
- **UNABLE to see each other's profiles if either user blocked the other**
- Applied server-side — never relies on UI hiding
- Reuses `user_is_blocked()` database function

---

## 8. Dating Action State

### Actions

| Action | Effect | Excluded from future discovery? |
|--------|--------|----------------------------------|
| `like` | Signals interest | ✅ (until match resolution) |
| `pass` | Skip candidate | ✅ |
| `super_like` | Strong interest signal | ✅ (until match resolution) |

### Uniqueness Strategy

- `UNIQUE(actor_id, target_id)` constraint on `dating_actions` table
- Upsert pattern: `INSERT ... ON CONFLICT (actor_id, target_id) DO UPDATE SET action = ...`
- A user can change their action (e.g., pass → like)
- No duplicate records for same actor+target pair

### Rate Limiting

| Action | Limit |
|--------|-------|
| Like | 100/hour |
| Pass | 200/hour |
| Super Like | 10/hour, 3/day (free tier) |

Rate limiters use the existing `RateLimiter` abstraction, supporting future distributed storage (Redis).

---

## 9. Ranking V1

### Formula

```
score =
    recency_score (25%)        ← How recently the user was active
  + interest_compatibility (25%) ← Shared interest count
  + intent_compatibility (15%) ← Partial if compatible, full if exact match
  + activity_score (15%)      ← General activity level
  + profile_quality (10%)     ← Bio, photos, verification, completion
  + distance_score (5%)       ← Nearer = slightly higher
  + social_affinity (5%)      ← Follow relationship
```

### Ranking Principles

- **Deterministic**: same inputs = same order (tiebreaker: user_id)
- **Explainable**: scores come from transparent signals
- **Fair**: no protected characteristics used
- **Configurable**: weights in `constants.ts`

### NOT Used in Ranking

- ❌ Race/ethnicity
- ❌ Religion
- ❌ Sexual orientation
- ❌ Health information
- ❌ Political affiliation
- ❌ Financial data

---

## 10. Interest Compatibility

- Shared interests calculated in batch during candidate enrichment
- Count used as ranking signal (0-25% of total score)
- Displayed as `"3 shared interests"` in the UI
- Efficient: batch-fetched in a single query, not N+1

---

## 11. Cursor Pagination

### Format

```
cursor = "<score>_<candidate_id>"
```

### Query Pattern

1. Fetch `limit + 1` candidates
2. Filter by `score < cursorScore OR (score = cursorScore AND id < cursorId)`
3. Sort by `score DESC, id DESC`
4. Return `limit` items + `hasMore` flag
5. `nextCursor` = score + "_" + id of last item

### Properties

- Consistent: no duplicates across pages
- Deterministic: tiebreaker on user_id
- Opaque: internal score format not exposed to client beyond cursor string

---

## 12. Performance Strategy

### Batch Operations

- **User info**: single batch query for all candidates on a page
- **Profile photos**: single batch query for all candidate photos
- **Interests**: batch-fetched via profile_interests join
- **Blocks**: pre-fetched as exclusion set
- **Previous actions**: pre-fetched as exclusion set

### Indexes

| Index | Purpose |
|-------|---------|
| `profiles_discovery_idx` | Discoverable profiles (gender, intent, completion) |
| `users_discovery_active_idx` | Active, non-banned users by last_seen |
| `dating_actions_actor_target_idx` | Existing action check |
| `profile_photos_discovery_idx` | Profile with at least one photo |

### Future Optimizations

- Precomputed candidate queues (Redis)
- Background candidate generation
- Materialized views for discovery
- PostGIS for geospatial queries at scale

---

## 13. API Endpoints

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| GET | `/api/discovery` | Get discovery candidates (paginated) | Yes |
| POST | `/api/discovery/action` | Like/pass/super_like | Yes |
| GET | `/api/discovery/filters` | Get current filter preferences | Yes |
| PUT | `/api/discovery/filters` | Update filter preferences | Yes |

### GET /api/discovery

**Query parameters:**
- `cursor` (optional): Pagination cursor
- `limit` (optional, default 20, max 50): Page size

**Success response:**
```json
{
  "eligible": true,
  "items": [
    {
      "id": "uuid",
      "displayName": "Sarah",
      "age": 24,
      "city": "New York",
      "distanceKm": 4.2,
      "bio": "Love music and travel...",
      "intent": "dating",
      "isVerified": false,
      "photos": [{ "id": "uuid", "mediaId": "uuid", "sortOrder": 0, "isPrimary": true }],
      "interests": [{ "id": "uuid", "name": "Music", "slug": "music", "category": null }],
      "compatibility": { "sharedInterests": 3, "intentMatch": true }
    }
  ],
  "nextCursor": "72.5_abc123",
  "hasMore": true
}
```

**Ineligible response:**
```json
{
  "eligible": false,
  "reason": "PROFILE_INCOMPLETE"
}
```

### POST /api/discovery/action

**Body:**
```json
{
  "targetUserId": "uuid",
  "action": "like" | "pass" | "super_like"
}
```

---

## 14. Analytics Events

| Event | Trigger |
|-------|---------|
| `discovery_opened` | User opens discovery page |
| `candidate_impression` | Candidates returned to user |
| `candidate_liked` | User likes a candidate |
| `candidate_passed` | User passes on a candidate |
| `candidate_super_liked` | User super likes a candidate |
| `filter_changed` | User updates discovery filters |
| `discovery_empty` | No candidates available |

---

## 15. Security

### Tested Protections

- ✅ User ID spoofing (session-derived userId only)
- ✅ Candidate ID spoofing (target validated server-side)
- ✅ Private profile data (DOB, coordinates never exposed)
- ✅ Blocked-user leakage (mutual block check)
- ✅ Underage access (server-side DOB calculation)
- ✅ Banned user exclusion
- ✅ Duplicate action prevention (unique constraint + upsert)
- ✅ Rate limiting (configurable per action type)
- ✅ Race condition handling (database constraints)

### Not Yet Implemented

- Distributed rate limiting (Redis)
- Abuse detection algorithms
- Report-based candidate reduction

---

## 16. Database Migrations Added

- `021_dating_discovery.sql` — Haversine function, intent compatibility function, discovery indexes, eligibility check function

---

## 17. File Structure

```
src/
  features/
    dating/
      components/
        Discovery.tsx           — Main discovery orchestrator
        CandidateCard.tsx       — Swipeable candidate card
        DiscoveryFilters.tsx    — Filter preferences sheet
      hooks/
        useDiscovery.ts         — Candidate fetching/pagination
        useDatingAction.ts      — Like/pass/super_like
        useDiscoveryFilters.ts  — Filter management
  lib/
    discovery/
      index.ts                  — Re-exports
      constants.ts              — Limits, weights, intent matrix
      schemas.ts                — Zod validation schemas
      discovery.service.ts      — Core discovery engine
      dating-action.service.ts  — Dating action operations
  app/
    api/
      discovery/
        route.ts                — GET (candidates)
        action/
          route.ts              — POST (like/pass/super_like)
        filters/
          route.ts              — GET/PUT (preferences)
    discover/
      page.tsx                  — Updated discovery page
docs/
  dating-discovery.md           — This document
supabase/
  migrations/
    021_dating_discovery.sql    — Discovery functions & indexes
```
