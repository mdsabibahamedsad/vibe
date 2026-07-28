# Vibe — Profile System

## Overview

The profile system manages user identity, profile data, photos, interests, and discovery preferences. It is built on the database schema from Prompt 02 and the authentication system from Prompt 03.

---

## Onboarding Flow

```
Authenticated (needsOnboarding=true)
        ↓
    /onboarding
        ↓
Step 1: Basic Profile  (displayName, DOB, gender, city, country, bio)
        ↓
Step 2: Dating Intent  (dating/friendship/chat/relationship/not_sure)
        ↓
Step 3: Interests      (multi-select, 1-15 from 50 available)
        ↓
Step 4: Photos         (1-10 photos, set primary, reorder)
        ↓
Step 5: Intro Video    (optional, max 60 seconds)
        ↓
Step 6: Preferences    (age range, distance, gender preferences)
        ↓
Profile Complete → Redirected to Home (/)
```

### Route: `/onboarding`

The onboarding page is a multi-step flow with:

- Progress indicator (step X of 6)
- Back button on steps 2-6
- Skip option to exit onboarding
- Validation before each step
- Incremental save (each step saves independently)
- Error states with retry

---

## Profile Schema Usage

### users table

| Field               | Source             | Editable?          |
| ------------------- | ------------------ | ------------------ |
| `id`                | Supabase Auth UUID | No                 |
| `telegram_user_id`  | Telegram initData  | No                 |
| `telegram_username` | Telegram           | No (sync only)     |
| `display_name`      | User input         | Yes                |
| `first_name`        | Telegram           | No (sync only)     |
| `last_name`         | Telegram           | No (sync only)     |
| `role`              | System             | No                 |
| `is_active`         | User action        | Yes (deactivation) |
| `is_banned`         | Moderation         | No                 |

### profiles table

| Field                | Type        | Editable? | Public?                  |
| -------------------- | ----------- | --------- | ------------------------ |
| `bio`                | text        | Yes       | Yes                      |
| `date_of_birth`      | date        | Yes       | **No** (age only public) |
| `gender`             | gender enum | Yes       | Yes                      |
| `city`               | text        | Yes       | Yes                      |
| `country`            | text        | Yes       | Yes                      |
| `latitude/longitude` | numeric     | Future    | **No**                   |
| `dating_intent`      | enum        | Yes       | Yes                      |
| `profile_visibility` | enum        | Yes       | —                        |
| `is_verified`        | boolean     | System    | Yes                      |

---

## Age Verification Rules

- Minimum age: **18 years**
- Date of birth is stored privately (never exposed in API responses)
- Age is calculated server-side from DOB
- Underage users are **rejected** at the API level (not just frontend)
- Age is shown publicly as an integer (e.g., "24")
- DOB is never returned in public profile queries

### Server-side check:

```typescript
function calculateAge(dateOfBirth: string): number {
  // Standard birthday-aware calculation
  // Returns age in years
}

function isAdult(dateOfBirth: string): boolean {
  return calculateAge(dateOfBirth) >= 18;
}
```

---

## Profile Completion

A profile is considered "complete" when the following minimum fields are filled:

- Display name (2-50 characters)
- Date of birth (must be 18+)
- Gender
- City
- Dating/social intent
- At least 1 interest
- At least 1 profile photo

The `profiles.profile_completion_pct` column is auto-calculated by a database trigger.

### Completion scoring:

- Bio: 20 points
- Date of birth: 15 points
- Gender: 10 points
- City: 10 points
- Country: 5 points
- Dating intent: 10 points
- At least 1 photo: 20 points
- At least 1 interest: 10 points

---

## Media Architecture

### Storage Providers

| Provider       | Phase   | Use Case                          |
| -------------- | ------- | --------------------------------- |
| `telegram`     | Phase 1 | Store Telegram file_id references |
| `supabase`     | Phase 2 | Upload to Supabase Storage CDN    |
| `external_cdn` | Phase 3 | Custom CDN for production scale   |

### Media Lifecycle

