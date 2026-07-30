-- Vibe Database — Dating Discovery Engine (Prompt 07)
-- Adds:
--   - Haversine distance function (for when PostGIS is unavailable)
--   - Intent compatibility function
--   - Discovery-specific indexes
--   - Discovery eligibility helper function

-- ============================================================================
-- HAVERSINE DISTANCE FUNCTION
-- ============================================================================
-- Calculates great-circle distance between two points on Earth.
-- Returns distance in kilometers.
-- Used when PostGIS extension is not available.
create or replace function public.haversine_distance(
  lat1 numeric,
  lon1 numeric,
  lat2 numeric,
  lon2 numeric
)
returns numeric
language sql
immutable
as $$
  select 6371 * 2 * asin(
    sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
    )
  );
$$;

-- ============================================================================
-- INTENT COMPATIBILITY FUNCTION
-- ============================================================================
-- Determines if two dating intents are compatible.
-- Uses a simple compatibility matrix.
create or replace function public.is_intent_compatible(
  intent_a dating_intent,
  intent_b dating_intent
)
returns boolean
language sql
immutable
as $$
  select case
    when intent_a = 'dating' then intent_b in ('dating', 'relationship', 'not_sure')
    when intent_a = 'friendship' then intent_b in ('friendship', 'chat', 'not_sure')
    when intent_a = 'chat' then intent_b in ('friendship', 'chat', 'not_sure')
    when intent_a = 'relationship' then intent_b in ('dating', 'relationship', 'not_sure')
    when intent_a = 'not_sure' then true
    else false
  end;
$$;

-- ============================================================================
-- DISCOVERY INDEXES
-- ============================================================================

-- Composite index for discovery: discoverable profiles with gender
-- Partial index focusing on discoverable, active profiles
-- This helps the main discovery query filter candidates efficiently
create index if not exists profiles_discovery_idx on public.profiles (
  gender,
  dating_intent,
  profile_completion_pct desc
) where profile_visibility = 'public'
  and profile_completion_pct >= 50
  and dating_intent is not null
  and gender is not null
  and date_of_birth is not null;

-- Active user index for discovery
create index if not exists users_discovery_active_idx on public.users (last_seen_at desc)
  where is_active = true and is_banned = false;

-- Index for checking existing dating actions quickly
create index if not exists dating_actions_actor_target_idx on public.dating_actions (actor_id, target_id);

-- Index for profile photo discovery (at least one photo)
create index if not exists profile_photos_discovery_idx on public.profile_photos (user_id, is_primary)
  where is_primary = true;

-- ============================================================================
-- DISCOVERY ELIGIBILITY FUNCTION
-- ============================================================================
-- Check if a user meets the minimum requirements for dating discovery.
-- Returns (eligible boolean, reason text).
create or replace function public.check_discovery_eligibility(
  p_user_id uuid
)
returns table (eligible boolean, reason text)
language plpgsql
stable
as $$
declare
  v_user record;
  v_profile record;
  v_prefs record;
begin
  -- Get user
  select * into v_user from public.users where id = p_user_id;
  
  if not found then
    return query select false::boolean, 'ACCOUNT_RESTRICTED'::text;
    return;
  end if;

  -- Check banned
  if v_user.is_banned then
    return query select false::boolean, 'ACCOUNT_RESTRICTED'::text;
    return;
  end if;

  -- Check active
  if not v_user.is_active then
    return query select false::boolean, 'ACCOUNT_RESTRICTED'::text;
    return;
  end if;

  -- Get profile
  select * into v_profile from public.profiles where user_id = p_user_id;

  if not found then
    return query select false::boolean, 'PROFILE_INCOMPLETE'::text;
    return;
  end if;

  -- Check underage
  if v_profile.date_of_birth is not null and 
     extract(year from age(current_date, v_profile.date_of_birth)) < 18 then
    return query select false::boolean, 'UNDERAGE'::text;
    return;
  end if;

  -- Check DOB exists
  if v_profile.date_of_birth is null then
    return query select false::boolean, 'PROFILE_INCOMPLETE'::text;
    return;
  end if;

  -- Check profile completeness
  if v_profile.profile_completion_pct < 50 then
    return query select false::boolean, 'PROFILE_INCOMPLETE'::text;
    return;
  end if;

  -- Check basic fields exist
  if v_profile.gender is null or v_profile.dating_intent is null then
    return query select false::boolean, 'PROFILE_INCOMPLETE'::text;
    return;
  end if;

  -- Check at least one profile photo
  if not exists (select 1 from public.profile_photos where user_id = p_user_id) then
    return query select false::boolean, 'PROFILE_INCOMPLETE'::text;
    return;
  end if;

  -- Get preferences
  select * into v_prefs from public.profile_preferences where user_id = p_user_id;

  if found and not v_prefs.discovery_enabled then
    return query select false::boolean, 'DISCOVERY_DISABLED'::text;
    return;
  end if;

  -- All checks passed
  return query select true::boolean, null::text;
end;
$$;
