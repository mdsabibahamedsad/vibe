# Recommendation + Matching Intelligence Engine

## Overview

The Recommendation Intelligence Engine sits on top of Prompt 12's Search + Discovery Engine. While Prompt 12 handles **candidate retrieval, eligibility, filtering, and pagination**, Prompt 13 handles **ranking intelligence, personalization, compatibility scoring, diversity, exploration, and feedback.**

### Architecture

```
User Request
    ↓
GET /api/recommendations
    ↓
recommendation.service.ts (getRecommendations)
    ↓
1. Prompt 12 Candidate Retrieval (discoverProfiles)
2. Feature Extraction (normalized 0–1)
3. Mutual Compatibility Calculation
4. Ranking with Configurable Weights
5. Diversity Reranking (MMR)
6. Exploration Injection
7. Impression Tracking
8. Result + Explanations
```

---

## 1. Feature Extraction (`feature.service.ts`)

All features are normalized to **0.0–1.0** for consistent weight application.

| Feature | Range | Description |
|---------|-------|-------------|
| `interestSimilarity` | 0–1 | Jaccard similarity of interest sets |
| `preferenceCompatibility` | 0–1 | Age, gender, intent preference matching |
| `locationScore` | 0–1 | Smooth distance decay |
| `activityScore` | 0–1 | Recency of last activity |
| `profileQuality` | 0–1 | Photo, bio, completion, verification, engagement |
| `mutualConnectionScore` | 0–1 | Mutual follow count |
| `interactionAffinity` | 0–1 | Prior likes/passes/follows with time decay |
| `freshnessScore` | 0–1 | New account boost (decays over 72h) |
| `diversityScore` | 0–1 | Set by MMR reranking |
| `explorationScore` | 0–1 | Set by exploration module |

---

## 2. Mutual Compatibility (`compatibility.service.ts`)

Calculates compatibility in **both directions**:

```
viewer → candidate compatibility
candidate → viewer compatibility
```

**Combined score:** Geometric mean of both directions.

**Factors considered:**
- Age compatibility (20%)
- Gender compatibility (20%)
- Dating intent matching (20%)
- Interest similarity (20%)
- Distance compatibility (20%)

**Minimum compatibility:** Both directions must pass age and gender thresholds.

---

## 3. Ranking (`ranking.service.ts`)

### Configurable Weights

**Dating Mode:**
| Weight | Default | Description |
|--------|---------|-------------|
| COMPATIBILITY | 0.25 | Mutual preference compatibility |
| INTEREST_SIMILARITY | 0.20 | Shared interests |
| LOCATION | 0.10 | Distance proximity |
| ACTIVITY | 0.10 | Recent activity |
| PROFILE_QUALITY | 0.10 | Complete profiles |
| MUTUAL_CONNECTION | 0.05 | Mutual follows |
| INTERACTION_AFFINITY | 0.05 | Prior interactions |
| FRESHNESS | 0.05 | New profile boost |
| DIVERSITY | 0.05 | MMR diversity |
| EXPLORATION | 0.05 | Exploration slot |

**Social Mode:**
| Weight | Default | Description |
|--------|---------|-------------|
| INTEREST_SIMILARITY | 0.25 | Shared interests |
| MUTUAL_CONNECTION | 0.20 | Mutual follows |
| ACTIVITY | 0.15 | Recent activity |
| LOCATION | 0.10 | Distance proximity |
| PROFILE_QUALITY | 0.10 | Complete profiles |
| INTERACTION_AFFINITY | 0.05 | Prior interactions |
| FRESHNESS | 0.05 | New profile boost |
| DIVERSITY | 0.05 | MMR diversity |
| EXPLORATION | 0.05 | Exploration slot |

### Ranking Pipeline
```
1. Calculate features for each candidate
2. Apply weights to get initial score (0–1)
3. Sort by score descending
4. Apply MMR diversity reranking
5. Inject exploration candidates
6. Build explanation reasons
```

### Versioning

Current version: `v1`

The `RANKING_VERSION` constant is included in every response and impression record for future comparison.

---

## 4. Diversity (`diversity.service.ts`)

### MMR (Maximum Marginal Relevance)

```
MMR = λ * relevance - (1 - λ) * maxSimilarity(selected)
```

- λ = 0.7 (configurable, higher = more relevance-focused)
- Similarity computed from: interest overlap, location match, score proximity

### Exploration

