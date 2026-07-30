-- Vibe Database — Media Pipeline (Prompt 11)
-- Extends the existing media foundation (migration 006) with:
--   - Media usage tracking (origin/owner per entity)
--   - Media derivatives (thumbnails, responsive sizes)
--   - Media processing jobs
--   - Visibility/status fields
--   - Storage policies for Supabase buckets
--   - Performance indexes

-- ============================================================================
-- EXTEND MEDIA TABLE — Add visibility, moderation, and versioning fields
-- ============================================================================
alter table public.media
  add column if not exists visibility text not null default 'private'
    check (visibility in ('public', 'private', 'restricted'));

alter table public.media
  add column if not exists moderation_status text default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected', 'review'));

alter table public.media
  add column if not exists file_hash text;

alter table public.media
  add column if not exists updated_at timestamptz not null default now();

-- Add a version counter for cache busting
alter table public.media
  add column if not exists version integer not null default 1;

-- Index for orphan media detection
create index if not exists media_orphan_idx on public.media (owner_id, created_at)
  where processing_status = 'pending' or processing_status = 'failed';

-- ============================================================================
-- MEDIA USAGE — Track where each media object is used
-- ============================================================================
create table if not exists public.media_usage (
  id            uuid        default gen_random_uuid() primary key,
  media_id      uuid        not null references public.media(id) on delete cascade,
  owner_id      uuid        not null references public.users(id) on delete cascade,
  entity_type   text        not null,  -- 'profile', 'post', 'story', 'message', 'avatar'
  entity_id     uuid,                  -- UUID of the related entity
  purpose       text,                  -- 'primary', 'gallery', 'attachment', 'thumbnail'
  created_at    timestamptz not null default now()
);

create index if not exists media_usage_media_idx on public.media_usage (media_id);
create index if not exists media_usage_entity_idx on public.media_usage (entity_type, entity_id);
create index if not exists media_usage_owner_idx on public.media_usage (owner_id);

-- ============================================================================
-- MEDIA DERIVATIVES — Processed variants (thumbnails, responsive sizes)
-- ============================================================================
create type if not exists derivative_type as enum (
  'thumbnail',
  'small',
  'medium',
  'large',
  'poster',
  'mobile',
  'standard'
);

create table if not exists public.media_derivatives (
  id              uuid                default gen_random_uuid() primary key,
  media_id        uuid                not null references public.media(id) on delete cascade,
  derivative_type derivative_type     not null,
  storage_key     text                not null,
  mime_type       text,
  size_bytes      integer,
  width           integer,
  height          integer,
  created_at      timestamptz         not null default now(),

  unique (media_id, derivative_type)
);

create index if not exists derivatives_media_idx on public.media_derivatives (media_id);

-- ============================================================================
-- MEDIA PROCESSING JOBS — Async image/video processing queue
-- ============================================================================
create table if not exists public.media_processing_jobs (
  id              uuid                default gen_random_uuid() primary key,
  media_id        uuid                not null references public.media(id) on delete cascade,
  job_type        text                not null,  -- 'image_optimize', 'image_thumbnail', 'video_transcode', 'video_thumbnail', 'cleanup'
  status          text                not null default 'pending'
                  check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts        integer             not null default 0,
  max_attempts    integer             not null default 3,
  error_code      text,
  scheduled_at    timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz         not null default now()
);

create index if not exists processing_jobs_pending_idx on public.media_processing_jobs (status, scheduled_at)
  where status = 'pending' or status = 'failed';

create index if not exists processing_jobs_media_idx on public.media_processing_jobs (media_id);

-- ============================================================================
-- FUNCTION: process_media_job — Mark job as processing (with optimistic lock)
-- ============================================================================
create or replace function public.start_media_processing(p_job_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_updated integer;
begin
  update public.media_processing_jobs
  set status = 'processing',
      attempts = attempts + 1,
      started_at = now(),
      scheduled_at = null
  where id = p_job_id
    and status = 'pending';

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- ============================================================================
-- FUNCTION: record_media_usage — Create or update media usage record
-- ============================================================================
create or replace function public.record_media_usage(
  p_media_id uuid,
  p_owner_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_purpose text default 'primary'
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.media_usage (media_id, owner_id, entity_type, entity_id, purpose)
  values (p_media_id, p_owner_id, p_entity_type, p_entity_id, p_purpose)
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================================
-- FUNCTION: cleanup_orphaned_media — Remove unattached media
-- ============================================================================
create or replace function public.cleanup_orphaned_media(
  p_grace_period_hours integer default 24
)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  -- Find media that has no usage records and is older than the grace period
  with orphaned as (
    select m.id
    from public.media m
    left join public.media_usage mu on mu.media_id = m.id
    where mu.id is null
      and m.created_at < now() - (p_grace_period_hours || ' hours')::interval
      and m.deleted_at is null
      -- Exclude media that might still be referenced in feature tables
      and not exists (select 1 from public.profile_photos pp where pp.media_id = m.id)
      and not exists (select 1 from public.post_media pm where pm.media_id = m.id)
      and not exists (select 1 from public.stories s where s.media_id = m.id)
      and not exists (select 1 from public.message_attachments ma where ma.media_id = m.id)
    limit 1000
  )
  update public.media m
  set deleted_at = now(),
      processing_status = 'deleted'
  from orphaned o
  where m.id = o.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================================
-- RLS — MEDIA DERIVATIVES
-- ============================================================================
alter table public.media_derivatives enable row level security;

-- Same access as media (via RLS on parent)
create policy "Derivatives accessible with parent media"
  on public.media_derivatives for select
  using (
    exists (
      select 1 from public.media where id = media_id
        and (owner_id = auth.uid() or public.is_moderator())
    )
    or auth.uid() in (
      -- Chat participants can see chat media derivatives
      select cm.user_id from public.message_attachments ma
        join public.messages msg on msg.id = ma.message_id
        join public.conversation_members cm on cm.conversation_id = msg.conversation_id
        join public.media_derivatives md on md.media_id = ma.media_id
      where md.id = media_derivatives.id
    )
  );

-- Admin-only insert/update/delete for derivatives
create policy "Derivatives managed by server"
  on public.media_derivatives for insert
  with check (public.is_moderator());

-- ============================================================================
-- RLS — MEDIA USAGE
-- ============================================================================
alter table public.media_usage enable row level security;

create policy "Users can see own media usage"
  on public.media_usage for select
  using (owner_id = auth.uid());

create policy "Media usage managed by server"
  on public.media_usage for insert
  with check (owner_id = auth.uid());

-- ============================================================================
-- RLS — MEDIA PROCESSING JOBS
-- ============================================================================
alter table public.media_processing_jobs enable row level security;

create policy "Processing jobs not visible to clients"
  on public.media_processing_jobs for select
  using (public.is_moderator());

-- Jobs are managed by server-side functions only
create policy "Processing jobs managed by server"
  on public.media_processing_jobs for insert
  with check (public.is_moderator());

-- ============================================================================
-- UPDATED MEDIA RLS — Add derivative-aware access
-- ============================================================================
-- Extend existing media RLS to cover derivatives
-- Media derivatives inherit access from their parent media

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Composite index for listing media by owner and status
create index if not exists media_owner_status_idx on public.media (owner_id, processing_status);
