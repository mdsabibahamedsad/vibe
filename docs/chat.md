# Vibe — Private Match Chat System (Prompt 09)

## Overview

The Private Match Chat system enables 1-to-1 real-time messaging between mutually matched users. It extends the existing messaging foundation (`008_messaging.sql`) with message types, delivery tracking, realtime delivery, typing indicators, and media sharing — all scoped to active match relationships.

---

## 1. Chat Access Rules

Chat is only available between two users with an active mutual match. Access is checked on every operation:

### Conditions
| Condition | Server Check |
|-----------|-------------|
| Match exists | `matches.id = matchId` |
| User is participant | `matches.user_a_id OR matches.user_b_id` |
| Match is active | `matches.status = 'active'` |
| No block relationship | `blocks` table — mutual check |
| Both accounts valid | `users.is_active = true AND users.is_banned = false` |

### Centralized Service

```typescript
canAccessChat(currentUserId, matchId)
  → { allowed: boolean, conversationId, otherUser }
```

This single function is used by all chat API routes. Every message send, fetch, read marker, and typing event runs through this check.

---

## 2. Message Schema

The existing `messages` table from `008_messaging.sql` is extended:

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid PK` | Auto-generated |
| `conversation_id` | `uuid FK` | References `conversations.id` |
| `sender_id` | `uuid FK` | References `users.id` |
| `message_type` | `enum` | `text` \| `image` \| `video` \| `system` |
| `content` | `text` | Message text content (null for media-only) |
| `status` | `enum` | `sent` \| `delivered` \| `read` |
| `delivered_at` | `timestamptz` | When recipient's client received the message |
| `read_at` | `timestamptz` | When recipient viewed the message |
| `reply_to_id` | `uuid FK` | References `messages.id` for reply chains |
| `client_message_id` | `text` | Client-generated idempotency key |
| `deleted_at` | `timestamptz` | Soft deletion timestamp |
| `created_at` | `timestamptz` | Message creation time |
| `edited_at` | `timestamptz` | (Future: message editing) |

### Key Features
- **Media**: Images/video linked via `message_attachments` + `media` tables
- **Soft deletion**: `deleted_at` set on delete, content cleared, message shown as "Message deleted"
- **Idempotency**: `UNIQUE (conversation_id, sender_id, client_message_id)` prevents duplicate sends

---

## 3. Message Lifecycle

```
User types → Client sends → Server validates → DB insert → Realtime event → Recipient receives
```

### States
| State | Storage | Description |
|-------|---------|-------------|
| `sending` | Client-only | Optimistic UI state before server confirmation |
| `sent` | Database | Server confirmed insert |
| `delivered` | Database | Recipient's client acknowledged receipt |
| `read` | Database | Recipient opened/read the message |
| `deleted` | Database | Soft-deleted by sender |

### Client-side states (not persisted)
- `sending` — Temporary optimistic state
- `failed` — Server rejected or network error

---

## 4. Media Messages Architecture

Chat media uses the same `media` table as profile photos and stories.

### Flow
```
1. User selects image/video
2. Client validates type/size client-side
3. Client uploads through available storage (Telegram/Supabase)
4. POST /api/chat/upload creates media record
5. Client uses returned mediaId in sendMessage
6. Server validates media ownership and processing state
7. Message created with message_attachments link
```

### Media validation per message
- `media.owner_id = sender_id`
- `media.processing_status = 'ready'`
- Supported MIME types via constants
- Size limits: 10MB images, 50MB videos
- Duration limits: 60 seconds for videos

---

## 5. Realtime Architecture

### Channel Structure
```
chat:<conversation_id>        — Message INSERT/UPDATE events
chat:typing:<conversation_id> — Typing indicator broadcast
```

### Security
- RLS on `messages` table ensures users only see own conversation messages
- Channel subscription via `postgres_changes` uses `conversation_id=eq.<id>` filter
- Typing events are broadcast-only (not persisted) via Realtime broadcast API
- Each conversation has a unique channel scoped to its ID

### Connection Lifecycle
```
Subscribe → Auth check → Listen for INSERT/UPDATE → Cleanup on unmount
```

### Reconnect Strategy
1. Preserve existing messages
2. Detect disconnect via status callback
3. Reconnect on visibility change
4. Re-authorize via `canAccessChat`
5. Resubscribe to conversation channel
6. Fetch missing messages from last known cursor

---

## 6. Typing Indicators

### Implementation
- **Client-side**: Throttled (2s interval), auto-stop after 5s timeout
- **Transport**: Supabase Realtime broadcast (not persisted)
- **Server**: Lightweight rate limit (120 events/minute)
- **Channel**: `chat:typing:<conversation_id>`

### Security
- Events broadcast only to conversation channel
- Recipient validates `userId !== self` before showing
- No database writes for typing events

---

## 7. Delivery & Read State

### Delivery
- When recipient opens chat and fetches messages, `markMessagesDelivered()` runs
- Updates `status = 'delivered'` and `delivered_at` for messages from the other user
- Fire-and-forget (non-blocking)

### Read
- When sender scrolls to bottom (near last message), `markAsRead()` runs
- Two-step process:
  1. Updates message-level `status = 'read'` and `read_at`
  2. Updates `conversation_members.last_read_at` for conversation-level tracking

### Choice of Architecture
We use **message-level read tracking** (updating each message row) for V1 because:
- Accurate per-message read state for the other user
- Simpler implementation without a separate read model
- Works well for 1-to-1 chats with reasonable message volumes

For future scaling, a `last_read_message_id` conversation-level marker could replace per-message writes.

---

## 8. Cursor Pagination

### Strategy
- Messages fetched in **reverse chronological order** (`created_at DESC`)
- Cursor: `{createdAt}_{messageId}`
- Results reversed to **chronological** for display
- `hasMore` flag + `nextCursor` for infinite scroll

### Query Pattern
```sql
SELECT * FROM messages
WHERE conversation_id = $1
  AND (created_at, id) < ($cursor_createdAt, $cursor_id)
