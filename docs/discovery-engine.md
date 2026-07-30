# Search + Discovery Engine

## Overview

The Search + Discovery Engine provides a unified system for finding and discovering users on Vibe. It supports two modes:

- **Social Discovery** — Find interesting people, creators, users with shared interests, nearby users
- **Dating Discovery** — Compatibility-based candidate discovery with age/gender/intent/distance filters

Both modes share the same architecture: eligibility filtering → candidate retrieval → ranking → pagination → hydration.

---

## 1. Architecture

```
Frontend (Search page / Discover page)
    ↓
GET /api/discovery?mode=social|dating&query=...&filters=...
    ↓
discoverProfiles() / getDiscoveryCandidates()
    ↓
Eligibility Check → Exclusion Sets → Query → Rank → Paginate → Hydrate
    ↓
PostgreSQL (profiles, users, interests, blocks, dating_actions)
```

---

## 2. Social Discovery Mode

### Search Features

| Feature | Implementation |
|---------|---------------|
| Text search | PostgreSQL full-text `tsvector` with GIN index |
| Name/username search | `ILIKE` fallback for partial matches |
| Interest filter | `profile_interests` join with configurable match mode |
| Distance filter | Haversine calculation with configurable radius |
| Sort modes | `recommended` (ranking), `nearby` (distance), `recent` (activity) |

### Searchable Fields

| Field | Weight | Notes |
|-------|--------|-------|
| `display_name` | A (highest) | From `users` table |
| `telegram_username` | B | From `users` table |
| `bio` | C (lowest) | From `profiles` table |

### Eligibility Rules (Social)

1. Profile must be visible (`profile_visibility = 'public'`)
2. User must be active and not banned
3. Profile must have minimum 30% completion
4. Must have date of birth set
5. Excluded: blocked users (mutual), self, banned users

---

## 3. Dating Discovery Mode

Uses the existing dating discovery pipeline from Prompt 07 with:

- Age/gender/intent filtering from user preferences
- Mutual intent compatibility check
- Distance filtering
- Previously swiped users excluded
- Blocked users excluded
- Profile quality minimum

---

## 4. Ranking

### Social Discovery Ranking (RPC-based)

```
Score = Interest Similarity × 40% + Activity × 30% + Profile Quality × 15%
        + Distance Bonus × 10% + Verified Bonus × 5%
```

### Dating Discovery Ranking (Service-based)

```
Score = Interest Compatibility × 0.25 + Intent Compatibility × 0.15
        + Profile Quality × 0.10 + Distance × 0.05
        + Recency × 0.25 + Activity × 0.15 + Social Affinity × 0.05
```

---

## 5. Database Migrations

### Migration 026 — Search + Discovery Engine

**Additions:**
- `profiles.search_vector` — `tsvector` column for full-text search
- GIN index on `search_vector` for fast full-text queries
- `update_profile_search_vector()` — Trigger to keep search vector in sync
- `update_user_search_vectors()` — Trigger when user name/username changes
- `discover_profiles()` — Unified RPC function for both social + dating modes
- `profile_interests_discovery_idx` — Composite index for interest-based discovery

### Triggers

| Trigger | Table | Event | Action |
|---------|-------|-------|--------|
| `trg_profiles_search_vector` | `profiles` | INSERT or UPDATE of `bio`, `user_id` | Rebuild `search_vector` |
| `trg_users_search_vector` | `users` | UPDATE of `display_name`, `telegram_username` | Rebuild `search_vector` for linked profile |

### Key Indexes

| Index | Table | Purpose |
|-------|-------|---------|
| `profiles_search_vector_idx` GIN | `profiles` | Full-text search |
| `profiles_discovery_idx` | `profiles` | Composite gender/intent/completion |
| `users_discovery_active_idx` | `users` | Active active/banned users |
| `profile_interests_discovery_idx` | `profile_interests` | Interest discovery queries |
| `users_active_search_idx` | `users` | Active user filter |

---

## 6. API

### `GET /api/discovery`

Unified discovery endpoint supporting both modes.

**Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `social` / `dating` | `social` | Discovery mode |
| `query` | string | — | Search text (min 2 chars) |
| `sort` | `recommended` / `nearby` / `recent` | `recommended` | Result ordering |
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 20 | Page size (max 50) |
| `maxDistance` | number | — | Distance filter (km) |
| `interests` | string | — | Comma-separated interest IDs |

