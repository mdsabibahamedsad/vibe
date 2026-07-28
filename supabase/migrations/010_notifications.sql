-- Vibe Database — Notifications Foundation
-- In-app notification records. Notifications are created by application
-- services (triggers, Edge Functions, or server-side logic).

-- ============================================================================
-- NOTIFICATIONS — User notification records
-- ============================================================================
create table public.notifications (
  id                uuid                default gen_random_uuid() primary key,
  recipient_id      uuid                not null references public.users(id) on delete cascade,
  type              notification_type   not null,
  actor_id          uuid                references public.users(id) on delete set null,
  entity_type       text,               -- 'post', 'match', 'message', etc.
  entity_id         text,               -- UUID of the referenced entity
  title             text,
  body              text,
  metadata          jsonb               default '{}'::jsonb,
  channel           notification_channel not null default 'in_app',
  is_read           boolean             not null default false,
  read_at           timestamptz,
  created_at        timestamptz         not null default now()
);

-- Primary query pattern: fetch unread notifications for a user, newest first
create index notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where is_read = false;

-- All notifications for a user, newest first
create index notifications_recipient_all_idx
  on public.notifications (recipient_id, created_at desc);

create index notifications_type_idx on public.notifications (type);
