-- Vibe Database — Admin Foundation
-- System configuration and feature management.
-- All admin operations must be authorized server-side.

-- ============================================================================
-- SYSTEM CONFIG — Key-value configuration store
-- ============================================================================
create table public.system_config (
  key         text        primary key,
  value       jsonb       not null default '{}'::jsonb,
  description text,
  updated_by  uuid        references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- FEATURE FLAGS — Feature toggle management
-- ============================================================================
create table public.feature_flags (
  key         text        primary key,
  enabled     boolean     not null default false,
  description text,
  rules       jsonb,      -- Optional targeting rules (e.g., percentage rollout)
  updated_by  uuid        references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- ADMIN AUDIT LOG — Track admin actions
-- ============================================================================
create table public.admin_audit_log (
  id          uuid        default gen_random_uuid() primary key,
  admin_id    uuid        not null references public.users(id) on delete cascade,
  action      text        not null,
  entity_type text,
  entity_id   text,
  details     jsonb       default '{}'::jsonb,
  ip_address  inet,
  created_at  timestamptz not null default now()
);

create index admin_audit_log_admin_id_idx on public.admin_audit_log (admin_id, created_at desc);
create index admin_audit_log_action_idx on public.admin_audit_log (action);
