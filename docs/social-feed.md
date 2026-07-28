# Social Feed System

## 1. Feed Architecture

The social feed is organized as a modular feature within `src/features/feed/`:

```
src/features/feed/
  components/
    Feed.tsx          — Main feed container with infinite scroll
    FeedPost.tsx      — Individual post card
    PostComposer.tsx  — Post creation form
    PostMedia.tsx     — Image gallery & video player
    PostActions.tsx   — Like, comment, share buttons
    PostMenu.tsx      — Post context menu (edit, delete, report, block)
    CommentSheet.tsx  — Bottom sheet for comments
    FollowButton.tsx  — Follow/unfollow button
  hooks/
    useFeed.ts        — Infinite-scrolling feed hook
    usePost.ts        — Post interaction hook (like, comment, follow, report)
  services/
    feed.service.ts   — Server-side feed query with ranking
    post.service.ts   — Server-side post CRUD, likes, comments, follows, reports
  schemas/
    post.schema.ts    — Zod validation schemas
```

### API Routes

| Route                 | Methods           | Purpose                           |
| --------------------- | ----------------- | --------------------------------- |
| `/api/feed`           | GET               | Cursor-paginated feed             |
| `/api/posts`          | POST, GET, DELETE | Create, read, delete (soft) posts |
| `/api/posts/like`     | POST, DELETE      | Like/unlike a post                |
| `/api/posts/comments` | POST, GET, DELETE | Create, list, delete comments     |
| `/api/follows`        | POST, DELETE, GET | Follow, unfollow, status          |
| `/api/reports`        | POST              | Report users, posts, comments     |

---

## 2. Feed Ranking V1

The feed uses a deterministic scoring formula:

```
score = (recency_score × 0.4) + (follow_boost × 0.35) + (engagement_score × 0.25)
```

### Components

- **Recency (40%)**: Posts within 3 hours get full score, decaying linearly to 0 over 72 hours.
- **Follow (35%)**: Posts from followed users get a 0.35 boost.
- **Engagement (25%)**: Normalized sum of likes and comments (capped at 100).

### Design for Future Replacement

The ranking logic is isolated in `feed.service.ts` in the `rankItems()` function. A future recommendation engine can replace this function without modifying the feed UI, pagination, or filtering logic.

---

## 3. Cursor Pagination

The feed uses **cursor-based pagination** with `created_at` as the cursor.

### Request

```
GET /api/feed?cursor=2024-01-01T00:00:00.000Z&limit=20
```

### Response

```json
{
  "items": [...],
  "nextCursor": "2024-01-01T00:00:00.000Z",
  "hasMore": true
}
```

### Properties

- Stable ordering: `ORDER BY created_at DESC`
- No duplicate or skipped posts
- Client specifies limit (max 50 server-enforced)
- Duplicate prevention via `Set` on client

---

## 4. Post Types

| Type    | Description      | Media                        |
| ------- | ---------------- | ---------------------------- |
| `text`  | Text-only post   | None                         |
| `image` | Photo post       | 1–10 images                  |
| `video` | Short video post | 1 video + optional thumbnail |

### Visibility Levels

- **public**: Visible to everyone
- **followers_only**: Visible only to followers
- **private**: Visible only to the author

---

## 5. Media Architecture

Media in posts uses the same multi-provider abstraction as profile photos:

- **telegram**: Telegram file ID references (Phase 1)
- **supabase**: Supabase Storage uploads (Phase 2)
- **external_cdn**: Future CDN (Phase 3)

Post media is linked via the `post_media` junction table:

- `post_id` → `posts.id`
- `media_id` → `media.id`
- `sort_order` for ordering

### Image Gallery

- Horizontal swipe with position indicators
- Lazy loading
- Aspect ratio preservation

### Short Video

- Muted autoplay on scroll into view
- IntersectionObserver-based pause when off-screen
- Play/pause controls
- Duration badge
- Thumbnail poster support
- Max 1 video per post (configurable)

### Video Limits

| Property        | Limit                     |
| --------------- | ------------------------- |
| Max duration    | 60 seconds (configurable) |
| Max size        | 50 MB                     |
| Allowed formats | MP4, QuickTime, WebM      |

---

## 6. Like System

