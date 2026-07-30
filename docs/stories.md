# Vibe — Stories System

## Overview

The Stories system provides temporary social content that expires after 24 hours. It supports photo stories, short-video stories, viewer tracking, lightweight reactions, and privacy controls.

---

## 1. Story Lifecycle

```
Created → Active (24 hours) → Expired → Archived (future)
                │
                ▼
            Deleted (manual)
```

### Timeline

- **Created:** Story is visible to eligible viewers immediately
- **Active:** Story is visible for 24 hours from creation
- **Expired:** Story is hidden from normal queries; analytics preserved
- **Archived (future):** Placeholder for a future archive feature
- **Deleted:** Story owner can soft-delete at any time

### Expiration

- `expires_at = created_at + 24 hours` (server time)
- All active story queries filter: `expires_at > NOW()` AND `deleted_at IS NULL`
- Client clock is NEVER used for expiration decisions
- A database function `expire_stories()` marks expired stories with status `'expired'`

---

## 2. Media Architecture

Stories use the existing `media` table and media abstraction.

### Supported Media Types

| Type   | Formats                | Max Size | Max Duration |
| ------ | ---------------------- | -------- | ------------ |
| Image  | JPEG, PNG, WebP        | 10 MB    | —            |
| Video  | MP4, MOV, WebM         | 50 MB    | 60 seconds   |

### Storage Providers

- **Telegram (Phase 1):** Store Telegram file_id references
- **Supabase (Phase 2):** Upload to Supabase Storage with CDN
- **External CDN (Phase 3):** Custom CDN for production scale

The viewer UI does not know which provider is used — the media service abstracts it.

### Configuration

All limits are centralized in `src/lib/stories/constants.ts`:

```typescript
MAX_STORY_VIDEO_DURATION_SECONDS = 60
MAX_STORY_VIDEO_SIZE_BYTES = 50 * 1024 * 1024
MAX_STORY_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
STORY_IMAGE_DISPLAY_DURATION_MS = 5000
STORY_CAPTION_MAX_LENGTH = 200
STORY_EXPIRATION_HOURS = 24
MAX_ACTIVE_STORIES_PER_USER = 20
```

---

## 3. Database Schema

### stories (existing, extended)

| Column             | Type          | Description                           |
| ------------------ | ------------- | ------------------------------------- |
| id                 | uuid PK       |                                       |
| author_id          | uuid FK→users |                                       |
| media_id           | uuid FK→media |                                       |
| caption            | text          | Optional text                         |
| visibility         | enum          | 'public' or 'followers_only'          |
| processing_status  | enum          | 'pending', 'processing', 'ready', 'failed' |
| status             | enum          | 'active', 'expired', 'archived', 'deleted' |
| created_at         | timestamptz   |                                       |
| expires_at         | timestamptz   | created_at + 24 hours                 |
| deleted_at         | timestamptz   | Soft delete timestamp                 |

### story_views (existing)

| Column    | Type        | Description                |
| --------- | ----------- | -------------------------- |
| story_id  | uuid PK     | FK→stories                 |
| viewer_id | uuid PK     | FK→users                   |
| viewed_at | timestamptz |                             |

**Constraint:** `UNIQUE(story_id, viewer_id)` — one view record per user per story

### story_reactions (new)

| Column    | Type          | Description                |
| --------- | ------------- | -------------------------- |
| story_id  | uuid PK       | FK→stories                 |
| user_id   | uuid PK       | FK→users                   |
| reaction  | reaction_type | 'like', 'love', 'haha', 'wow', 'sad' |
| created_at | timestamptz   |                             |

**Constraint:** `UNIQUE(story_id, user_id)` — one reaction per user per story (upsert)

---

## 4. Story Visibility

### Visibility Options

| Option           | Description                                      |
| ---------------- | ------------------------------------------------ |
| `public`         | Anyone can view                                   |
| `followers_only` | Only followers (follow relationship) can view     |
| `close_friends`  | Not implemented (requires Close Friends system)   |

### Server-side Enforcement

- Author can always view their own stories
- Deleted stories are never accessible
- Expired stories are never returned
- Blocked users (mutual) cannot view each other's stories
- Banned/inactive users' stories are hidden

### Centralized Check

```typescript
canViewStory(userId: string, storyId: string): Promise<boolean>
```

This function is the single source of truth for story visibility. All API routes use it. It checks:

1. Story exists
2. Not deleted
3. Not expired
4. Author is active and not banned
5. Viewer is not blocked (mutual)
6. Visibility rules (public / followers_only)

A database function `public.can_view_story(p_user_id, p_story_id)` mirrors this logic for RLS.

---

## 5. Viewer Logic

### StoriesBar

The StoriesBar shows story rings for:
1. The user's own story ("Your Story" with + button)
2. Followed users' active stories
3. Public stories from non-blocked, non-banned users

