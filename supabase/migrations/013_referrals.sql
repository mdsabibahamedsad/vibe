-- Vibe Database — Referrals
-- Referral/affiliate system for user acquisition tracking.

-- ============================================================================
-- REFERRAL CODES — Unique codes generated for each user
-- ============================================================================
create table public.referral_codes (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        not null references public.users(id) on delete cascade unique,
  code        text        not null unique,
  usage_count integer     not null default 0,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

create index referral_codes_code_idx on public.referral_codes (code);

-- ============================================================================
-- REFERRALS — Records of successful referrals
-- ============================================================================
create table public.referrals (
  id                uuid        default gen_random_uuid() primary key,
  referrer_id       uuid        not null references public.users(id) on delete cascade,
  referred_user_id  uuid        not null references public.users(id) on delete cascade unique,
  referral_code_id  uuid        references public.referral_codes(id) on delete set null,
  source            text,       -- 'direct_link', 'share', 'qr_code'
  created_at        timestamptz not null default now(),

  -- Prevent self-referral
  constraint referrals_no_self_check check (referrer_id != referred_user_id)
);

create index referrals_referrer_id_idx on public.referrals (referrer_id);

-- ============================================================================
-- REFERRAL REWARDS — Rewards earned through referrals
-- ============================================================================
create table public.referral_rewards (
  id            uuid                    default gen_random_uuid() primary key,
  referral_id   uuid                    not null references public.referrals(id) on delete cascade,
  reward_type   text                    not null, -- 'premium_days', 'super_likes', 'boosts'
  amount        integer                 not null default 1,
  status        referral_reward_status  not null default 'pending',
  awarded_at    timestamptz,
  created_at    timestamptz             not null default now()
);

create index referral_rewards_status_idx on public.referral_rewards (status);
