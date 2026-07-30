-- Vibe Database — Stories System (Prompt 06)
-- Extends the existing stories and story_views tables with:
--   - story_reactions for lightweight reactions
--   - processing_status column on stories
--   - Additional indexes for performance
--   - RLS policies for story_reactions

-- ============================================================================
-- ALTER STORIES TABLE — Add processing_status and story_status
-- ============================================================================
-- The stories table (from migration 006) gets processing_status for media tracking
create type story_status as enum (
  'active',
  'expired',
  'archived',
  'deleted'
);

alter table public.stories
  add column if not exists processing_status media_processing_status not null default 'ready';

alter table public.stories
  add column if not exists status story_status not null default 'active';

-- Update status when deleted
create or replace function public.update_story_status()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is not null then
    new.status = 'deleted';
  end if;
  return new;
end;
$$;

create trigger update_story_status before update on public.stories
  for each row execute function public.update_story_status();

-- ============================================================================
-- STORY REACTIONS — Lightweight reactions on stories
-- ============================================================================
-- A user can have one reaction per story (upsert pattern)
-- Uses the existing reaction_type enum from migration 002
create table public.story_reactions (
  story_id    uuid            not null references public.stories(id) on delete cascade,
  user_id     uuid            not null references public.users(id) on delete cascade,
  reaction    reaction_type   not null,
  created_at  timestamptz     not null default now(),

  primary key (story_id, user_id)
);

-- Primary key (story_id, user_id) already creates a B-tree index covering story_id queries.
-- The user_id index is added for queries like "user's reactions across stories".
create index story_reactions_user_id_idx on public.story_reactions (user_id);

-- ============================================================================
-- ADDITIONAL STORY INDEXES
-- ============================================================================

-- Efficient query for "my active stories"
create index if not exists stories_my_active_idx on public.stories (author_id, created_at desc)
  where status = 'active' and deleted_at is null and expires_at > now();

-- Efficient query for "active stories from users I follow"
create index if not exists stories_active_visibility_idx on public.stories (author_id, visibility, expires_at)
  where status = 'active' and deleted_at is null and expires_at > now();

-- Story views by viewer for "has viewed" checks
create index if not exists story_views_story_viewer_idx on public.story_views (story_id, viewer_id);

-- Story views by story for viewer count
create index if not exists story_views_story_viewed_at_idx on public.story_views (story_id, viewed_at desc);

-- ============================================================================
-- CLEANUP FUNCTION — Mark expired stories
-- ============================================================================
-- This function marks stories as expired when their expires_at has passed.
-- It does NOT delete the stories or their associated media.
-- Analytics/moderation metadata is preserved.
create or replace function public.expire_stories()
returns integer
language plpgsql
security definer
as $$
declare
  expired_count integer;
begin
  update public.stories
  set status = 'expired'
  where status = 'active'
    and expires_at <= now()
    and deleted_at is null;

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

-- ============================================================================
-- FUNCTION: can_view_story — Centralized visibility check for stories
-- ============================================================================
-- Returns true if the given user can view the given story.
-- Checks: existence, deletion, expiration, author status, blocks, visibility.
create or replace function public.can_view_story(
  p_user_id uuid,
  p_story_id uuid
)
returns boolean
language plpgsql
stable
as $$
declare
  v_story record;
  v_author record;
begin
  -- Get the story
  select * into v_story
  from public.stories
  where id = p_story_id;

  if not found then
    return false;
  end if;

  -- Check deletion and expiration
  if v_story.deleted_at is not null then
    return false;
  end if;

  if v_story.expires_at <= now() then
    return false;
  end if;

  -- Author can always view
  if v_story.author_id = p_user_id then
    return true;
  end if;

  -- Check author is active and not banned
  select * into v_author
  from public.users
  where id = v_story.author_id;

  if not found or v_author.is_active = false or v_author.is_banned = true then
    return false;
  end if;

  -- Check blocks (mutual)
  if public.user_is_blocked(p_user_id, v_story.author_id) then
    return false;
  end if;

  -- Visibility checks
  if v_story.visibility = 'public' then
    return true;
  end if;

  if v_story.visibility = 'followers_only' then
    return exists (
      select 1 from public.follows
      where follower_id = p_user_id
        and following_id = v_story.author_id
    );
  end if;

  return false;
end;
$$;

-- NOTE: Story expiration is handled by the expire_stories() function
-- called via scheduled cron or manual cleanup. The stories table's
-- status is managed by update_story_status() trigger for deletions
-- and expire_stories() for time-based expiration.

-- ============================================================================
-- RLS POLICIES — Story Reactions
-- ============================================================================
alter table public.story_reactions enable row level security;

-- Users can read reactions on stories they can view
create policy "Story reactions readable by viewers"
  on public.story_reactions for select
  using (
    public.can_view_story(auth.uid(), story_id)
    or exists (
      select 1 from public.stories where id = story_id and author_id = auth.uid()
    )
  );

-- Users can add their own reactions
create policy "Users can add own reactions"
  on public.story_reactions for insert
  with check (user_id = auth.uid());

-- Users can update own reactions
create policy "Users can update own reactions"
  on public.story_reactions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Users can remove own reactions
create policy "Users can remove own reactions"
  on public.story_reactions for delete
  using (user_id = auth.uid());

-- ============================================================================
-- UPDATE EXISTING STORIES RLS — Add update/delete policy for status changes
-- ============================================================================
-- Keep existing select policy, add explicit update policy
-- (Stories already have insert and delete policies from migration 018)

-- Story authors can update their stories (e.g., status, deletion)
create policy "Users can update own stories"
  on public.stories for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- ============================================================================
-- UPDATE STORY VIEWS RLS — Ensure viewers can read their own view records
-- ============================================================================
-- Add: viewers can see their own story views
create policy "Viewers can see own story views"
  on public.story_views for select
  using (viewer_id = auth.uid());
