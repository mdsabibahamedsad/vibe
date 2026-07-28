-- Vibe Database — Communities Foundation
-- Interest-based groups where users can gather and share content.

-- ============================================================================
-- COMMUNITIES — Group/channel metadata
-- ============================================================================
create table public.communities (
  id                uuid                  default gen_random_uuid() primary key,
  name              text                  not null,
  slug              text                  not null unique,
  description       text,
  owner_id          uuid                  not null references public.users(id) on delete cascade,
  avatar_media_id   text,
  visibility        community_visibility  not null default 'public',
  is_active         boolean               not null default true,
  member_count      integer               not null default 0,
  created_at        timestamptz           not null default now(),
  updated_at        timestamptz           not null default now(),
  deleted_at        timestamptz
);

create index communities_slug_idx on public.communities (slug);
create index communities_owner_id_idx on public.communities (owner_id);
create index communities_active_idx on public.communities (is_active) where is_active = true;

-- ============================================================================
-- COMMUNITY MEMBERS — Many-to-many relationship
-- ============================================================================
create table public.community_members (
  community_id  uuid        not null references public.communities(id) on delete cascade,
  user_id       uuid        not null references public.users(id) on delete cascade,
  role          user_role   not null default 'user',
  joined_at     timestamptz not null default now(),

  primary key (community_id, user_id)
);

create index community_members_user_id_idx on public.community_members (user_id);
