-- Vibe Database — Media & Stories
-- Modular media storage supporting multiple providers (Telegram, Supabase, CDN).
-- Stories with automatic 24-hour expiration.

-- ============================================================================
-- MEDIA — Media file metadata (not the files themselves)
-- ============================================================================
-- Media files are stored externally (Telegram, Supabase Storage, CDN).
-- This table tracks metadata and references to the actual files.
create table public.media (
  id                uuid                      default gen_random_uuid() primary key,
  owner_id          uuid                      not null references public.users(id) on delete cascade,
  media_type        media_type                not null,
  storage_provider  storage_provider          not null default 'telegram',
  provider_file_id  text,
  storage_path      text,
  mime_type         text,
  file_size         integer,
  width             integer,
  height            integer,
  duration_seconds  numeric,
  thumbnail_media_id uuid                     references public.media(id) on delete set null,
  processing_status media_processing_status   not null default 'pending',
  created_at        timestamptz               not null default now(),
  deleted_at        timestamptz
);

create index media_owner_id_idx on public.media (owner_id);
create index media_provider_idx on public.media (storage_provider);
create index media_processing_idx on public.media (processing_status) where processing_status = 'pending';

-- Add FK from profile_photos to media (deferred from migration 003)
alter table public.profile_photos
  add constraint profile_photos_media_id_fkey
  foreign key (media_id) references public.media(id) on delete set null;

-- ============================================================================
-- POST MEDIA — Many-to-many relationship between posts and media
-- ============================================================================
create table public.post_media (
  post_id     uuid        not null references public.posts(id) on delete cascade,
  media_id    uuid        not null references public.media(id) on delete cascade,
  sort_order  smallint    not null default 0,

  primary key (post_id, media_id)
);

create index post_media_media_id_idx on public.post_media (media_id);

-- ============================================================================
-- STORIES — Ephemeral content that expires after 24 hours
-- ============================================================================
-- Stories are not physically deleted immediately for analytics/moderation,
-- but are excluded from queries after expiration.
create table public.stories (
  id                uuid               default gen_random_uuid() primary key,
  author_id         uuid               not null references public.users(id) on delete cascade,
  media_id          uuid               not null references public.media(id) on delete cascade,
  caption           text,
  visibility        story_visibility   not null default 'followers_only',
  created_at        timestamptz        not null default now(),
  expires_at        timestamptz        not null default (now() + interval '24 hours'),
  deleted_at        timestamptz
);

create index stories_author_id_idx on public.stories (author_id);
create index stories_expires_at_idx on public.stories (expires_at);
-- Active stories query index
create index stories_active_idx on public.stories (author_id, created_at desc)
  where deleted_at is null and expires_at > now();

-- ============================================================================
-- STORY VIEWS — Track who viewed stories
-- ============================================================================
create table public.story_views (
  story_id    uuid        not null references public.stories(id) on delete cascade,
  viewer_id   uuid        not null references public.users(id) on delete cascade,
  viewed_at   timestamptz not null default now(),

  primary key (story_id, viewer_id)
);

create index story_views_viewer_id_idx on public.story_views (viewer_id);
create index story_views_story_id_idx on public.story_views (story_id);
