-- Vibe Database — Ad System + Monetization Engine Foundation (Prompt 17)
-- First-party ad infrastructure supporting:
--   - Ad placements (feed_inline, discovery_inline, story_between, profile_sponsored)
--   - Advertiser accounts
--   - Campaigns (CPM/CPC foundation)
--   - Creatives (image, video, native, profile)
--   - Campaign targeting (country, language, age, interests, gender)
--   - Frequency caps (per campaign, per placement)
--   - Impression tracking (with viewability foundation)
--   - Click tracking (with fraud protection)
--   - Conversion tracking foundation
--   - Revenue accounting foundation
--   - Premium remove_ads integration
--   - Moderation integration
--   - Admin management

-- ============================================================================
-- ENUMS
-- ============================================================================

do $$ begin
  create type advertiser_status as enum ('pending', 'active', 'suspended', 'rejected', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type campaign_status as enum ('draft', 'pending_review', 'approved', 'active', 'paused', 'completed', 'rejected', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type campaign_objective as enum ('brand_awareness', 'profile_visits', 'website_clicks', 'app_actions', 'conversions');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type campaign_budget_type as enum ('total', 'daily');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type creative_type as enum ('image', 'video', 'native', 'profile');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type creative_status as enum ('pending', 'approved', 'rejected', 'active', 'paused', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type destination_type as enum ('internal_profile', 'internal_post', 'internal_page', 'external_url');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type pricing_model as enum ('cpm', 'cpc');
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- AD PLACEMENTS — Inventory registry
-- ============================================================================
create table if not exists public.ad_placements (
  id                uuid        default gen_random_uuid() primary key,
  key               text        not null unique,   -- 'feed_inline', 'discovery_inline', etc.
  name              text        not null,
  description       text,
  location          text        not null,           -- 'feed', 'discovery', 'stories', 'profile'
  format            text        not null,           -- 'native', 'banner', 'card', 'story', 'sponsored_profile'
  is_active         boolean     not null default true,
  max_frequency     integer,                        -- max impressions per user per window (null = global campaign cap)
  frequency_window_seconds integer default 86400,   -- default 24 hours
  allowed_creative_types text[] not null default '{}',
  metadata          jsonb       default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Default placements
insert into public.ad_placements (key, name, description, location, format, allowed_creative_types) values
  ('feed_inline', 'Feed Inline', 'Native ad card in the social feed', 'feed', 'native', '{image, video, native}'),
  ('feed_after_5', 'Feed After 5 Posts', 'First ad after 5 organic posts', 'feed', 'native', '{image, video, native}'),
  ('discovery_inline', 'Discovery Inline', 'Sponsored card in dating discovery', 'discovery', 'card', '{image, profile}'),
  ('story_between', 'Story Between', 'Ad between stories in the viewer', 'stories', 'story', '{image, video}'),
  ('profile_sponsored', 'Sponsored Profile', 'Promoted profile card', 'profile', 'sponsored_profile', '{profile}')
on conflict (key) do nothing;

-- ============================================================================
-- ADVERTISERS
-- ============================================================================
create table if not exists public.advertisers (
  id                uuid                default gen_random_uuid() primary key,
  owner_user_id     uuid                not null references public.users(id) on delete cascade,
  business_name     text                not null,
  status            advertiser_status   not null default 'pending',
  verification_status text              not null default 'unverified'
                    check (verification_status in ('unverified', 'verified')),
  contact_email     text,
  metadata          jsonb               default '{}'::jsonb,
  created_at        timestamptz         not null default now(),
  updated_at        timestamptz         not null default now()
);

create index if not exists advertisers_owner_idx on public.advertisers (owner_user_id);
create index if not exists advertisers_status_idx on public.advertisers (status);

-- ============================================================================
-- AD CAMPAIGNS
-- ============================================================================
create table if not exists public.ad_campaigns (
  id                uuid                    default gen_random_uuid() primary key,
  advertiser_id     uuid                    not null references public.advertisers(id) on delete cascade,
  name              text                    not null,
  objective         campaign_objective      not null default 'brand_awareness',
  status            campaign_status         not null default 'draft',
  pricing_model     pricing_model           not null default 'cpm',
  -- Budget (stored in minor currency units — cents for fiat, integer Stars for XTR)
  budget_type       campaign_budget_type    not null default 'total',
  budget_amount     bigint                  not null check (budget_amount > 0),
  spent_amount      bigint                  not null default 0 check (spent_amount >= 0),
  currency          text                    not null default 'XTR',
  start_at          timestamptz             not null,
  end_at            timestamptz             not null,
  -- CPM/CPC rates (in minor units per 1000 impressions / per click)
  cpm_rate          integer,                -- Price per 1000 impressions (nullable for CPC campaigns)
  cpc_rate          integer,                -- Price per click (nullable for CPM campaigns)
  -- Priority (higher = more likely to serve, 0-100)
  priority          integer                 not null default 0 check (priority >= 0 and priority <= 100),
  -- House campaign flag (Vibe's own promotions)
  is_house_campaign boolean                 not null default false,
  -- Moderation
  reviewed_by       uuid                    references public.users(id) on delete set null,
  reviewed_at       timestamptz,
  rejection_reason  text,
  metadata          jsonb                   default '{}'::jsonb,
  created_at        timestamptz             not null default now(),
  updated_at        timestamptz             not null default now(),

  constraint ad_campaigns_dates_check check (end_at > start_at)
);

create index if not exists ad_campaigns_advertiser_idx on public.ad_campaigns (advertiser_id);
create index if not exists ad_campaigns_status_idx on public.ad_campaigns (status) where status = 'active';
create index if not exists ad_campaigns_active_idx on public.ad_campaigns (status, start_at, end_at)
  where status = 'active';
create index if not exists ad_campaigns_house_idx on public.ad_campaigns (is_house_campaign) where is_house_campaign = true;

-- ============================================================================
-- CAMPAIGN TARGETING
-- ============================================================================
create table if not exists public.ad_campaign_targeting (
  id                uuid        default gen_random_uuid() primary key,
  campaign_id       uuid        not null references public.ad_campaigns(id) on delete cascade unique,
  -- Geographic targeting
  countries         text[]      default '{}',   -- ISO country codes
  -- Language targeting
  languages         text[]      default '{}',   -- ISO language codes
  -- Demographic targeting
  age_min           integer,                     -- minimum age (null = no minimum)
  age_max           integer,                     -- maximum age (null = no maximum)
  genders           text[]      default '{}',   -- 'male', 'female', 'non_binary'
  -- Interest targeting
  interest_ids      uuid[]      default '{}',   -- references interests.id
  -- Relationship intent targeting (dating)
  dating_intents    text[]      default '{}',   -- 'dating', 'friendship', 'relationship', etc.
  -- Platform
  platform          text,                        -- 'telegram', 'web', null = all
  -- Custom JSON for future extensibility
  targeting_json    jsonb       default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================================
-- AD CREATIVES
-- ============================================================================
create table if not exists public.ad_creatives (
  id                uuid                default gen_random_uuid() primary key,
  campaign_id       uuid                not null references public.ad_campaigns(id) on delete cascade,
  type              creative_type       not null,
  -- Content fields
  headline          text                not null,
  body              text,
  -- Media (reuse existing media pipeline)
  media_id          uuid                references public.media(id) on delete set null,
  thumbnail_media_id uuid               references public.media(id) on delete set null,
  -- Destination
  destination_type  destination_type    not null default 'internal_page',
  destination_url   text,               -- For external_url destinations
  destination_page  text,               -- For internal_page: 'premium', 'discover', etc.
  destination_profile_id uuid,          -- For internal_profile
  destination_post_id  uuid,            -- For internal_post
  -- CTA
  cta               text,               -- Call to action text (predefined values preferred)
  -- Status
  status            creative_status     not null default 'pending',
  reviewed_by       uuid                references public.users(id) on delete set null,
  reviewed_at       timestamptz,
  rejection_reason  text,
  metadata          jsonb               default '{}'::jsonb,
  created_at        timestamptz         not null default now(),
  updated_at        timestamptz         not null default now()
);

create index if not exists ad_creatives_campaign_idx on public.ad_creatives (campaign_id);
create index if not exists ad_creatives_status_idx on public.ad_creatives (status) where status = 'active';
create index if not exists ad_creatives_type_idx on public.ad_creatives (type);

-- ============================================================================
-- CAMPAIGN-PLACEMENT MAPPING
-- ============================================================================
create table if not exists public.ad_campaign_placements (
  campaign_id   uuid    not null references public.ad_campaigns(id) on delete cascade,
  placement_id  uuid    not null references public.ad_placements(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (campaign_id, placement_id)
);

-- ============================================================================
-- FREQUENCY CAPS — Per-campaign, per-placement limits
-- ============================================================================
create table if not exists public.ad_frequency_caps (
  id                uuid        default gen_random_uuid() primary key,
  campaign_id       uuid        not null references public.ad_campaigns(id) on delete cascade,
  placement_key     text,                        -- null = applies to all placements
  window_seconds    integer     not null default 86400,  -- time window in seconds
  max_impressions   integer     not null default 3,      -- max impressions per window
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists ad_frequency_caps_campaign_idx on public.ad_frequency_caps (campaign_id);

-- ============================================================================
-- AD IMPRESSIONS
-- ============================================================================
create table if not exists public.ad_impressions (
  id                uuid        default gen_random_uuid() primary key,
  ad_id             uuid        not null references public.ad_creatives(id) on delete cascade,
  campaign_id       uuid        not null references public.ad_campaigns(id) on delete cascade,
  user_id           uuid        not null references public.users(id) on delete cascade,
  placement         text        not null,         -- placement key
  request_id        text,                         -- server-generated ad request context
  session_id        text,                         -- client session identifier
  event_id          text,                         -- client-generated dedup ID
  client_ip         text,                         -- X-Forwarded-For / request IP
  user_agent        text,
  served_at         timestamptz not null default now(),
  viewed_at         timestamptz,                   -- when ad entered viewport (client report)
  viewability_pct   integer,                       -- how much was visible (0-100)
  created_at        timestamptz not null default now()
);

create index if not exists ad_impressions_campaign_idx on public.ad_impressions (campaign_id);
create index if not exists ad_impressions_user_idx on public.ad_impressions (user_id);
create index if not exists ad_impressions_ad_idx on public.ad_impressions (ad_id);
create index if not exists ad_impressions_event_dedup_idx on public.ad_impressions (event_id)
  where event_id is not null;
create index if not exists ad_impressions_request_idx on public.ad_impressions (request_id)
  where request_id is not null;
create index if not exists ad_impressions_created_idx on public.ad_impressions (created_at desc);

-- ============================================================================
-- AD CLICKS
-- ============================================================================
create table if not exists public.ad_clicks (
  id                uuid        default gen_random_uuid() primary key,
  ad_id             uuid        not null references public.ad_creatives(id) on delete cascade,
  campaign_id       uuid        not null references public.ad_campaigns(id) on delete cascade,
  user_id           uuid        not null references public.users(id) on delete cascade,
  impression_id     uuid        references public.ad_impressions(id) on delete set null,
  placement         text        not null,
  request_id        text,                         -- ad request context from impression
  event_id          text,                         -- client-generated dedup ID
  client_ip         text,
  user_agent        text,
  clicked_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create unique index if not exists ad_clicks_event_dedup_idx on public.ad_clicks (event_id)
  where event_id is not null;
create index if not exists ad_clicks_campaign_idx on public.ad_clicks (campaign_id);
create index if not exists ad_clicks_user_idx on public.ad_clicks (user_id);
create index if not exists ad_clicks_impression_idx on public.ad_clicks (impression_id);
create index if not exists ad_clicks_created_idx on public.ad_clicks (clicked_at desc);

-- ============================================================================
-- AD CONVERSIONS (future-ready)
-- ============================================================================
create table if not exists public.ad_conversions (
  id                uuid        default gen_random_uuid() primary key,
  campaign_id       uuid        not null references public.ad_campaigns(id) on delete cascade,
  ad_id             uuid        references public.ad_creatives(id) on delete set null,
  user_id           uuid        not null references public.users(id) on delete cascade,
  impression_id     uuid        references public.ad_impressions(id) on delete set null,
  click_id          uuid        references public.ad_clicks(id) on delete set null,
  conversion_type   text        not null,         -- 'signup', 'purchase', 'profile_visit', etc.
  attribution_window_hours integer not null default 30,
  created_at        timestamptz not null default now()
);

create index if not exists ad_conversions_campaign_idx on public.ad_conversions (campaign_id);
create index if not exists ad_conversions_user_idx on public.ad_conversions (user_id);

-- ============================================================================
-- AD REVENUE EVENTS — Track monetization
-- ============================================================================
create table if not exists public.ad_revenue_events (
  id                uuid        default gen_random_uuid() primary key,
  campaign_id       uuid        not null references public.ad_campaigns(id) on delete cascade,
  ad_id             uuid        references public.ad_creatives(id) on delete set null,
  event_type        text        not null check (event_type in ('impression', 'click', 'conversion')),
  amount_minor      bigint      not null default 0,
  currency          text        not null default 'XTR',
  metadata          jsonb       default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists ad_revenue_events_campaign_idx on public.ad_revenue_events (campaign_id);
create index if not exists ad_revenue_events_type_idx on public.ad_revenue_events (event_type);

-- ============================================================================
-- CAMPAIGN PLACEMENT RULES — Per-placement display rules per campaign
-- ============================================================================
create table if not exists public.ad_placement_rules (
  id                  uuid        default gen_random_uuid() primary key,
  campaign_id         uuid        not null references public.ad_campaigns(id) on delete cascade,
  placement_key       text        not null,
  min_organic_count   integer     default 5,       -- min organic items before first ad
  spacing_min         integer     default 8,       -- min organic items between ads
  max_per_session     integer     default 2,       -- max times this campaign shows per session
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (campaign_id, placement_key)
);

-- ============================================================================
-- TRIGGER: set_updated_at for new tables
-- ============================================================================
create trigger set_updated_at before update on public.ad_placements
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.advertisers
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.ad_campaigns
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.ad_campaign_targeting
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.ad_creatives
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.ad_frequency_caps
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.ad_placement_rules
  for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCTION: get_eligible_ad — Get an eligible ad for a user+placement
-- ============================================================================
-- Returns the best eligible creative for a given user and placement.
-- Called by the ad delivery service.
create or replace function public.get_eligible_ad(
  p_user_id uuid,
  p_placement_key text,
  p_countries text[] default null,
  p_languages text[] default null,
  p_interest_ids uuid[] default null,
  p_gender text default null,
  p_age integer default null,
  p_exclude_campaign_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_result jsonb;
  v_user_age integer;
  v_user_gender text;
  v_user_country text;
  v_user_language text;
  v_has_remove_ads boolean;
begin
  -- Check if user has remove_ads entitlement
  select exists (
    select 1 from public.premium_entitlements
    where user_id = p_user_id
      and feature_key = 'remove_ads'
      and status = 'active'
      and (expires_at is null or expires_at > now())
  ) into v_has_remove_ads;

  if v_has_remove_ads then
    return jsonb_build_object('eligible', false, 'reason', 'premium_user');
  end if;

  -- Determine user demographics for targeting lookup (from profiles)
  select extract(year from age(p.date_of_birth))::integer, p.gender
  into v_user_age, v_user_gender
  from public.profiles p
  where p.user_id = p_user_id;

  -- Find eligible campaign + creative (with targeting checks)
  select jsonb_build_object(
    'campaign_id', c.id,
    'advertiser_id', c.advertiser_id,
    'creative_id', cr.id,
    'creative_type', cr.type,
    'headline', cr.headline,
    'body', cr.body,
    'media_id', cr.media_id,
    'thumbnail_media_id', cr.thumbnail_media_id,
    'destination_type', cr.destination_type,
    'destination_url', cr.destination_url,
    'destination_page', cr.destination_page,
    'cta', cr.cta,
    'pricing_model', c.pricing_model,
    'cpm_rate', c.cpm_rate,
    'cpc_rate', c.cpc_rate,
    'sponsored_label', 'Sponsored',
    'is_house_campaign', c.is_house_campaign
  ) into v_result
  from public.ad_campaigns c
  join public.ad_creatives cr on cr.campaign_id = c.id and cr.status = 'active'
  join public.advertisers a on a.id = c.advertiser_id and a.status = 'active'
  join public.ad_campaign_placements cp on cp.campaign_id = c.id
  join public.ad_placements p on p.id = cp.placement_id and p.key = p_placement_key
  where c.status = 'active'
    and c.start_at <= now()
    and c.end_at > now()
    and c.spent_amount < c.budget_amount
    and not exists (select 1 from unnest(p_exclude_campaign_ids) as eid where eid = c.id)
    -- Check frequency cap
    and not exists (
      select 1 from public.ad_frequency_caps fc
      where fc.campaign_id = c.id
        and (fc.placement_key is null or fc.placement_key = p_placement_key)
        and (
          select count(*) from public.ad_impressions i
          where i.campaign_id = fc.campaign_id
            and i.user_id = p_user_id
            and (fc.placement_key is null or i.placement = fc.placement_key)
            and i.created_at > now() - (fc.window_seconds || ' seconds')::interval
        ) >= fc.max_impressions
    )
    -- Apply targeting filtering from ad_campaign_targeting table
    and not exists (
      select 1 from public.ad_campaign_targeting t
      where t.campaign_id = c.id
        and (
          -- Check country targeting
          (t.countries is not null and array_length(t.countries, 1) > 0
            and (p_countries is null or not (t.countries && p_countries)))
          or
          -- Check age targeting
          (t.age_min is not null and (v_user_age is null or v_user_age < t.age_min))
          or
          -- Check age targeting (max)
          (t.age_max is not null and (v_user_age is null or v_user_age > t.age_max))
          or
          -- Check gender targeting
          (t.genders is not null and array_length(t.genders, 1) > 0
            and (v_user_gender is null or not (v_user_gender = any(t.genders))))
        )
    )
  order by c.priority desc, c.created_at asc
  limit 1;

  if v_result is null then
    return jsonb_build_object('eligible', false, 'reason', 'no_inventory');
  end if;

  return jsonb_build_object('eligible', true, 'ad', v_result);
end;
$$;

-- ============================================================================
-- FUNCTION: record_ad_spend — Atomically increment campaign spent amount
-- ============================================================================
create or replace function public.record_ad_spend(
  p_campaign_id uuid,
  p_amount bigint
)
returns boolean
language plpgsql
as $$
declare
  v_current_spent bigint;
  v_budget bigint;
begin
  select spent_amount, budget_amount into v_current_spent, v_budget
  from public.ad_campaigns
  where id = p_campaign_id
  for update; -- Lock row for atomic update

  if v_current_spent + p_amount > v_budget then
    return false; -- Budget exceeded
  end if;

  update public.ad_campaigns
  set spent_amount = spent_amount + p_amount,
      updated_at = now()
  where id = p_campaign_id;

  return true;
end;
$$;

-- ============================================================================
-- FUNCTION: log_ad_revenue_event — Record a revenue event and update spend
-- ============================================================================
create or replace function public.log_ad_revenue_event(
  p_campaign_id uuid,
  p_ad_id uuid,
  p_event_type text,
  p_amount_minor bigint,
  p_currency text default 'XTR'
)
returns uuid
language plpgsql
as $$
declare
  v_event_id uuid;
begin
  insert into public.ad_revenue_events (campaign_id, ad_id, event_type, amount_minor, currency)
  values (p_campaign_id, p_ad_id, p_event_type, p_amount_minor, p_currency)
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- ============================================================================
-- FUNCTION: expire_stale_campaigns — Mark campaigns as completed
-- ============================================================================
create or replace function public.expire_stale_campaigns()
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  update public.ad_campaigns
  set status = 'completed',
      updated_at = now()
  where status = 'active'
    and (end_at <= now() or spent_amount >= budget_amount);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================================
-- FUNCTION: suspend_advertiser_campaigns — Pause all campaigns for an advertiser
-- ============================================================================
create or replace function public.suspend_advertiser_campaigns(
  p_advertiser_id uuid
)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  update public.ad_campaigns
  set status = 'paused',
      updated_at = now()
  where advertiser_id = p_advertiser_id
    and status in ('active', 'approved');

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- ad_placements: publicly readable
alter table public.ad_placements enable row level security;

create policy "Anyone can read ad placements"
  on public.ad_placements for select
  using (true);

-- advertisers: users can see their own, admins can see all
alter table public.advertisers enable row level security;

create policy "Users can see own advertiser"
  on public.advertisers for select
  using (owner_user_id = auth.uid());

create policy "Users can create advertiser"
  on public.advertisers for insert
  with check (owner_user_id = auth.uid());

create policy "Admins can see all advertisers"
  on public.advertisers for select
  using (public.is_admin());

create policy "Admins can manage advertisers"
  on public.advertisers for all
  using (public.is_admin())
  with check (public.is_admin());

-- ad_campaigns: advertisers see own, admins see all
alter table public.ad_campaigns enable row level security;

create policy "Advertisers can see own campaigns"
  on public.ad_campaigns for select
  using (exists (
    select 1 from public.advertisers
    where id = advertiser_id and owner_user_id = auth.uid()
  ));

create policy "Advertisers can create campaigns"
  on public.ad_campaigns for insert
  with check (exists (
    select 1 from public.advertisers
    where id = advertiser_id and owner_user_id = auth.uid()
  ));

create policy "Advertisers can update own campaigns"
  on public.ad_campaigns for update
  using (exists (
    select 1 from public.advertisers
    where id = advertiser_id and owner_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.advertisers
    where id = advertiser_id and owner_user_id = auth.uid()
  ));

create policy "Admins can see all campaigns"
  on public.ad_campaigns for select
  using (public.is_admin());

create policy "Admins can manage all campaigns"
  on public.ad_campaigns for all
  using (public.is_admin())
  with check (public.is_admin());

-- ad_campaign_targeting: same ownership as campaigns
alter table public.ad_campaign_targeting enable row level security;

create policy "Admins can manage targeting"
  on public.ad_campaign_targeting for all
  using (public.is_admin())
  with check (public.is_admin());

-- ad_creatives: advertisers see own, admins see all
alter table public.ad_creatives enable row level security;

create policy "Advertisers can see own creatives"
  on public.ad_creatives for select
  using (exists (
    select 1 from public.ad_campaigns c
    join public.advertisers a on a.id = c.advertiser_id
    where c.id = campaign_id and a.owner_user_id = auth.uid()
  ));

create policy "Advertisers can create creatives"
  on public.ad_creatives for insert
  with check (exists (
    select 1 from public.ad_campaigns c
    join public.advertisers a on a.id = c.advertiser_id
    where c.id = campaign_id and a.owner_user_id = auth.uid()
  ));

create policy "Admins can manage creatives"
  on public.ad_creatives for all
  using (public.is_admin())
  with check (public.is_admin());

-- ad_impressions: write-only for server, read for admins
alter table public.ad_impressions enable row level security;

create policy "Server-side impression creation"
  on public.ad_impressions for insert
  with check (true);

create policy "Admins can read impressions"
  on public.ad_impressions for select
  using (public.is_admin());

create policy "Users can see own impressions"
  on public.ad_impressions for select
  using (user_id = auth.uid());

-- ad_clicks: write-only for server, read for admins
alter table public.ad_clicks enable row level security;

create policy "Server-side click creation"
  on public.ad_clicks for insert
  with check (true);

create policy "Admins can read clicks"
  on public.ad_clicks for select
  using (public.is_admin());

-- ad_conversions: server-side only
alter table public.ad_conversions enable row level security;

create policy "Server-side conversion creation"
  on public.ad_conversions for insert
  with check (public.is_admin());

create policy "Admins can read conversions"
  on public.ad_conversions for select
  using (public.is_admin());

-- ad_revenue_events: server-side only
alter table public.ad_revenue_events enable row level security;

create policy "Server-side revenue events"
  on public.ad_revenue_events for insert
  with check (public.is_admin());

create policy "Admins can read revenue events"
  on public.ad_revenue_events for select
  using (public.is_admin());

-- ad_frequency_caps: admin managed
alter table public.ad_frequency_caps enable row level security;

create policy "Admins can manage frequency caps"
  on public.ad_frequency_caps for all
  using (public.is_admin())
  with check (public.is_admin());

-- ad_campaign_placements: advertisers see own, admins manage
alter table public.ad_campaign_placements enable row level security;

create policy "Admins can manage campaign placements"
  on public.ad_campaign_placements for all
  using (public.is_admin())
  with check (public.is_admin());

-- ad_placement_rules: admin managed
alter table public.ad_placement_rules enable row level security;

create policy "Admins can manage placement rules"
  on public.ad_placement_rules for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- UPDATE ADMIN PERMISSIONS — Add ad system permissions
-- ============================================================================
insert into public.admin_permissions (role, permissions) values
  ('super_admin', ARRAY[
    'users.view', 'users.restrict', 'users.suspend', 'users.ban',
    'content.view', 'content.remove', 'content.restore',
    'reports.view', 'reports.resolve',
    'appeals.view', 'appeals.resolve',
    'analytics.view',
    'audit.view',
    'admin.manage',
    'admin.notes',
    'reports.assign',
    'billing.view', 'billing.reconcile', 'billing.manage_plans',
    'billing.grant_entitlement', 'billing.revoke_entitlement',
    'ads.view', 'ads.review', 'ads.manage_campaigns', 'ads.manage_advertisers',
    'ads.manage_placements', 'ads.view_reports'
  ]),
  ('admin', ARRAY[
    'users.view', 'users.restrict', 'users.suspend', 'users.ban',
    'content.view', 'content.remove', 'content.restore',
    'reports.view', 'reports.resolve',
    'appeals.view', 'appeals.resolve',
    'analytics.view',
    'audit.view',
    'admin.notes',
    'reports.assign',
    'billing.view', 'billing.reconcile',
    'ads.view', 'ads.review', 'ads.manage_campaigns', 'ads.view_reports'
  ])
on conflict (role) do update set permissions = excluded.permissions, updated_at = now();
