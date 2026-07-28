-- Vibe Database — Additional Indexes
-- Performance indexes for expected query patterns.
-- Core indexes are defined inline with their tables.
-- This migration adds supplementary composite/conditional indexes.

-- ============================================================================
-- USERS & PROFILES
-- ============================================================================
-- Active user lookup for discovery
create index if not exists users_active_idx on public.users (is_active)
  where is_active = true;

-- Banned user quick-check
create index if not exists users_banned_idx on public.users (is_banned)
  where is_banned = true;

-- Profile completion for feed quality
create index if not exists profiles_completion_idx on public.profiles (profile_completion_pct desc)
  where profile_completion_pct >= 50;

-- ============================================================================
-- SOCIAL
-- ============================================================================
-- Recent public posts for the discovery feed
create index if not exists posts_public_recent_idx on public.posts (created_at desc)
  where visibility = 'public' and deleted_at is null;

-- Followers feed: posts by authors being followed
-- (covered by posts_author_id_idx + posts_created_at_idx)

-- ============================================================================
-- DATING
-- ============================================================================
-- Recent matches by participant
create index if not exists matches_recent_active_idx on public.matches (matched_at desc)
  where status = 'active';

-- Dating actions: recent likes by target (for match detection)
create index if not exists dating_actions_recent_likes_idx on public.dating_actions (target_id, actor_id, created_at desc)
  where action in ('like', 'super_like');

-- ============================================================================
-- MESSAGING
-- ============================================================================
-- Recent conversations for a user (for chat list)
-- Note: This is a complex query pattern that may benefit from
-- a materialized view or denormalization at scale.
-- Covered by conversation_members_user_id_idx + messages_conversation_id_created_at_idx

-- Unread message count per conversation per user
-- Covered by conversation_members (last_read_at) + messages (created_at)

-- ============================================================================
-- MEDIA
-- ============================================================================
-- Pending processing items
create index if not exists media_pending_processing_idx on public.media (created_at)
  where processing_status = 'pending';

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
-- Unread notification count
create index if not exists notifications_unread_count_idx on public.notifications (recipient_id, is_read)
  where is_read = false;

-- ============================================================================
-- INDEX STRATEGY NOTES
-- ============================================================================
-- Query patterns that need optimization:
--
-- 1. Feed queries: SELECT posts FROM users followed by current_user
--    → Index: follows(following_id) + posts(author_id, created_at)
--    → At scale, consider a fan-out-on-write approach or Redis cache
--
-- 2. Discovery: SELECT profiles WHERE preferences match
--    → Consider pg_trgm GIN index on bio/city for text search
--    → Location-based queries need PostGIS extension (future)
--
-- 3. Dating queue: SELECT profiles NOT already swiped by user
--    → Anti-join pattern: profiles LEFT JOIN dating_actions
--    → At scale, consider materialized list per user
--
-- 4. Chat list: SELECT conversations WHERE user is member, ordered by last message
--    → Covered by conversation_members + messages indexes
--    → At scale, add last_message_at to conversations table