- One like per user per post (enforced by DB primary key)
- Denormalized `like_count` on `posts` table (maintained by DB trigger)
- Optimistic UI with rollback on error
- Analytics event: `post_liked` / `post_unliked`

### Database

```sql
post_likes (post_id, user_id)  -- composite PK
-- Trigger: update_post_like_count on INSERT/DELETE
```

---

## 7. Comments

### Features

- Create, delete (soft), list comments
- Reply to comments (one level of nesting)
- Bottom sheet UI with keyboard support
- Cursor-based pagination
- Author + reply author display

### Database

```sql
post_comments (id, post_id, author_id, parent_comment_id, content, deleted_at)
-- Trigger: update_post_comment_count on INSERT/DELETE
```

### Limits

| Property           | Limit                         |
| ------------------ | ----------------------------- |
| Max comment length | 1,000 characters              |
| Nesting            | 1 level (top-level + replies) |
| Pagination         | 20 comments per page          |

---

## 8. Follows

### Features

- Follow / unfollow
- Self-follow prevention (DB constraint)
- Duplicate prevention (composite PK)
- Blocked-user interaction prevention
- Follower count & following count

### Database

```sql
follows (follower_id, following_id)  -- composite PK
-- Check: follower_id != following_id
```

---

## 9. Block & Report Integration

### Blocking

- Uses the existing `blocks` table
- Blocked users are excluded from feed queries server-side
- Bidirectional block check: if A blocks B OR B blocks A, interaction is prevented

### Reporting

- Uses the existing `reports` table
- Supports reporting posts, users, and comments
- Report reasons: spam, harassment, nudity, hate_speech, violence, impersonation, copyright, other
- No report details are exposed to the reported user

---

## 10. Visibility Rules (Server-Side)

The feed query enforces:

1. **Deleted posts**: Excluded via `deleted_at IS NULL`
2. **Blocked users**: Excluded via bidirectional block check
3. **Followers-only posts**: Only shown to followers
4. **Private posts**: Only shown to the author
5. **Banned users**: Excluded via user status

These rules are applied in the feed service, not in the client.

---

## 11. Performance Strategy

### Optimizations

- **Denormalized counters**: `like_count` and `comment_count` on `posts` table via DB triggers
- **Composite indexes**: `posts(created_at DESC)` for feed queries, `posts(author_id, created_at DESC)` for user posts
- **Conditional indexes**: `posts_public_recent_idx` for discovery feed
- **Limit enforcement**: Server clamps `limit` to 50 max
- **Batch author loading**: Author info is loaded per-post but cached via `getAuthorSummary`

### Future Optimizations

- Materialized feed for each user (fan-out-on-write)
- Redis cache for like/follow counts
- CDN for media URLs
- Query batching for feed enrichment

---

## 12. Deep-Link Foundation

Posts have stable deep-link identifiers:

```
post_<POST_ID>
```

Full Telegram Mini App link:

```
https://t.me/<BOT_USERNAME>/<APP>?startapp=post_<POST_ID>
```

The `shareDeepLink()` utility uses the Telegram WebApp API if available, falling back to clipboard copy.

---

## 13. Analytics Events

Tracked via the `analytics_events` table:

| Event             | Entity  | Trigger                |
| ----------------- | ------- | ---------------------- |
| `post_created`    | post    | After post creation    |
| `post_deleted`    | post    | After soft delete      |
| `post_liked`      | post    | After like             |
| `post_unliked`    | post    | After unlike           |
| `comment_created` | comment | After comment creation |
| `follow_created`  | user    | After follow           |
| `follow_removed`  | user    | After unfollow         |

Analytics failures never break the application (fire-and-forget with try/catch).

---

## 14. Future Recommendation Engine Integration

The feed architecture is designed for future replacement:

1. **`feed.service.ts`**: Replace `getFeed()` with calls to a recommendation service
2. **`rankItems()`**: Replace or remove when ML scoring is available
3. **`enrichFeedItem()`**: Reusable enrichment logic
4. **`useFeed.ts`**: UI-agnostic hook, no changes needed
5. **`Feed.tsx`**: UI component, no changes needed

The ranking function accepts additional inputs (shared interests, location, dating intent, past engagement) that an ML model can use without changing the interface.