**Sorting:**
1. Own story first
2. Unviewed stories
3. Followed users
4. Most recent activity

### Full-Screen Viewer

The StoryViewer provides:

- **Progress bars:** Segmented bars at top showing all stories in order
- **Auto-advance:** Images advance after 5 seconds, videos play naturally
- **Tap navigation:** Left 33% = previous, right 33% = next
- **Hold to pause:** Press and hold pauses the timer
- **Swipe navigation:** Swipe right to go back
- **Reactions:** Quick emoji reactions (like, love, haha, wow, sad)
- **Mute/unmute:** For video stories
- **Keyboard support:** ← → Space Escape
- **Close button:** Top right
- **Delete button:** For own stories (with confirmation)
- **Reply input:** Foundation for future messaging integration

### View Tracking

- Views are recorded with `UNIQUE(story_id, viewer_id)` constraint
- Duplicate views are silently handled (no error, no duplicate row)
- View count is accessible only to the story owner
- Viewer list is paginated and owner-only

---

## 6. Reaction System

### Supported Reactions

| Emoji | Type  |
| ----- | ----- |
| 👍    | like  |
| ❤️    | love  |
| 😂    | haha  |
| 😮    | wow   |
| 😢    | sad   |

### Behavior

- **Add:** User can add a reaction (upsert)
- **Change:** User can change their reaction (same upsert)
- **Remove:** User can remove their reaction
- **Constraint:** One reaction per user per story
- **UI:** Quick reaction bar appears when tapping the middle of the story

---

## 7. Reply Integration (Foundation)

The reply system is prepared for future messaging integration.

### Current State

- A reply input field exists at the bottom of the StoryViewer
- It accepts text input but does not send messages yet
- The UI shows "Reply will be sent as a message" hint

### Future Integration (Prompt 08)

- Create a direct conversation between story author and viewer
- Send the reply as the first message in that conversation
- Include the story media as context in the message

---

## 8. Block/Report Behavior

### Blocks

- User A blocks User B → B cannot see A's stories
- Uses the existing `blocks` table and `user_is_blocked()` function
- Block check is bidirectional (either direction prevents viewing)
- Blocked users are excluded from StoriesBar queries
- Blocked users cannot react to stories

### Reports

- Stories can be reported using the existing reports system
- Report categories: spam, harassment, nudity, hate_speech, violence, impersonation, copyright, other
- The reporter cannot see moderation notes
- The story owner is not notified who reported

---

## 9. Deep Links

### Format

```
https://t.me/<BOT_USERNAME>/<APP_NAME>?startapp=story_<STORY_ID>
```

### Supported Entities

| Entity | Format          |
| ------ | --------------- |
| Story  | `story_<ID>`    |

### Behavior

- Opens the app and authenticates
- Validates story access
- Opens the viewer to the specific story
- Shows graceful error if story is expired/unavailable

---

## 10. Cleanup Strategy

### Automatic Expiration

The database function `expire_stories()` marks stories as `'expired'` when their `expires_at` passes. This is triggered by:

1. **Scheduled job** (recommended for production):
   - Supabase cron job (pg_cron)
   - Vercel Cron Jobs calling `POST /api/stories/cleanup`
   - Run every hour

2. **Manual trigger**:
   - `POST /api/stories/cleanup` (development/testing)

3. **Lazy expiration** (current):
   - Story queries filter by `status = 'active'` AND `expires_at > NOW()`
   - Expired stories are never returned even if status wasn't updated

### What Cleanup Does

- ✅ Marks expired stories with `status = 'expired'`
- ✅ Preserves analytics/moderation metadata
- ❌ Does NOT delete media records
- ❌ Does NOT hard-delete story rows

### Orphaned Media Cleanup

The `cleanupOrphanedStoryMedia()` function removes media records older than 24 hours that are not referenced by any story, post, or profile photo. This is best-effort cleanup to prevent table bloat.

---

## 11. RLS Policies

### stories

- **Select:** Users can read stories that are not deleted, not expired, and:
  - They are the author, OR
  - Visibility is 'public', OR
  - Visibility is 'followers_only' and they follow the author, OR
  - They are a moderator
- **Insert:** Users can create stories (author_id = auth.uid())
- **Update:** Story authors can update their stories
- **Delete:** Story authors can delete their stories

### story_views

- **Select:** Story authors can see viewer records for their stories; viewers can see their own view records
- **Insert:** Users can create view records (viewer_id = auth.uid())

### story_reactions

- **Select:** Users who can view the story can see reactions; story owners can see all reactions
- **Insert:** Users can add their own reactions
- **Update:** Users can update their own reactions
- **Delete:** Users can remove their own reactions

---

## 12. Performance Strategy

### Indexes

