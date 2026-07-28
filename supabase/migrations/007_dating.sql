-- Vibe Database — Dating & Matching
-- Core dating discovery actions, mutual matches, and user blocking.

-- ============================================================================
-- DATING ACTIONS — Swipe/like/pass/super_like records
-- ============================================================================
create table public.dating_actions (
  id          uuid                default gen_random_uuid() primary key,
  actor_id    uuid                not null references public.users(id) on delete cascade,
  target_id   uuid                not null references public.users(id) on delete cascade,
  action      dating_action_type  not null,
  created_at  timestamptz         not null default now(),

  -- Actor cannot target themselves
  constraint dating_actions_no_self_check check (actor_id != target_id),

  -- A user can only have one active action per target
  -- We use a unique constraint and handle updates in app logic
  constraint unique_actor_target unique (actor_id, target_id)
);

create index dating_actions_actor_id_idx on public.dating_actions (actor_id, created_at desc);
create index dating_actions_target_id_idx on public.dating_actions (target_id, action);
create index dating_actions_likes_idx on public.dating_actions (target_id, action)
  where action = 'like' or action = 'super_like';

-- ============================================================================
-- MATCHES — Mutual match records (only one record per pair)
-- ============================================================================
-- A match between user A and user B is stored as a single record.
-- user_a_id is always the smaller UUID to prevent duplicates.
create table public.matches (
  id            uuid          default gen_random_uuid() primary key,
  user_a_id     uuid          not null references public.users(id) on delete cascade,
  user_b_id     uuid          not null references public.users(id) on delete cascade,
  status        match_status  not null default 'active',
  matched_at    timestamptz   not null default now(),
  unmatched_at  timestamptz,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now(),

  -- Prevent self-match
  constraint matches_no_self_check check (user_a_id != user_b_id),

  -- Ensure consistent user ordering
  constraint matches_user_ordering_check check (user_a_id < user_b_id),

  -- Unique pair
  constraint unique_match_pair unique (user_a_id, user_b_id)
);

-- Indexes for fast lookup of matches for a given user
create index matches_user_a_id_idx on public.matches (user_a_id, status);
create index matches_user_b_id_idx on public.matches (user_b_id, status);

-- ============================================================================
-- BLOCKS — User blocking system
-- ============================================================================
create table public.blocks (
  blocker_id  uuid          not null references public.users(id) on delete cascade,
  blocked_id  uuid          not null references public.users(id) on delete cascade,
  source      block_source  not null default 'manual',
  created_at  timestamptz   not null default now(),

  primary key (blocker_id, blocked_id),

  -- Prevent self-block
  constraint blocks_no_self_check check (blocker_id != blocked_id)
);

create index blocks_blocked_id_idx on public.blocks (blocked_id);
