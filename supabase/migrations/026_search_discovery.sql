-- Vibe Database — Search + Discovery Engine (Prompt 12)
-- Adds:
--   - Full-text search vector on profiles for efficient text search
--   - GIN index for fast full-text queries
--   - Unified discover_profiles() RPC for both social + dating modes
--   - Search-specific configuration and indexes

-- ============================================================================
-- SEARCH VECTOR ON PROFILES
-- ============================================================================
-- Adds a tsvector column for full-text search across display_name, bio, username.
-- The vector is kept up-to-date via trigger on profile/user updates.
-- Weighting: display_name (A), telegram_username (B), bio (C)

alter table public.profiles
  add column if not exists search_vector tsvector;

-- GIN index for fast full-text search queries
create index if not exists profiles_search_vector_idx
  on public.profiles using gin (search_vector);

-- ============================================================================
-- FUNCTION: update_profile_search_vector
-- ============================================================================
-- Trigger function that updates the search_vector whenever profile or user
-- display data changes.
create or replace function public.update_profile_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(
      (select display_name from public.users where id = new.user_id), ''
    )), 'A') ||
    setweight(to_tsvector('english', coalesce(
      (select telegram_username from public.users where id = new.user_id), ''
    )), 'B') ||
    setweight(to_tsvector('english', coalesce(new.bio, '')), 'C');
  return new;
end;
$$;

-- Trigger on profiles insert/update
drop trigger if exists trg_profiles_search_vector on public.profiles;
create trigger trg_profiles_search_vector
  before insert or update of bio, user_id
  on public.profiles
  for each row
  execute function update_profile_search_vector();