ORDER BY created_at DESC, id DESC
LIMIT $limit + 1
```

### Edge Cases
- Identical timestamps handled by `id` tiebreaker
- Cursor-based pagination prevents duplicates and missed messages
- Reverse cursor for "load older" pattern

---

## 9. Idempotency

### Strategy
Each message send can include a `client_message_id` (UUID generated by client).

### Database Constraint
```sql
UNIQUE (conversation_id, sender_id, client_message_id)
```

### Behavior
- First send: Insert succeeds normally
- Retry (duplicate key): Server detects conflict, returns existing message
- Result: One message in DB, one message in UI — even if user double-taps send

---

## 10. Rate Limiting

| Action | Window | Max Requests |
|--------|--------|-------------|
| Send message | 1 minute | 30 per user |
| Upload media | 1 minute | 20 per user |
| Typing event | 1 minute | 120 per user |

Rate limiters use the existing `RateLimiter` abstraction (supports future Redis/Upstash swap).

---

## 11. Block & Unmatch Behavior

### Block
If either user blocks the other:
- `canAccessChat()` returns `{ allowed: false, reason: "Chat is unavailable due to a block" }`
- Sending messages is rejected (403)
- Existing chat becomes inaccessible
- UI shows "Chat unavailable" with error state

### Unmatch
If match status changes to `'unmatched'`:
- `canAccessChat()` checks `matches.status !== 'active'`
- Sending messages is rejected
- Chat becomes inaccessible
- Match removed from match/chats list

---

## 12. Private Media Security

### RLS on Media
Media is protected by the existing RLS policies and the `can_access_match_chat()` function:
- User can read media only if they own it OR are a participant in the relevant chat
- Media URL responses are handled through the existing media abstraction

### Storage
- Actual binary storage uses Telegram file IDs or Supabase Storage
- No raw storage credentials exposed to the frontend
- Chat media uses the same `media` table as other features

---

## 13. RLS Implementation

### Messages
```sql
-- SELECT: Can only read messages in accessible conversations
USING (can_access_match_chat(auth.uid(), conversation_id))

