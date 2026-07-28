-- Vibe Database — Identity & Profiles
-- Core identity table linked to Telegram authentication,
-- plus extended profile data and discovery preferences.

-- ============================================================================
-- USERS — Application-level user identity
-- ============================================================================
-- This is the primary user table. All other user-facing tables reference this.
-- The telegram_user_id is the stable Telegram identifier used for auth.
create table public.users (
  id                uuid          default gen_random_uuid() primary key,
  telegram_user_id  bigint        not null unique,
  telegram_username text,
  display_name      text          not null,
  first_name        text,
  last_name         text,
  avatar_media_id   text,
  role              user_role     not null default 'user',
  is_active         boolean       not null default true,
  is_banned         boolean       not null default false,
  last_seen_at      timestamptz,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),

  -- Ensure telegram_user_id is positive
  constraint users_telegram_user_id_check check (telegram_user_id > 0)
);

-- Index on telegram_user_id for fast auth lookups
create index users_telegram_user_id_idx on public.users (telegram_user_id);
create index users_role_idx on public.users (role);

-- ============================================================================
-- PROFILES — Extended user profile data (separated from identity)
-- ============================================================================
create table public.profiles (
  id                uuid                default gen_random_uuid() primary key,
  user_id           uuid                not null references public.users(id) on delete cascade unique,
  bio               text,
  date_of_birth     date,
  gender            gender,
  city              text,
  country           text,
  latitude          numeric             check (latitude >= -90 and latitude <= 90),
  longitude         numeric             check (longitude >= -180 and longitude <= 180),
  dating_intent     dating_intent,
  profile_visibility profile_visibility default 'public',
  online_visibility  online_visibility  default 'everyone',
  is_verified       boolean             not null default false,
  verified_at       timestamptz,
  profile_completion_pct  smallint      not null default 0 check (profile_completion_pct >= 0 and profile_completion_pct <= 100),
  created_at        timestamptz         not null default now(),
  updated_at        timestamptz         not null default now()
);

-- Index for profile discovery queries
create index profiles_gender_idx on public.profiles (gender);
create index profiles_city_idx on public.profiles (city);
create index profiles_country_idx on public.profiles (country);
create index profiles_verified_idx on public.profiles (is_verified) where is_verified = true;

-- ============================================================================
-- PROFILE PHOTOS — Ordered photos on user profiles
-- ============================================================================
create table public.profile_photos (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        not null references public.users(id) on delete cascade,
  media_id    uuid,       -- FK will be added in the media migration (006)
  telegram_file_id  text,
  sort_order  smallint    not null default 0,
  is_primary  boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index profile_photos_user_id_idx on public.profile_photos (user_id);
create index profile_photos_primary_idx on public.profile_photos (user_id, is_primary) where is_primary = true;

-- ============================================================================
-- PROFILE PREFERENCES — Discovery/dating filter preferences
-- ============================================================================
create table public.profile_preferences (
  id                  uuid            default gen_random_uuid() primary key,
  user_id             uuid            not null references public.users(id) on delete cascade unique,
  min_age             smallint        default 18 check (min_age >= 18),
  max_age             smallint        default 60 check (max_age >= min_age),
  preferred_genders   gender[],
  max_distance_km     integer         default 100 check (max_distance_km >= 1),
  dating_intent       dating_intent,
  discovery_enabled   boolean         not null default true,
  show_in_discovery   boolean         not null default true,
  created_at          timestamptz     not null default now(),
  updated_at          timestamptz     not null default now()
);

create index profile_preferences_user_id_idx on public.profile_preferences (user_id);
