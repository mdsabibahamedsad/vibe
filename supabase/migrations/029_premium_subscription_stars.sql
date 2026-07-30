-- Vibe Database — Premium Subscription + Telegram Stars Monetization (Prompt 16)
-- Extends existing payments/subscriptions infrastructure (migration 011) with:
--   - subscription_plans catalog (centralized, DB-driven pricing)
--   - premium_entitlements (per-user, per-feature grants)
--   - payment_transactions (granular per-payment tracking)
--   - payment_events (idempotent webhook/update processing)
--   - RLS policies
--   - Performance indexes
--   - Helper functions for entitlement checking

-- ============================================================================
-- SUBSCRIPTION PLANS CATALOG
-- ============================================================================
-- Centralized plan definitions. Prices come from the database, NOT from code.
-- This ensures plan changes don't require deployments.
create table if not exists public.subscription_plans (
  id                uuid        default gen_random_uuid() primary key,
  slug              text        not null unique,   -- stable identifier: 'premium_monthly', 'premium_yearly'
  name              text        not null,           -- display name: 'Premium Monthly'
  description       text,                           -- short description
  stars_price       integer     not null check (stars_price > 0),  -- price in Telegram Stars (XTR)
  duration_days     integer     not null check (duration_days > 0), -- subscription length in days
  is_active         boolean     not null default true,  -- can be deactivated without deleting
  sort_order        integer     not null default 0,
  features          jsonb       default '[]'::jsonb,   -- list of feature keys included
  metadata          jsonb       default '{}'::jsonb,   -- future extensibility
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists subscription_plans_active_idx on public.subscription_plans (sort_order)
  where is_active = true;

-- ============================================================================
-- SEED DEFAULT PLANS
-- ============================================================================
insert into public.subscription_plans (slug, name, description, stars_price, duration_days, sort_order, features) values
  ('premium_monthly', 'Premium Monthly', 'Unlock premium features for 30 days.', 500, 30, 1,
   '["premium_badge","advanced_discovery","unlimited_likes","advanced_filters","who_liked_you","read_receipts"]'),
  ('premium_quarterly', 'Premium Quarterly', '3 months of premium — save 15%.', 1275, 90, 2,
   '["premium_badge","advanced_discovery","unlimited_likes","advanced_filters","who_liked_you","read_receipts"]'),
  ('premium_yearly', 'Premium Yearly', '12 months of premium — save 40%.', 3600, 365, 3,
   '["premium_badge","advanced_discovery","unlimited_likes","advanced_filters","who_liked_you","read_receipts","incognito_mode","profile_boost"]')
on conflict (slug) do nothing;

-- ============================================================================
-- PREMIUM ENTITLEMENTS — Per-user, per-feature grants
-- ============================================================================
-- Tracks what premium features a user has access to, from any source:
--   - subscription (paid)
--   - promotion (free trial, promo code)
--   - admin_grant (manual admin action)
create type if not exists entitlement_source as enum ('subscription', 'promotion', 'admin_grant');

create table if not exists public.premium_entitlements (
  id                uuid                default gen_random_uuid() primary key,
  user_id           uuid                not null references public.users(id) on delete cascade,
  feature_key       text                not null,   -- e.g., 'premium_badge', 'unlimited_likes'
  source            entitlement_source  not null default 'subscription',
  source_id         uuid,                           -- FK to subscriptions.id or null for admin grants
  status            text                not null default 'active'
                    check (status in ('active', 'expired', 'revoked')),
  starts_at         timestamptz         not null default now(),
  expires_at        timestamptz,                     -- null = permanent (admin grants only with reason)
  metadata          jsonb               default '{}'::jsonb,
  created_at        timestamptz         not null default now(),
  updated_at        timestamptz         not null default now(),

  -- Prevent duplicate active entitlements for the same feature+user+source
  unique (user_id, feature_key, source) where status = 'active'
);

create index if not exists entitlements_user_active_idx on public.premium_entitlements (user_id, feature_key)
  where status = 'active' and (expires_at is null or expires_at > now());

create index if not exists entitlements_feature_idx on public.premium_entitlements (feature_key)
  where status = 'active';

-- ============================================================================
-- PAYMENT TRANSACTIONS — Granular per-payment tracking
-- ============================================================================
create table if not exists public.payment_transactions (
  id                      uuid        default gen_random_uuid() primary key,
  user_id                 uuid        not null references public.users(id) on delete cascade,
  subscription_id         uuid        references public.subscriptions(id) on delete set null,
  plan_slug               text,       -- which plan was purchased (for historical accuracy)
  plan_stars_price        integer,    -- price at time of purchase (protect against price changes)
  provider                text        not null default 'telegram_stars',
  provider_payment_id     text,       -- telegram_payment_charge_id
  provider_subscription_id text,      -- provider's subscription ID (for recurring)
  invoice_payload         text,       -- server-generated payload identifying the purchase
  stars_amount            integer     not null check (stars_amount > 0),
  currency                text        not null default 'XTR',
  status                  text        not null default 'pending'
                          check (status in ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  metadata                jsonb       default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Unique constraint for idempotency: one transaction per provider payment
create unique index if not exists payment_tx_provider_unique on public.payment_transactions (provider, provider_payment_id)
  where provider_payment_id is not null;

-- Unique constraint for idempotency: one transaction per invoice payload
create unique index if not exists payment_tx_payload_unique on public.payment_transactions (provider, invoice_payload)
  where invoice_payload is not null;

create index if not exists payment_tx_user_idx on public.payment_transactions (user_id, created_at desc);
create index if not exists payment_tx_status_idx on public.payment_transactions (status);
create index if not exists payment_tx_subscription_idx on public.payment_transactions (subscription_id);

-- ============================================================================
-- PAYMENT EVENTS — Durable webhook/update event log
-- ============================================================================
-- Used for idempotent processing of Telegram payment updates.
-- Prevents duplicate processing of the same event.
create table if not exists public.payment_events (
  id                uuid        default gen_random_uuid() primary key,
  provider          text        not null default 'telegram_stars',
  event_type        text        not null,   -- 'pre_checkout_query', 'successful_payment', 'subscription_update'
  event_id          text,                   -- Telegram-provided update/query ID for dedup
  payload_hash      text,                   -- SHA-256 hash of the raw payload for comparison
  status            text        not null default 'processed'
                    check (status in ('pending', 'processed', 'failed', 'skipped')),
  error_message     text,
  processed_at      timestamptz,
  created_at        timestamptz not null default now()
);

create unique index if not exists payment_events_dedup_idx on public.payment_events (provider, event_id)
  where event_id is not null;

create index if not exists payment_events_status_idx on public.payment_events (status, created_at);

-- ============================================================================
-- TRIGGER: set_updated_at for new tables
-- ============================================================================
create trigger set_updated_at before update on public.subscription_plans
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.premium_entitlements
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.payment_transactions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCTION: has_entitlement — Check if a user has a premium feature
-- ============================================================================
-- Server-side entitlement check. Used by all premium feature gates.
create or replace function public.has_entitlement(
  p_user_id uuid,
  p_feature_key text
)
returns boolean
language plpgsql
stable
as $$
  select exists (
    select 1
    from public.premium_entitlements
    where user_id = p_user_id
      and feature_key = p_feature_key
      and status = 'active'
      and (expires_at is null or expires_at > now())
  );
$$;

-- ============================================================================
-- FUNCTION: activate_entitlements — Grant all features for a subscription plan
-- ============================================================================
-- Called when a subscription is activated or renewed.
-- Creates entitlement records for each feature defined in the plan.
create or replace function public.activate_entitlements(
  p_user_id uuid,
  p_subscription_id uuid,
  p_plan_slug text,
  p_starts_at timestamptz,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
as $$
declare
  v_features jsonb;
  v_feature text;
begin
  -- Get plan features
  select features into v_features
  from public.subscription_plans
  where slug = p_plan_slug;

  if v_features is null then
    -- No plan found, use default features
    v_features := '["premium_badge"]'::jsonb;
  end if;

  -- Activate each feature
  for v_feature in select jsonb_array_elements_text(v_features)
  loop
    insert into public.premium_entitlements (
      user_id, feature_key, source, source_id, status, starts_at, expires_at
    )
    values (
      p_user_id, v_feature, 'subscription', p_subscription_id,
      'active', p_starts_at, p_expires_at
    )
    on conflict (user_id, feature_key, source) where status = 'active'
    do update set
      expires_at = p_expires_at,
      starts_at = p_starts_at,
      source_id = p_subscription_id,
      updated_at = now();
  end loop;
end;
$$;

-- ============================================================================
-- FUNCTION: expire_entitlements — Expire all entitlements for a subscription
-- ============================================================================
create or replace function public.expire_entitlements(
  p_subscription_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  update public.premium_entitlements
  set status = 'expired',
      updated_at = now()
  where source_id = p_subscription_id
    and source = 'subscription'
    and status = 'active';
end;
$$;

-- ============================================================================
-- FUNCTION: get_active_subscription — Get user's current active subscription
-- ============================================================================
create or replace function public.get_active_subscription(p_user_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'id', s.id,
    'plan_slug', s.plan,
    'status', s.status,
    'starts_at', s.starts_at,
    'expires_at', s.expires_at,
    'cancelled_at', s.cancelled_at,
    'provider_subscription_id', s.provider_subscription_id
  ) into v_result
  from public.subscriptions s
  where s.user_id = p_user_id
    and s.status = 'active'
    and (s.expires_at is null or s.expires_at > now())
  order by s.created_at desc
  limit 1;

  return v_result;
end;
$$;

-- ============================================================================
-- FUNCTION: expire_stale_subscriptions — Mark expired subscriptions
-- ============================================================================
-- Called by scheduled job or on access check.
create or replace function public.expire_stale_subscriptions()
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
  v_sub record;
begin
  -- Find expired active subscriptions
  for v_sub in
    select id, user_id
    from public.subscriptions
    where status = 'active'
      and expires_at is not null
      and expires_at <= now()
  loop
    -- Expire subscription
    update public.subscriptions
    set status = 'expired',
        updated_at = now()
    where id = v_sub.id;

    -- Expire entitlements
    update public.premium_entitlements
    set status = 'expired',
        updated_at = now()
    where source_id = v_sub.id
      and source = 'subscription'
      and status = 'active';

    -- Log event
    insert into public.subscription_events (subscription_id, event_type, old_status, new_status, metadata)
    values (v_sub.id, 'expired', 'active', 'expired', '{}'::jsonb);

    v_count := coalesce(v_count, 0) + 1;
  end loop;

  return v_count;
end;
$$;

-- ============================================================================
-- TRIGGER: Log subscription changes to subscription_events
-- ============================================================================
create or replace function public.log_subscription_event()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.subscription_events (subscription_id, event_type, old_status, new_status)
    values (new.id, 'created', null, new.status);
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.subscription_events (subscription_id, event_type, old_status, new_status)
    values (new.id, 'status_changed', old.status, new.status);
  end if;
  return new;
end;
$$;

create trigger log_subscription_event after insert or update on public.subscriptions
  for each row execute function public.log_subscription_event();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- subscription_plans: publicly readable (for the premium page)
alter table public.subscription_plans enable row level security;

create policy "Plans are publicly readable"
  on public.subscription_plans for select
  using (true);

create policy "Admins can manage plans"
  on public.subscription_plans for insert
  with check (public.is_admin());

create policy "Admins can update plans"
  on public.subscription_plans for update
  using (public.is_admin())
  with check (public.is_admin());

-- premium_entitlements: users see own, admins see all
alter table public.premium_entitlements enable row level security;

create policy "Users can see own entitlements"
  on public.premium_entitlements for select
  using (user_id = auth.uid());

create policy "Admins can see all entitlements"
  on public.premium_entitlements for select
  using (public.is_admin());

create policy "Server-side entitlement management"
  on public.premium_entitlements for insert
  with check (public.is_admin());

create policy "Server-side entitlement updates"
  on public.premium_entitlements for update
  using (public.is_admin() or user_id = auth.uid())
  with check (public.is_admin() or user_id = auth.uid());

-- payment_transactions: users see own, admins see all
alter table public.payment_transactions enable row level security;

create policy "Users can see own transactions"
  on public.payment_transactions for select
  using (user_id = auth.uid());

create policy "Admins can see all transactions"
  on public.payment_transactions for select
  using (public.is_admin());

create policy "Server-side transaction management"
  on public.payment_transactions for insert
  with check (public.is_admin());

create policy "Server-side transaction updates"
  on public.payment_transactions for update
  using (public.is_admin())
  with check (public.is_admin());

-- payment_events: admin-only access
alter table public.payment_events enable row level security;

create policy "Admins can see payment events"
  on public.payment_events for select
  using (public.is_admin());

create policy "Server-side event management"
  on public.payment_events for insert
  with check (public.is_admin());

-- ============================================================================
-- UPDATE ADMIN PERMISSIONS — Add billing permissions
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
    'billing.grant_entitlement', 'billing.revoke_entitlement'
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
    'billing.view', 'billing.reconcile'
  ])
on conflict (role) do update set permissions = excluded.permissions, updated_at = now();

-- ============================================================================
-- UPDATE EXISTING SUBSCRIPTIONS RLS
-- ============================================================================
-- Add policies for subscription_events if not already present
alter table public.subscription_events enable row level security;

create policy "Users can see own subscription events"
  on public.subscription_events for select
  using (exists (
    select 1 from public.subscriptions
    where id = subscription_id and user_id = auth.uid()
  ));

create policy "Admins can see all subscription events"
  on public.subscription_events for select
  using (public.is_admin());