1. **Upload** → Create `media` record + `profile_photos` link
2. **Set primary** → Update `is_primary` flag (only one primary)
3. **Reorder** → Update `sort_order` on all photos
4. **Delete** → Remove `profile_photos` record + `media` record + re-index sort orders

### Validation

| Check              | Limit                 |
| ------------------ | --------------------- |
| Max photos         | 10                    |
| Image formats      | JPEG, PNG, WebP, HEIC |
| Max image size     | 10 MB                 |
| Max video duration | 60 seconds            |
| Max video size     | 50 MB                 |
| Intro video        | Optional              |

---

## Telegram Media References

For Phase 1 (Telegram file_id references):

- `storage_provider = 'telegram'`
- `provider_file_id = telegram_file_id`
- Storage path is null (file lives on Telegram's servers)

The UI does not need to know the storage provider — the `media-service.ts` abstraction handles it.

---

## Privacy Model

### What is PUBLIC:

- Display name
- Age (integer, not DOB)
- Gender
- City, Country
- Bio
- Dating intent
- Interests
- Photos

### What is PRIVATE:

- Date of birth (exact)
- Email (tg_xxx@vibe-auth.app)
- Discovery preferences
- Dating action history (swipes)
- Report history
- Account status (active/banned)
- Exact GPS coordinates

### Location Privacy

- City/country stored for discovery
- Location is approximate only
- Exact coordinates (latitude/longitude) are RLS-protected
- Never exposed in public profile queries

---

## Profile Visibility

Settings stored in `profiles.profile_visibility`:

- `public` — Visible in discovery (default)
- `matches_only` — Visible only to matched users
- `private` — Hidden from discovery

Additional RLS protection:

- Banned users cannot access any data
- Blocked users cannot see each other's profiles
- Private profile fields protected by RLS policies

---

## Authorization

Every profile mutation requires server-side session verification:

- The `getCurrentUser(request)` function extracts the user from the Authorization header
- Client-provided user IDs are NEVER trusted
- All writes go through the admin client (service-role) server-side

### API Routes

| Method | Route                      | Action                   |
| ------ | -------------------------- | ------------------------ |
| GET    | `/api/profile`             | Get current profile      |
| PUT    | `/api/profile`             | Create/update profile    |
| PATCH  | `/api/profile`             | Partial update           |
| GET    | `/api/profile/preferences` | Get preferences          |
| PUT    | `/api/profile/preferences` | Save preferences         |
| GET    | `/api/interests`           | List available interests |
| PUT    | `/api/interests`           | Set profile interests    |
| GET    | `/api/profile/media`       | List profile photos      |
| POST   | `/api/profile/media`       | Add photo                |
| PUT    | `/api/profile/media`       | Reorder photos           |
| PATCH  | `/api/profile/media`       | Set primary photo        |
| DELETE | `/api/profile/media?id=X`  | Remove photo             |
| POST   | `/api/profile/deactivate`  | Deactivate account       |

---

## RLS

RLS policies from Prompt 02 apply:

- Users can only edit **their own** profile
- Public profile fields are readable according to visibility setting
- Private fields (DOB, location) are protected
- Interests and preferences are user-scoped
- Media records are owned by the uploader

All mutations go through server API routes which use the admin client (bypassing RLS). This is safe because:

1. The server verifies the user session first
2. The admin client runs server-side only
3. The user's identity is derived from the JWT, not client input

---

## Upload Limits

| Field        | Min     | Max       |
| ------------ | ------- | --------- |
| Display name | 2 chars | 50 chars  |
| Bio          | 0 chars | 500 chars |
| Photos       | 1       | 10        |
| Interests    | 1       | 15        |
| Intro video  | 0       | 1 (60s)   |
| Age range    | 18      | 100       |
| Distance     | 1 km    | 500 km    |

---

## Future Moderation Integration

The architecture is ready for:

1. **Automated moderation** — Hook into media upload flow to scan images
2. **Manual review** — Admin dashboard to review flagged profiles
3. **Fake profile detection** — ML-based detection on profile signals
4. **Profile verification** — Verified badge for authentic users
5. **Photo safety** — NSFW detection before photos go live
