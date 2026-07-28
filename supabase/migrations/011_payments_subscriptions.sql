-- Vibe Database — Payments & Subscriptions Foundation
-- Purchase records for virtual goods and subscription management.
-- Payment verification is handled server-side (not client-side).

-- ============================================================================
-- PURCHASES — Record of all purchases (subscriptions, boosts, gifts, etc.)
-- ============================================================================
create table public.purchases (
  id                      uuid              default gen_random_uuid() primary key,
  user_id                 uuid              not null references public.users(id) on delete cascade,
  product_type            product_type      not null,
  provider                subscription_provider not null default 'telegram_stars',
  provider_transaction_id text,
  amount                  integer           not null check (amount > 0),  -- in smallest currency unit (e.g., Stars)
  currency                text              default 'XTR', -- Telegram Stars
  status                  purchase_status   not null default 'pending',
  metadata                jsonb             default '{}'::jsonb,
  created_at              timestamptz       not null default now(),
  updated_at              timestamptz       not null default now()
);

create index purchases_user_id_idx on public.purchases (user_id, created_at desc);
create index purchases_provider_txn_idx on public.purchases (provider_transaction_id)
  where provider_transaction_id is not null;
create index purchases_status_idx on public.purchases (status);

-- ============================================================================
-- SUBSCRIPTIONS — Premium subscription records
-- ============================================================================
create table public.subscriptions (
  id                        uuid                  default gen_random_uuid() primary key,
  user_id                   uuid                  not null references public.users(id) on delete cascade,
  plan                      text                  not null, -- 'monthly', 'yearly', etc.
  status                    subscription_status   not null default 'active',
  provider                  subscription_provider not null default 'telegram_stars',
  provider_subscription_id  text,                 -- ID from the provider
  purchase_id               uuid                  references public.purchases(id) on delete set null,
  starts_at                 timestamptz           not null default now(),
  expires_at                timestamptz,
  cancelled_at              timestamptz,
  created_at                timestamptz           not null default now(),
  updated_at                timestamptz           not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);
create index subscriptions_active_idx on public.subscriptions (user_id, status)
  where status = 'active';
create index subscriptions_expiring_idx on public.subscriptions (expires_at)
  where status = 'active' and expires_at is not null;

-- ============================================================================
-- SUBSCRIPTION EVENTS — Audit trail of subscription changes
-- ============================================================================
create table public.subscription_events (
  id              uuid        default gen_random_uuid() primary key,
  subscription_id uuid        not null references public.subscriptions(id) on delete cascade,
  event_type      text        not null, -- 'created', 'renewed', 'cancelled', 'expired', 'changed'
  old_status      subscription_status,
  new_status      subscription_status not null,
  metadata        jsonb       default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index subscription_events_sub_id_idx on public.subscription_events (subscription_id);
