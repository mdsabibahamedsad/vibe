-- Vibe Database — Interests
-- Categorized interest tags that users can add to their profiles.

-- ============================================================================
-- INTERESTS — Available interest tags
-- ============================================================================
create table public.interests (
  id          uuid        default gen_random_uuid() primary key,
  name        text        not null,
  slug        text        not null unique,
  category    text,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

create index interests_slug_idx on public.interests (slug);
create index interests_category_idx on public.interests (category);
create index interests_active_idx on public.interests (is_active) where is_active = true;

-- ============================================================================
-- PROFILE INTERESTS — Many-to-many relationship between profiles and interests
-- ============================================================================
create table public.profile_interests (
  profile_id  uuid        not null references public.profiles(id) on delete cascade,
  interest_id uuid        not null references public.interests(id) on delete cascade,
  created_at  timestamptz not null default now(),

  primary key (profile_id, interest_id)
);

create index profile_interests_interest_id_idx on public.profile_interests (interest_id);
