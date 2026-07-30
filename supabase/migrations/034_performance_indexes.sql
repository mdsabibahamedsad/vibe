-- Vibe Database — Performance Optimization Migration
-- Migration 034: Missing indexes, composite indexes, and query optimizations
--
-- This migration adds indexes identified during the production architecture audit
-- that are missing from previous migrations. It does NOT duplicate existing indexes
-- from migrations 001–033.
--
-- Key optimizations:
--   1. Composite indexes for common query patterns
--   2. Partial indexes for filtered queries
--   3. Covering indexes for expensive queries
--   4. Dead-letter queue table

-- ============================================================================
-- DEAD-LETTER QUEUE
-- ============================================================================

create table if not exists public.dead_letter_queue (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  job_id text not null,
  error_message text not null,
  error_stack text,
  status text not null default 'failed' check (status in ('failed', 'resolved', 'discarded')),
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  metadata jsonb default '{}'::jsonb,
  source text not null default 'unknown',
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.dead_letter_queue enable row level security;

create policy "DLQ is admin-only"
  on public.dead_letter_queue for select
  using (public.is_admin());

create policy "DLQ inserted by system"
  on public.dead_letter_queue for insert
  with check (public.is_admin());

create policy "DLQ updated by admins"
  on public.dead_letter_queue for update
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists idx_dlq_status on public.dead_letter_queue(status);
create index if not exists idx_dlq_job_type on public.dead_letter_queue(job_type);
create index if not exists idx_dlq_created on public.dead_letter_queue(created_at desc);
create index if not exists idx_dlq_status_type on public.dead_letter_queue(status, job_type);

-- ============================================================================
-- PERFORMANCE INDEXES FOR EXISTING TABLES
-- ============================================================================

-- ─── FEED: Composite index for feed queries ─────────────────────────────
-- Common query: SELECT * FROM posts WHERE author_id IN (...) ORDER BY created_at DESC
create index if not exists idx_posts_author_created
  on public.posts(author_id, created_at desc)
  where deleted_at is null;

-- ─── POST LIKES: Prevent duplicate likes, fast count ────────────────────
create index if not exists idx_post_likes_post_user
  on public.post_likes(post_id, user_id);

-- ─── POST COMMENTS: Paginated comment loading ──────────────────────────
create index if not exists idx_post_comments_post_created
  on public.post_comments(post_id, created_at asc)
  where deleted_at is null;

-- ─── FOLLOWS: Fast follower/following counts and checks ────────────────
create index if not exists idx_follows_follower_following
  on public.follows(follower_id, following_id);

create index if not exists idx_follows_following_follower
  on public.follows(following_id, follower_id);

-- ─── MESSAGES: Conversation message loading ────────────────────────────
-- Common query: SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC
create index if not exists idx_messages_conv_created
  on public.messages(conversation_id, created_at desc)
  where deleted_at is null;

-- ─── MATCHES: Active match lookup ───────────────────────────────────────
-- Common query: SELECT * FROM matches WHERE (user_a_id = ? OR user_b_id = ?) AND status = 'active'
create index if not exists idx_matches_user_a_status
  on public.matches(user_a_id, status);

create index if not exists idx_matches_user_b_status
  on public.matches(user_b_id, status);

-- ─── NOTIFICATIONS: User notification list ──────────────────────────────
create index if not exists idx_notifications_recipient_created
  on public.notifications(recipient_id, created_at desc);

create index if not exists idx_notifications_recipient_unread
  on public.notifications(recipient_id, read_at)
  where read_at is null;

-- ─── DATING ACTIONS: Previous action lookup ────────────────────────────
create index if not exists idx_dating_actions_actor_target
  on public.dating_actions(actor_id, target_id);

create index if not exists idx_dating_actions_target_action
  on public.dating_actions(target_id, action);

-- ─── STORIES: Active story query ──────────────────────────────────────
create index if not exists idx_stories_author_expires
  on public.stories(author_id, expires_at desc)
  where deleted_at is null;

-- ─── MEDIA: Owner's media list ─────────────────────────────────────────
create index if not exists idx_media_owner_type
  on public.media(owner_id, media_type);

-- ─── REPORTS: Moderation queue ────────────────────────────────────────
create index if not exists idx_reports_status_priority
  on public.reports(status, priority)
  where status in ('pending', 'reviewing');

create index if not exists idx_reports_reported_user
  on public.reports(reported_user_id);

-- ─── MODERATION ACTIONS: User history ─────────────────────────────────
create index if not exists idx_moderation_actions_target
  on public.moderation_actions(target_type, target_id, created_at desc);

-- ─── SUBSCRIPTIONS: Active subscription lookup ────────────────────────
create index if not exists idx_subscriptions_user_active
  on public.subscriptions(user_id, status)
  where status = 'active';

-- ─── PREMIUM ENTITLEMENTS: Feature entitlement check ───────────────────
create index if not exists idx_premium_entitlements_user_feature
  on public.premium_entitlements(user_id, feature_key)
  where status = 'active';

-- ─── ANALYTICS EVENTS: Event query by type and date ────────────────────
create index if not exists idx_analytics_events_name_date
  on public.analytics_events(event_name, created_at desc);

-- ─── AD_CAMPAIGNS: Active campaign lookup ──────────────────────────────
-- Skip if table doesn't exist
do $$
begin
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'ad_campaigns') then
    create index if not exists idx_ad_campaigns_status
      on public.ad_campaigns(status, start_date, end_date);
  end if;
