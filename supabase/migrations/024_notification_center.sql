-- Vibe Database — Notification Center System (Prompt 10)
-- Extends the existing notification foundation (010, 022) with:
--   - Group key for notification aggregation
--   - Extended notification types
--   - Delivery jobs table for Telegram notifications
--   - Notification preferences table
--   - Quiet hours support
--   - Performance indexes

-- ============================================================================
-- EXTEND NOTIFICATION TYPE ENUM — Add new event types
-- ============================================================================
-- Note: ALTER TYPE ... ADD VALUE must be in its own transaction.
-- We use a safe approach with exception handling.
do $$ begin
  alter type notification_type add value if not exists 'story_reaction';
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter type notification_type add value if not exists 'story_mention';
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter type notification_type add value if not exists 'profile_visit';
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- EXTEND NOTIFICATIONS TABLE — Add grouping support
-- ============================================================================
alter table public.notifications
  add column if not exists group_key text;

-- Index for reading grouped notifications efficiently
create index if not exists notifications_group_key_idx on public.notifications (group_key);

-- Index for unread count by recipient (without loading all rows)
create index if not exists notifications_unread_count_idx on public.notifications (recipient_id, is_read)
  where is_read = false;

-- Efficient query for notification center with filtering
create index if not exists notifications_list_idx on public.notifications (recipient_id, created_at desc);

-- ============================================================================
-- NOTIFICATION DELIVERY JOBS — For async Telegram notification delivery
-- ============================================================================
create table if not exists public.notification_delivery_jobs (
  id                uuid                default gen_random_uuid() primary key,
  notification_id   uuid                not null references public.notifications(id) on delete cascade,
  recipient_id      uuid                not null references public.users(id) on delete cascade,
  delivery_channel  text                not null default 'telegram',
  status            text                not null default 'pending'
                                        check (status in ('pending', 'sent', 'failed', 'skipped')),
  retry_count       integer             not null default 0,
  max_retries       integer             not null default 3,
  last_error        text,
  scheduled_at      timestamptz,
  sent_at           timestamptz,
  failed_at         timestamptz,
  created_at        timestamptz         not null default now(),
  updated_at        timestamptz         not null default now()
);

-- Index for finding pending delivery jobs
create index if not exists delivery_jobs_pending_idx
  on public.notification_delivery_jobs (status, scheduled_at, created_at)
  where status = 'pending';

-- Index for deduplication: one pending job per notification per channel
create unique index if not exists delivery_jobs_dedup_idx
  on public.notification_delivery_jobs (notification_id, delivery_channel)
  where status = 'pending';

-- ============================================================================
-- NOTIFICATION PREFERENCES — Per-user notification settings
-- ============================================================================
create table if not exists public.notification_preferences (
  user_id                   uuid        primary key references public.users(id) on delete cascade,

  -- In-app notification categories (all default ON)
  in_app_enabled            boolean     not null default true,

  match_notifications       boolean     not null default true,
  message_notifications     boolean     not null default true,
  follow_notifications      boolean     not null default true,
  post_notifications        boolean     not null default true,
  story_notifications       boolean     not null default true,
  system_notifications      boolean     not null default true,

  -- Telegram delivery opt-in
  telegram_enabled          boolean     not null default false,
  telegram_activated        boolean     not null default false,
  telegram_chat_id          text,

  -- Quiet hours
  quiet_hours_enabled       boolean     not null default false,
  quiet_hours_start         time,
  quiet_hours_end           time,
  timezone                  text        default 'UTC',

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ============================================================================
-- TRIGGER: Auto-create notification_preferences on user creation
-- ============================================================================
-- Note: This assumes the auth trigger already exists from previous migrations
-- If the user creation trigger doesn't create preferences, this is a fallback.
create or replace function public.create_notification_preferences()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ============================================================================
-- FUNCTION: get_unread_notification_count — Optimized unread count
-- ============================================================================
create or replace function public.get_unread_notification_count(p_recipient_id uuid)
returns jsonb
language plpgsql
stable
security definer
as $$
declare
  v_total bigint;
  v_messages bigint;
  v_dating bigint;
  v_social bigint;
begin
  -- Total unread
  select count(*) into v_total
  from public.notifications
  where recipient_id = p_recipient_id
    and is_read = false;

  -- Message unread (includes new_message)
  select count(*) into v_messages
  from public.notifications
  where recipient_id = p_recipient_id
    and is_read = false
    and type = 'new_message';

  -- Dating unread (includes new_match)
  select count(*) into v_dating
  from public.notifications
  where recipient_id = p_recipient_id
    and is_read = false
    and type = 'new_match';

  -- Social unread (includes post_like, post_comment, new_follower, story_view, story_reaction)
  select count(*) into v_social
  from public.notifications
  where recipient_id = p_recipient_id
    and is_read = false
    and type in ('post_like', 'post_comment', 'new_follower', 'story_view', 'story_reaction');

  return jsonb_build_object(
    'total', v_total,
    'messages', v_messages,
    'dating', v_dating,
    'social', v_social
  );
end;
$$;

-- ============================================================================
-- FUNCTION: cleanup_old_notifications — Archive/delete old notifications
-- ============================================================================
create or replace function public.cleanup_old_notifications(
  p_retention_days integer default 90
)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  delete from public.notifications
  where created_at < now() - (p_retention_days || ' days')::interval
    and is_read = true;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================================
-- RLS — NOTIFICATION DELIVERY JOBS
-- ============================================================================
alter table public.notification_delivery_jobs enable row level security;

-- Normal users cannot read delivery jobs (only server processes can)
create policy "Delivery jobs are not accessible to clients"
  on public.notification_delivery_jobs for select
  using (public.is_moderator());

-- No insert/update/delete policies for normal users — only security definer functions

-- ============================================================================
-- RLS — NOTIFICATION PREFERENCES
-- ============================================================================
alter table public.notification_preferences enable row level security;

create policy "Users can read own notification preferences"
  on public.notification_preferences for select
  using (user_id = auth.uid());

create policy "Users can manage own notification preferences"
  on public.notification_preferences for insert
  with check (user_id = auth.uid());

create policy "Users can update own notification preferences"
  on public.notification_preferences for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- REALTIME — Enable Realtime for notifications
-- ============================================================================
-- Notifications already have Realtime enabled if added in a previous migration.
-- If not, uncomment:
-- alter publication supabase_realtime add table public.notifications;