- EXPLORATION_RATE: 10% of results
- Seeded random for stability within a session
- Exploration candidates inserted at spaced positions

---

## 5. Cold Start

| Scenario | Behavior |
|----------|----------|
| New user, no history | Uses profile interests + preferences + location + broad relevance |
| No interests | Falls back to location, activity, profile quality, exploration |
| No location | Reduces location weight, redistributes to other features |
| New candidate | Temporary freshness boost (decays over 72 hours) |
| Repeated pass | Score penalty with decay |
| Recently seen | Score penalty (50% reduction, 24h cooldown) |

---

## 6. Feedback Loop

### Impression Tracking
Every recommendation request records impressions:

```sql
recommendation_impressions
- viewer_id
- candidate_id
- mode
- request_id
- ranking_version
- position
- score_bucket
- interaction_type (set later when user acts)
- interacted_at
```

### Action Attribution
When a user likes, passes, follows, or views a profile:
1. The most recent impression is updated with the interaction type
2. An analytics event is tracked

### Feedback Decay
Signals decay exponentially with a 7-day half-life.
Signals older than 1 year are discarded.

---

## 7. Future ML Interface

The ranking engine implements a `RecommendationModel` interface:

```typescript
interface RecommendationModel {
  score(viewerFeatures: unknown, candidateFeatures: unknown): Promise<number>;
  readonly version: string;
}
```

Current implementation: `RuleBasedRecommendationModel`

Future: `MLRecommendationModel` can replace it without changing the discovery system.

---

## 8. API Endpoint

### `GET /api/recommendations`

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `social` / `dating` | `dating` | Recommendation mode |
| `query` | string | — | Search text (social mode) |
| `cursor` | string | — | Pagination cursor |
| `limit` | number | 20 | Page size |
| `requestId` | string | — | Request grouping ID |

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "profile": { /* DiscoveryCandidate or SearchProfileResult */ },
      "score": 0.72,
      "compatibility": {
        "badge": "Strong match",
        "sharedInterests": 3,
        "intentMatch": true
      },
      "reasons": ["shared_interest", "nearby"],
      "mode": "dating"
    }
  ],
  "nextCursor": "...",
  "hasMore": true,
  "requestId": "uuid",
  "rankingVersion": "v1"
}
```

---

## 9. Performance

| Component | Expected P95 | Bottleneck |
|-----------|-------------|------------|
| Candidate retrieval | < 300ms | Prompt 12 query |
| Feature extraction | < 50ms | In-memory computation |
| Ranking + Diversity | < 20ms | JavaScript computation |
| Impression insert | < 20ms | Batch insert |
| **Total** | **< 500ms** | |

---

## 10. Database

### Migration 027 — `recommendation_impressions`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| viewer_id | UUID | User who was shown the candidate |
| candidate_id | UUID | Candidate shown |
| mode | text | 'social' or 'dating' |
| request_id | UUID | Groups impressions from one request |
| ranking_version | text | v1 |
| position | smallint | 0-based position in results |
| score_bucket | text | 'high' / 'medium' / 'low' |
| interaction_type | text | Null until user acts |
| interacted_at | timestamptz | When user acted |
| created_at | timestamptz | When impression was recorded |

### RLS

- Users can read only their own impressions
- Insert/update/delete are restricted to service_role
- Cleanup function removes records > 90 days

### Indexes

- viewer_id + created_at DESC (recent impressions)
- candidate_id + created_at DESC (candidate history)
- request_id (request grouping)
- viewer_id + candidate_id + created_at DESC (recently seen check)
- interaction_type + created_at DESC (analytics)

---

## 11. Security

- Viewer identity is always from server session — never trust client-provided viewer IDs
- Exploration never bypasses safety/eligibility rules
- Impression data is isolated to the viewer
- No private message content is stored
- No exact coordinates are stored in impressions
- Rate limiting: 30 recommendations/minute, 60 feedback events/minute

---

## 12. Analytics Events

| Event | Description |
|-------|-------------|
| `recommendation_request` | A recommendation was generated |
| `recommendation_like` | User liked a recommended candidate |
| `recommendation_pass` | User passed a recommended candidate |
| `recommendation_follow` | User followed a recommended candidate |
| `recommendation_view` | User viewed a recommended candidate's profile |
| `recommendation_match` | User matched with a recommended candidate |
| `recommendation_conversation_started` | Conversation began after recommendation |
| `recommendation_conversation_replied` | Reply in recommendation-initiated chat |