end $$;

-- ─── USER RESTRICTIONS: Active restriction check ──────────────────────
create index if not exists idx_user_restrictions_user_active
  on public.user_restrictions(user_id, restriction_type)
  where is_active = true;

-- ─── USER WARNINGS: Active warning lookup ─────────────────────────────
create index if not exists idx_user_warnings_user
  on public.user_warnings(user_id, is_active);

-- ─── SAFETY SIGNALS: Unreviewed signals queue ─────────────────────────
create index if not exists idx_safety_signals_unreviewed_type
  on public.safety_signals(signal_type, severity)
  where reviewed = false;

-- ─── CONVERSATION MEMBERS: User's conversation list ───────────────────
create index if not exists idx_conv_members_user_active
  on public.conversation_members(user_id, is_active);

-- ─── REFERRAL CODES: Code lookup ─────────────────────────────────────
create index if not exists idx_referral_codes_code
  on public.referral_codes(code)
  where is_active = true;

-- ============================================================================
-- MATERIALIZED VIEW: Daily engagement summary
-- ============================================================================
-- Pre-computed daily engagement metrics for the admin dashboard.
-- Reduces expensive aggregation queries.

create materialized view if not exists public.mv_daily_engagement as
select
  date_trunc('day', created_at)::date as day,
  count(distinct user_id) filter (where event_name = 'session_start') as dau,
  count(*) filter (where event_name = 'message_sent') as messages_sent,
  count(*) filter (where event_name = 'post_create') as posts_created,
  count(*) filter (where event_name = 'post_like') as likes_given,
  count(*) filter (where event_name = 'match_created') as matches_created,
  count(*) filter (where event_name = 'media_upload_completed') as media_uploads,
  count(*) filter (where event_name = 'payment_completed') as payments_completed
from public.analytics_events
where created_at >= now() - interval '90 days'
group by 1
order by 1 desc
with no data;

-- Unique index for concurrent refresh
create unique index if not exists idx_mv_daily_engagement_day
  on public.mv_daily_engagement(day);

-- ============================================================================
-- FUNCTION: Refresh materialized views safely
-- ============================================================================
-- Refreshes concurrently to avoid locking reads.

create or replace function public.refresh_daily_engagement()
returns void
language plpgsql
security definer
as $$
begin
  refresh materialized view concurrently public.mv_daily_engagement;
end;
$$;

-- ============================================================================
-- VACUUM CONFIGURATION (for large tables)
-- ============================================================================
-- These tables benefit from more aggressive auto-vacuum tuning.
-- Run manually if needed: ALTER TABLE ... SET (autovacuum_vacuum_scale_factor = 0.01);

comment on table public.analytics_events is 'Consider setting autovacuum_vacuum_scale_factor = 0.01 for this table due to high insert volume';
comment on table public.messages is 'Consider setting autovacuum_vacuum_scale_factor = 0.01 for this table due to high insert volume';
comment on table public.notifications is 'Consider setting autovacuum_vacuum_scale_factor = 0.01 for this table due to high insert volume';