-- Also trigger when user display_name/username changes
create or replace function public.update_user_search_vectors()
returns trigger
language plpgsql
as $$
begin
  update public.profiles
    set search_vector =
      setweight(to_tsvector('english', coalesce(new.display_name, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(new.telegram_username, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(bio, '')), 'C')
    where user_id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_users_search_vector on public.users;
create trigger trg_users_search_vector
  after update of display_name, telegram_username
  on public.users
  for each row
  execute function update_user_search_vectors();

-- Backfill existing profiles
update public.profiles
  set search_vector =
    setweight(to_tsvector('english', coalesce(
      (select display_name from public.users where id = user_id), ''
    )), 'A') ||
    setweight(to_tsvector('english', coalesce(
      (select telegram_username from public.users where id = user_id), ''
    )), 'B') ||
    setweight(to_tsvector('english', coalesce(bio, '')), 'C');

-- ============================================================================
-- INDEXES FOR INTEREST-BASED DISCOVERY
-- ============================================================================

-- Composite index for profile interests discovery
create index if not exists profile_interests_discovery_idx
  on public.profile_interests (profile_id, interest_id);

-- ============================================================================
-- FUNCTION: discover_profiles — Unified discovery engine
-- ============================================================================
-- Supports both social and dating discovery modes with:
--   - Full-text search (optional query)
--   - Mode-specific eligibility and filtering
--   - Interest-based filtering
--   - Age/gender/preference filtering (dating mode)
--   - Location-aware filtering
--   - Block/safety filtering
--   - Already-interacted filtering
--   - Ranking with configurable weights
--   - Cursor pagination
--
-- Parameters:
--   p_viewer_id   UUID — The authenticated user
--   p_mode        text — 'social' or 'dating'
--   p_query       text — Optional search query
--   p_interest_ids uuid[] — Optional interest filter
--   p_min_age     int — Minimum age (dating mode)
--   p_max_age     int — Maximum age (dating mode)
--   p_preferred_genders text[] — Gender filter (dating mode)
--   p_max_distance_km int — Distance filter
--   p_cursor_score numeric — Cursor score for pagination
--   p_cursor_id   text — Cursor user_id for pagination
--   p_limit       int — Page size

create or replace function public.discover_profiles(
  p_viewer_id       uuid,
  p_mode            text default 'social',
  p_query           text default null,
  p_interest_ids    uuid[] default null,
  p_min_age         int default 18,
  p_max_age         int default 60,
  p_preferred_genders text[] default null,
  p_max_distance_km int default 100,
  p_cursor_score    numeric default null,
  p_cursor_id       text default null,
  p_limit           int default 20
)
returns table (
  user_id           uuid,
  display_name      text,
  telegram_username text,
  bio               text,
  city              text,
  age               int,
  dating_intent     text,
  gender            text,
  profile_completion_pct smallint,
  is_verified       boolean,
  distance_km       numeric,
  shared_interests  bigint,
  score             numeric,
  created_at        timestamptz
)
language plpgsql
stable
as $$
declare
  v_viewer_profile_id uuid;
  v_viewer_interest_ids uuid[];
  v_excluded_ids uuid[];
begin
  -- ─── Get viewer profile ID ──────────────────────────────────────────
  select id into v_viewer_profile_id
    from public.profiles
    where user_id = p_viewer_id;

  -- ─── Get viewer interest IDs for shared-interest calculation ─────────
  select array_agg(interest_id) into v_viewer_interest_ids
    from public.profile_interests
    where profile_id = v_viewer_profile_id;

  -- ─── Build exclusion set ────────────────────────────────────────────
  with block_pairs as (
    select blocker_id as blocked from public.blocks where blocker_id = p_viewer_id
    union
    select blocked_id as blocked from public.blocks where blocker_id = p_viewer_id
    union
    select blocker_id as blocked from public.blocks where blocked_id = p_viewer_id
  )
  select array_agg(blocked) into v_excluded_ids from block_pairs;

  v_excluded_ids := coalesce(v_excluded_ids, '{}');
  v_excluded_ids := array_append(v_excluded_ids, p_viewer_id);

  if p_mode = 'dating' then
    with dating_excluded as (
      select target_id from public.dating_actions where actor_id = p_viewer_id
    )
    select array_cat(v_excluded_ids, coalesce(array(select target_id from dating_excluded), '{}'))
    into v_excluded_ids;
  end if;

  -- ─── Candidate profiles CTE ─────────────────────────────────────────
  return query
  with candidate_profiles as (
    select
      u.id as uid,
      u.display_name,
      u.telegram_username,
      p.bio,
      p.city,
      extract(year from age(current_date, p.date_of_birth))::int as cand_age,
      p.dating_intent::text,
      p.gender::text,
      p.profile_completion_pct,
      p.is_verified,
      p.latitude,
      p.longitude,
      p.created_at,
      p.search_vector,
      u.last_seen_at,
      -- Pre-calculate distance
      case
        when p.latitude is not null and p.longitude is not null
          and exists (
            select 1 from public.profiles
            where user_id = p_viewer_id
              and latitude is not null and longitude is not null
          )
        then public.haversine_distance(
          (select latitude from public.profiles where user_id = p_viewer_id),
          (select longitude from public.profiles where user_id = p_viewer_id),
          p.latitude,
          p.longitude
        )
        else null
      end as cand_distance,
      -- Shared interest count
      (
        select count(*)::bigint
        from public.profile_interests pi
        where pi.profile_id = p.id
          and pi.interest_id = any(v_viewer_interest_ids)
      ) as shared_interest_count
    from public.users u
    inner join public.profiles p on p.user_id = u.id
    where u.is_active = true
      and u.is_banned = false
      and p.profile_visibility = 'public'
      and p.profile_completion_pct >= 30
      and p.date_of_birth is not null
      and (v_excluded_ids is null or array_length(v_excluded_ids, 1) = 0 or u.id != all(v_excluded_ids))
      -- Full-text search filter
      and (
        p_query is null
        or p_query = ''
        or p.search_vector @@ plainto_tsquery('english', p_query)
        or u.display_name ilike '%' || p_query || '%'
        or u.telegram_username ilike '%' || p_query || '%'
      )
      -- Interest filter
      and (
        p_interest_ids is null
        or array_length(p_interest_ids, 1) is null
        or exists (
          select 1 from public.profile_interests pi
          where pi.profile_id = p.id
            and pi.interest_id = any(p_interest_ids)
        )
      )
      -- Dating mode: age filter
      and (
        p_mode != 'dating'
        or extract(year from age(current_date, p.date_of_birth)) >= p_min_age
      )
      and (
        p_mode != 'dating'
        or extract(year from age(current_date, p.date_of_birth)) <= p_max_age
      )
      -- Dating mode: gender filter
      and (
        p_mode != 'dating'
        or p_preferred_genders is null
        or array_length(p_preferred_genders, 1) is null
        or p.gender::text = any(p_preferred_genders)
      )
      -- Distance filter
      and (
        p_max_distance_km <= 0
        or p.latitude is null
        or p.longitude is null
        or cand_distance is null
        or cand_distance <= p_max_distance_km
      )
  ),
  scored_profiles as (
    select
      cp.*,
      round((
        coalesce(cp.shared_interest_count::numeric, 0) * 10 +
        case
          when cp.last_seen_at is not null
            and extract(epoch from (now() - cp.last_seen_at)) / 3600 < 24
          then 50 * 0.3
          when cp.last_seen_at is not null
            and extract(epoch from (now() - cp.last_seen_at)) / 3600 < 168
          then 30 * 0.3
          else 10 * 0.3
        end +
        cp.profile_completion_pct::numeric * 0.15 +
        case
          when cp.cand_distance is not null and p_max_distance_km > 0
          then greatest(0, (1 - cp.cand_distance / p_max_distance_km) * 100) * 0.10
          else 30 * 0.10
        end +
        case when cp.is_verified then 10 else 0 end
      )::numeric, 2) as score
    from candidate_profiles cp
  )
  select
    sp.uid,
    sp.display_name,
    sp.telegram_username,
    sp.bio,
    sp.city,
    sp.cand_age,
    sp.dating_intent,
    sp.gender,
    sp.profile_completion_pct,
    sp.is_verified,
    round(sp.cand_distance::numeric, 1),
    sp.shared_interest_count,
    sp.score,
    sp.created_at
  from scored_profiles sp
  -- Cursor-based pagination: filter by score then by uid (tiebreaker)
  where (
    p_cursor_score is null
    or p_cursor_id is null
    or (sp.score < p_cursor_score or (sp.score = p_cursor_score and sp.uid::text < p_cursor_id))
  )
  order by
    sp.score desc,
    sp.created_at desc,
    sp.uid desc
  limit p_limit;
end;
$$;

-- ============================================================================
-- INDEXES FOR SEARCH PERFORMANCE
-- ============================================================================

-- Index for active users (frequent query pattern)
create index if not exists users_active_search_idx on public.users (is_active, is_banned)
  where is_active = true and is_banned = false;

-- ============================================================================
-- GRANT EXECUTION
-- ============================================================================

-- Grant execute to authenticated users
grant execute on function public.discover_profiles to authenticated;