| Index                        | Purpose                                    |
| ---------------------------- | ------------------------------------------ |
| `stories_active_idx`         | Active stories by author (for StoriesBar)  |
| `stories_my_active_idx`      | Current user's active stories              |
| `stories_active_visibility_idx` | Visibility-filtered active stories       |
| `story_views_story_viewer_idx` | Check if user viewed a story             |
| `story_views_story_viewed_at_idx` | Viewer list ordered by view time      |
| `story_reactions_story_id_idx` | Reactions by story                       |
| `story_reactions_user_id_idx` | Reactions by user                        |

### Query Optimization

- StoriesBar query batches all stories in one request
- Enrichment uses parallel batch queries
- View counts are cached (not queried per story in StoriesBar)
- Expired stories are filtered at the database level
- Viewer list is paginated (20 per page)

### What We Avoid

- ❌ N+1 queries (batch enrich in parallel)
- ❌ Loading every story media at full resolution
- ❌ Fetching expired/deleted stories
- ❌ Repeated profile queries (cached in enrich)
- ❌ Unnecessary realtime subscriptions

---

## 13. Analytics Events

| Event                     | Trigger                                    |
| ------------------------- | ------------------------------------------ |
| `story_created`           | Story published                            |
| `story_opened`            | Story viewer opened                        |
| `story_viewed`            | View recorded for a story                  |
| `story_completed`         | User viewed all stories in a group         |
| `story_reaction_added`    | User added/changed reaction                |
| `story_reaction_removed`  | User removed reaction                      |
| `story_shared`            | User shared a story (future)               |
| `story_reported`          | User reported a story                      |
| `story_deleted`           | Story owner deleted their story            |

All events are stored in the `analytics_events` table. Events are fire-and-forget — failures do not break the application.

---

## 14. Future Archive System

### Preparation

The `stories.status` column supports values for archiving:

```typescript
'active' | 'expired' | 'archived' | 'deleted'
```

A future archive UI would:

1. Display a grid of the user's past stories
2. Allow restoring archived stories
3. Provide permanent deletion after 30 days

### Not Implemented Yet

- Archive UI (/archive route)
- Archive-specific queries
- Bulk archive operations
- Auto-archive after expiration

---

## 15. API Routes

| Method | Route                             | Description                | Auth Required |
| ------ | --------------------------------- | -------------------------- | ------------- |
| GET    | `/api/stories`                    | List active stories        | Yes           |
| POST   | `/api/stories`                    | Create story               | Yes           |
| GET    | `/api/stories/:id`                | Get single story           | Yes           |
| DELETE | `/api/stories/:id`                | Delete story               | Yes           |
| POST   | `/api/stories/:id/view`           | Record story view          | Yes           |
| GET    | `/api/stories/:id/viewers`        | Get viewer list (owner)    | Yes           |
| POST   | `/api/stories/:id/reactions`      | Add/change reaction        | Yes           |
| DELETE | `/api/stories/:id/reactions`      | Remove reaction            | Yes           |
| POST   | `/api/stories/media`              | Upload story media         | Yes           |
| POST   | `/api/stories/report`             | Report a story             | Yes           |
| POST   | `/api/stories/cleanup`            | Trigger cleanup            | Yes           |
| GET    | `/api/media/:id`                  | Serve media placeholder    | Yes           |

---

## 16. File Structure

```
src/
  features/
    stories/
      components/
        StoriesSection.tsx     — Main orchestrator (bar + viewer + composer)
        StoriesBar.tsx         — Horizontal story ring bar
        StoryViewer.tsx        — Full-screen story viewer
        StoryComposer.tsx      — Story creation modal
      hooks/
        useStories.ts          — StoriesBar data hook
        useStoryViewer.ts      — Viewer state management hook
  lib/
    stories/
      index.ts                 — Re-exports
      constants.ts             — Configuration limits
      types.ts                 — TypeScript types
      schemas.ts               — Zod validation schemas
      story.service.ts         — Server-side business logic
      cleanup.ts               — Expiration cleanup service
  app/
    api/
      stories/
        route.ts               — GET (list) + POST (create)
        [id]/
          route.ts             — GET (single) + DELETE
          view/
            route.ts           — POST (record view)
          viewers/
            route.ts           — GET (viewer list)
          reactions/
            route.ts           — POST (add) + DELETE (remove)
        media/
          route.ts             — POST (upload)
        report/
          route.ts             — POST (report story)
        cleanup/
          route.ts             — POST (trigger cleanup)
      media/
        [id]/
          route.ts             — GET (serve media)
    stories/
      page.tsx                 — Dedicated stories page
    page.tsx                   — Updated home with StoriesSection
docs/
  stories.md                   — This document
supabase/
  migrations/
    020_stories_system.sql     — Story reactions, RLS, cleanup function
```