-- INSERT: Can only send as self in accessible conversations
WITH CHECK (sender_id = auth.uid() AND can_access_match_chat(...))

-- UPDATE (delivery/read): Can update messages they received
USING (participant check AND sender_id != auth.uid())

-- UPDATE (delete): Can soft-delete only own messages
WITH CHECK (sender_id = auth.uid() AND deleted_at IS NOT NULL)
```

### Conversations & Members
```sql
-- Joined through matches table with block/active checks
```

### Attachments
```sql
-- Accessible only to conversation participants
```

---

## 14. Reconnect Strategy

When realtime disconnects (network issues, app backgrounded):

1. **Preserve** existing messages in client state
2. **Detect** disconnect via Realtime status callback
3. **Reconnect** when visibility changes or `reconnect()` called
4. **Re-authorize** via `canAccessChat` API
5. **Resubscribe** to conversation channel
6. **Fetch** missing messages from last known cursor (deduplicated by ID)

Up to 5 retry attempts before showing permanent "Offline" indicator.

---

## 15. Analytics Events

| Event | Trigger |
|-------|---------|
| `chat_opened` | User opens chat page (future) |
| `message_sent` | Text message successfully sent |
| `message_send_failed` | Server rejected message |
| `image_message_sent` | Image message sent |
| `video_message_sent` | Video message sent |
| `message_delivered` | Recipient's client received message |
| `message_read` | Recipient opened/read message |
| `message_deleted` | Sender deleted message |
| `chat_reported` | User reported match from chat |
| `chat_unmatched` | User unmatched from chat |
| `chat_blocked` | User blocked match from chat |

No full message content is logged in analytics.

---

## 16. File Structure

```
src/
  features/chat/
    services/
      chat-access.service.ts    — Centralized chat authorization
      message.service.ts        — Send, list, delete messages
      chat-realtime.service.ts  — Realtime subscriptions & typing
      chat-upload.service.ts    — Chat media upload
    hooks/
      useChat.ts                — Main chat state + realtime
      useChatTyping.ts          — Typing indicator state
    components/
      ChatScreen.tsx            — Main chat screen composer
      ChatHeader.tsx            — Header with back, avatar, name, menu
      MessageList.tsx           — Scrollable message list + pagination
      MessageBubble.tsx         — Individual message bubble
      MessageComposer.tsx       — Input, send, attach, reply bar
      TypingIndicator.tsx       — Typing dots animation
      ImageViewer.tsx           — Full-screen media viewer
  lib/chat/
    constants.ts                — All configurable chat limits
    schemas.ts                  — Zod validation schemas + types
  app/api/chat/
    access/[matchId]/
      route.ts                  — GET check access
    [matchId]/
      messages/
        route.ts                — GET list, POST send
        [messageId]/
          route.ts              — DELETE message
      read/
        route.ts                — POST mark as read
      typing/
        route.ts                — POST typing indicator
    upload/
      route.ts                  — POST upload media
  app/chat/
    [matchId]/
      page.tsx                  — Chat screen page
  app/chats/
    page.tsx                    — Conversations list
supabase/migrations/
  023_private_match_chat.sql    — Chat system migration
docs/
  chat.md                       — This document
```

---

## 17. Future Improvements

- **Message editing** (`edited_at` column already exists)
- **Voice messages** — New message type + audio recording
- **Reply/forward** enhancements — Better preview rendering
- **Message search** — Full-text search within conversations
- **Last read message ID** — Conversation-level read marker for scale
- **Push notifications** — Telegram notification integration
- **End-to-end encryption** — Requires architectural changes (NOT currently implemented)

---

## 18. Security Notes

- **This is NOT end-to-end encrypted.** Messages are stored in PostgreSQL and visible to the server.
- All operations are server-authorized via `getCurrentUser()` + `canAccessChat()`
- Media ownership is verified server-side before message creation
- Realtime channels are scoped per-conversation; RLS prevents cross-conversation access
- Rate limiting prevents abuse without blocking legitimate usage
- Idempotency prevents duplicate message creation from retries
