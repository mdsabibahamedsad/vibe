# Vibe — Application Architecture

## Overview

Vibe is a **Telegram Mini App** for social discovery + friendship + dating. It runs inside the Telegram client and uses Supabase as its primary backend platform.

**Positioning:** Social discovery inside Telegram.

---

## System Architecture

```
Telegram Client
     │
     ▼
Telegram Mini App (iframe)
     │
     ▼
┌─────────────────────────┐
│   Next.js Application   │
│   (React / TypeScript)  │
│                         │
│  ┌────────┐ ┌────────┐  │
│  │ Client │ │ Server │  │
│  │ (RSC)  │ │Routes  │  │
│  └───┬────┘ └───┬────┘  │
│      │          │       │
│  ┌───┴────┐ ┌───┴────┐  │
│  │Supabase│ │Telegram│  │
│  │ Client │ │  Bot   │  │
│  └───┬────┘ └───┬────┘  │
└──────┼──────────┼───────┘
       │          │
       ▼          ▼
┌──────────┐ ┌──────────┐
│ Supabase │ │ Telegram │
│ Backend  │ │ Bot API  │
│ ─────────│ │          │
│ PostgreSQL│ │          │
│ Realtime │ │          │
│ Storage  │ │          │
│ Edge Fn. │ │          │
└──────────┘ └──────────┘
```

---

## Frontend Architecture

### Framework

- **Next.js** (App Router) — server & client components
- **React** — UI library
- **TypeScript** (strict mode) — type safety
- **Tailwind CSS v4** — utility-first styling
- **Zod** — runtime validation

### Directory Structure

```
src/
  app/              # Next.js App Router pages & layouts
    page.tsx          # Home / landing
    layout.tsx        # Root layout
    globals.css       # Global styles
    discover/         # Dating discovery / swiping
    feed/             # Social feed
    create/           # Content creation
    matches/          # Mutual matches
    chats/            # Real-time chat
    profile/          # User profile
    settings/         # App settings
    premium/          # Premium subscriptions
  components/
    ui/               # Reusable UI primitives (Button, Card, etc.)
    shared/           # Shared application components
  features/           # Feature-specific components & logic
  hooks/              # Custom React hooks
  lib/
    supabase/         # Supabase client architecture
    telegram/         # Telegram WebApp integration
  services/           # Business logic / service layer
  types/              # TypeScript type definitions
  utils/              # Helper utilities
docs/                 # Documentation
```

### Component Architecture

- **UI Primitives** (`components/ui/`): Generic, reusable, Telegram-themed components like Button, Card, Avatar, Modal.
- **Shared Components** (`components/shared/`): Application-specific reusable components (profile card, post card, etc.).
- **Feature Components** (`features/`): Complex feature-specific components organized by domain.
- **Pages** (`app/`): Route-level components that compose features and shared components.

---

## Supabase Architecture

### Clients

| Client  | Scope  | Key Used      | RLS | Where Used                     |
| ------- | ------ | ------------- | --- | ------------------------------ |
| Browser | Client | Anon (public) | Yes | Client components              |
| Server  | Server | Anon (public) | Yes | Route Handlers, Server Actions |
| Admin   | Server | Service Role  | No  | Admin ops, background jobs     |

### Data Layer

- **PostgreSQL** — primary database
- **Row Level Security (RLS)** — data access control
- **Realtime** — subscriptions for live chat, notifications
- **Storage** — user-uploaded media (photos, videos)
- **Edge Functions** — server-side logic when Next.js API isn't sufficient

---

## Telegram Integration Architecture

### Telegram's Role

1. **Mini App environment** — the app runs inside Telegram's embedded browser
2. **User identity** — Telegram provides initData with user info
3. **Authentication** — Bot API token validates initData server-side
4. **Communication** — Telegram-native back-button, haptic feedback, etc.
5. **Payments** — Telegram Stars for digital goods (future)

### Key Constraint

Vibe's **application database is Supabase PostgreSQL**, not Telegram's internal database. We store Telegram user IDs in our database to link accounts, but we do not access Telegram's private database.

### Authentication Flow (Planned)

```
1. User opens Mini App in Telegram
2. Telegram injects initData (incl. user info + HMAC signature)
3. Client sends initData to our server endpoint
4. Server validates HMAC-SHA-256 signature using Bot Token
5. Server extracts verified user data
6. Server creates/retrieves user in Supabase
7. Server issues session token
8. Client uses session token for subsequent requests
```