**Response (Social):**
```json
{
  "items": [
    {
      "id": "uuid",
      "displayName": "Alex",
      "username": "alex_j",
      "bio": "Photography enthusiast",
      "avatarUrl": "media-uuid",
      "age": 24,
      "city": "Dhaka",
      "distanceKm": 4.2,
      "sharedInterests": 3,
      "isVerified": false
    }
  ],
  "nextCursor": "score_id",
  "hasMore": true
}
```

**Response (Dating):**
```json
{
  "eligible": true,
  "items": [...],
  "nextCursor": "...",
  "hasMore": true
}
```

---

## 7. Frontend Components

### SearchBar
- Debounced search input (300ms)
- Search icon + clear button
- 100 char max length

### DiscoveryCard
- Reusable card for both social and dating modes
- Shows avatar, name, age, distance, bio, interests
- Action buttons: Follow (social) / Like+Pass (dating)

### SocialFilters
- Sort toggle (recommended/nearby/recent)
- Distance radius selector
- Interest category picker with chips
- Active filter badge count
- Clear all button

### DiscoveryResultList
- Infinite scroll via IntersectionObserver
- Loading skeletons (3 cards)
- Empty states (no query / no results)
- Error state with retry

---

## 8. Security

### Search Security
- Parameterized queries (no SQL injection)
- Server-side query validation
- Query length limits (2-100 chars)
- Rate limiting via existing infrastructure

### Profile Privacy
- Only public profiles returned
- Blocked users excluded (mutual)
- Banned/inactive users excluded
- Exact coordinates never exposed
- Distance rounded to 1 decimal

### Anti-Scraping
- Cursor pagination (no sequential page enumeration)
- Server-side eligibility enforcement (not client-side)
- Rate limiting on search requests

---

## 9. Frontend Hook: `useDiscoverySearch`

```typescript
const {
  query,          // Current search query
  setQuery,       // Set search query
  filters,        // Current filter state
  setFilters,     // Update filters
  results,        // SearchProfileResult[]
  loading,        // Initial load
  loadingMore,    // Pagination load
  error,          // Error message
  hasMore,        // More results available
  loadMore,       // Load next page
  refresh,        // Re-run search
} = useDiscoverySearch();
```

---

## 10. Integration with Recommendation Engine (Prompt 13)

The Discovery Engine (Prompt 12) handles **candidate retrieval & eligibility**. The Recommendation Engine (Prompt 13) wraps it with **intelligent ranking**:

1. `getRecommendations()` calls `discoverProfiles()` to get an eligible candidate pool
2. The recommendation layer extracts 10 normalized features (0–1) for each candidate pair
3. Mutual compatibility is scored in both directions (viewer→candidate, candidate→viewer)
4. Configurable weights (dating vs social mode) are applied
5. MMR diversity reranking prevents showing the same profile type repeatedly
6. Controlled exploration injects fresh candidates
7. Impressions are tracked for feedback loop / ranking improvement

See `docs/recommendation-engine.md` for details.

---

## 11. Performance

### Social Discovery

| Operation | Method | Expected P95 |
|-----------|--------|-------------|
| Text search | Full-text GIN index | < 100ms |
| Interest filter | Join with index | < 50ms |
| Distance filter | Haversine in SQL | < 100ms |
| Full discovery call | RPC function | < 500ms |

### Dating Discovery

The existing dating pipeline already targets < 500ms using:
- Composite indexes on profiles (gender, intent, completion)
- Batch queries for interests, photos, follows
- Server-side ranking with no N+1 queries

### Cursor Pagination

- Cursor format: `{score}_{user_id}`
- Deterministic ordering: `score DESC, created_at DESC, user_id DESC`
- No duplicate candidates across pages
- O(1) next-page retrieval

---

## 11. Future Improvements

| Feature | Priority | Description |
|---------|----------|-------------|
| ML ranking | High | Replace heuristic scoring with learned model |
| Precomputed queues | Medium | Background job to precompute candidate pools |
| Redis cache | Medium | Cache popular search queries and interest lists |
| Elasticsearch | Low | Replace PostgreSQL full-text for large-scale search |
| Personalized diversity | Low | Controlled diversity across interest/location dimensions |
| Text autocorrect | Low | Spell-check and suggest corrections |