### Media Architecture

Media storage is modular:

- **Phase 1:** Reference Telegram file IDs stored in our database
- **Phase 2:** Upload to Supabase Storage with CDN

---

## Recommendation Engine Architecture

The Recommendation Engine lives alongside the Search & Discovery Engine:

```
Frontend (Search / Discover page)
    ↓
GET /api/recommendations?mode=social|dating&query=...
    ↓
recommendation.service: getRecommendations()
    ↓
  ┌─────────────────────────────────────┐
  │  Prompt 12: Candidate Retrieval     │
  │  discoverProfiles() → eligible pool │
  └──────────────┬──────────────────────┘
                 ↓
  ┌─────────────────────────────────────┐
  │  Prompt 13: Recommendation Engine   │
  │  ┌─ Feature Extraction (10 feats)  │
  │  ├─ Mutual Compatibility Scoring   │
  │  ├─ Weighted Ranking (dating/social)│
  │  ├─ MMR Diversity Reranking        │
  │  ├─ Exploration Injection          │
  │  └─ Impression Tracking            │
  └──────────────┬──────────────────────┘
                 ↓
    Ranked results + explanations + compatibility badge
```

### Key Services

| Service | Responsibility |
|---------|---------------|
| `recommendation.service` | Unified entry point; wraps Prompt 12 |
| `feature.service` | Extracts 10 normalized features (0–1) |
| `compatibility.service` | Mutual preference compatibility (both directions) |
| `ranking.service` | Weighted scoring, config validation, badge generation |
| `diversity.service` | MMR reranking + seeded exploration injection |
| `feedback.service` | Impression recording + aggregate signal computation |

### Ranking Configuration

All weights are centralized in `lib/recommendation/constants.ts`. Two modes:
- **Dating:** Compatibility 25%, Interests 20%, Location 10%, Activity 10%, etc.
- **Social:** Interests 25%, Mutual Connections 20%, Activity 15%, Location 10%, etc.

### Future ML Interface

The `RecommendationModel` interface is ready for ML replacement:

```ts
interface RecommendationModel {
  score(viewerFeatures, candidateFeatures): Promise<number>;
  readonly version: string;
}
```

Replace `RuleBasedRecommendationModel` with `MLRecommendationModel` without changing the discovery system.

---

## Security Boundaries

1. Never expose Supabase service-role key
2. Never trust client-provided user IDs
3. Validate Telegram initData server-side before trusting identity
4. Use Supabase Row Level Security on all tables
5. Sensitive operations (payments, admin) must happen server-side
6. Admin operations must never rely on client-side role checks alone
7. Rate-limit abuse-prone endpoints
8. Never expose private location data

---

## Planned Modules

| Module        | Description                               |
| ------------- | ----------------------------------------- |
| Identity      | User accounts, Telegram auth, sessions    |
| Profiles      | User profiles, photos, bio, preferences   |
| Social        | Feed, posts, likes, comments, follows     |
| Dating        | Discovery, swiping, matching              |
| Messaging     | Real-time chat between matched users      |
| Media         | Photo/video uploads, stories              |
| Communities   | Groups, interest-based communities        |
| Payments      | Telegram Stars, virtual goods             |
| Subscriptions | Premium tiers, recurring billing          |
| Moderation    | Reports, blocking, content moderation     |
| Notifications | Push notifications, in-app alerts         |
| Recommendation | Personalized recommendation engine with ranking, diversity, exploration |
| Search         | Full-text search, social discovery, dating discovery |
| Referrals     | Invite system, referral rewards           |
| Analytics     | User behavior, growth metrics             |
| Admin         | Dashboard, user management, system config |

---

## Scalability Considerations

- **Stateless API:** Our Next.js API routes are stateless, allowing horizontal scaling
- **Database:** Supabase PostgreSQL with connection pooling
- **Realtime:** Supabase Realtime for live updates (WebSocket-based)
- **Caching:** Future: Redis/CDN caching for feed, profiles
- **Media:** CDN-backed storage for photos/videos
- **Rate limiting:** Future: Upstash Redis or similar for distributed rate limiting
- **Background jobs:** Future: Queue system for async tasks (notifications, processing)

---

## Environment Variables

Required variables are documented in `.env.example`.
See `docs/security.md` for secret management guidelines.
