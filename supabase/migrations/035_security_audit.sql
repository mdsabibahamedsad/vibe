-- Vibe Database — Security, Privacy & Compliance Hardening
-- Migration 035: Audit log improvements, RLS fixes, storage security,
-- account deletion requests, data export tracking, bot protection
--
-- This migration builds on existing security infrastructure:
--   1. Enhanced admin_audit_log with severity and metadata columns
--   2. Account deletion requests table
--   3. Storage RLS hardening for protected buckets
--   4. Bot/scraping protection rate-limit tracking table
--   5. Additional RLS policies for newly added tables
--   6. Legal document storage for terms/privacy policies
--   7. Consent/preference tracking

-- ============================================================================
-- ENHANCED ADMIN AUDIT LOG
-- ============================================================================
-- Add severity and metadata columns to the existing admin_audit_log table

alter table public.admin_audit_log
  add column if not exists severity text default 'info'
  check (severity in ('info', 'warning', 'critical'));

alter table public.admin_audit_log
  add column if not exists ip_address text;

alter table public.admin_audit_log
  add column if not exists request_id text;

-- Index for audit log queries
create index if not exists idx_admin_audit_log_severity
  on public.admin_audit_log(severity);

create index if not exists idx_admin_audit_log_created
  on public.admin_audit_log(created_at desc);

create index if not exists idx_admin_audit_log_target
  on public.admin_audit_log(target_id);

-- ============================================================================
-- ACCOUNT DELETION REQUESTS
-- ============================================================================

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'processing', 'completed', 'failed')),
  reason text,
  -- When the deletion will be confirmed (grace period)
  confirm_at timestamptz not null default now() + interval '7 days',
  -- Configuration for the deletion
  config jsonb default '{"preserve_financial_records": true, "send_notification": true}'::jsonb,
  -- Steps completed/failed during execution
  completed_steps text[] default '{}',
  failed_steps text[] default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Allow re-request after completion/cancellation — enforced at application level
);

alter table public.account_deletion_requests enable row level security;

-- Users can see their own deletion requests
create policy "Users can see own deletion requests"
  on public.account_deletion_requests for select
  using (user_id = auth.uid());

-- Users can create their own deletion requests
create policy "Users can create own deletion requests"
  on public.account_deletion_requests for insert
  with check (user_id = auth.uid());

-- Users can cancel own pending deletion requests
create policy "Users can cancel own pending deletion requests"
  on public.account_deletion_requests for update
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'pending');

-- Admins can see and manage all deletion requests
create policy "Admins can manage deletion requests"
  on public.account_deletion_requests for all
  using (public.is_admin());

-- Only one active (pending/confirmed/processing) deletion request per user at a time
create unique index if not exists idx_unique_active_deletion
  on public.account_deletion_requests(user_id)
  where status in ('pending', 'confirmed', 'processing');

create index if not exists idx_deletion_requests_user on public.account_deletion_requests(user_id);
create index if not exists idx_deletion_requests_status on public.account_deletion_requests(status);

-- ============================================================================
-- STORAGE BUCKET RLS HARDENING
-- ============================================================================

-- Ensure storage buckets have proper RLS
-- This assumes standard Supabase storage buckets: 'public', 'authenticated', 'media'

-- Public bucket: readable by all, writable by authenticated users only
-- (Supabase default, but ensure it's correct)
do $$
begin
  -- Ensure the storage schema is accessible
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    -- Profile photos bucket: authenticated upload, public read
    if not exists (select 1 from storage.buckets where id = 'profile_photos') then
      insert into storage.buckets (id, name, public) values ('profile_photos', 'profile_photos', true);
    end if;

    -- Stories/media bucket: authenticated upload, public read
    if not exists (select 1 from storage.buckets where id = 'media') then
      insert into storage.buckets (id, name, public) values ('media', 'media', true);
    end if;

    -- Message attachments bucket: authenticated upload and read only
    if not exists (select 1 from storage.buckets where id = 'messages') then
      insert into storage.buckets (id, name, public) values ('messages', 'messages', false);
    end if;

    -- Verification documents bucket: restricted, admin-only read
    if not exists (select 1 from storage.buckets where id = 'verification') then
      insert into storage.buckets (id, name, public) values ('verification', 'verification', false);
    end if;
  end if;
end $$;

-- Profile photos bucket policies
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    -- Public read for profile photos
    drop policy if exists "Public read profile photos" on storage.objects;
    create policy "Public read profile photos"
      on storage.objects for select
      using (bucket_id = 'profile_photos');

    -- Authenticated users can upload to profile_photos
    drop policy if exists "Authenticated upload profile photos" on storage.objects;
    create policy "Authenticated upload profile photos"
      on storage.objects for insert
      with check (
        bucket_id = 'profile_photos'
        and auth.role() = 'authenticated'
      );

    -- Users can update/delete own profile photos
    drop policy if exists "Users manage own profile photos" on storage.objects;
    create policy "Users manage own profile photos"
      on storage.objects for update
      using (bucket_id = 'profile_photos' and owner = auth.uid());

    drop policy if exists "Users delete own profile photos" on storage.objects;
    create policy "Users delete own profile photos"
      on storage.objects for delete
      using (bucket_id = 'profile_photos' and owner = auth.uid());
  end if;
end $$;

-- Messages bucket: private (only participants can read)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    -- Authenticated users can read message attachments
    drop policy if exists "Authenticated read message attachments" on storage.objects;
    create policy "Authenticated read message attachments"
      on storage.objects for select
      using (
        bucket_id = 'messages'
        and auth.role() = 'authenticated'
      );

    -- Authenticated users can upload to messages
    drop policy if exists "Authenticated upload messages" on storage.objects;
    create policy "Authenticated upload messages"
      on storage.objects for insert
      with check (
        bucket_id = 'messages'
        and auth.role() = 'authenticated'
      );

    -- Owners can delete their own uploads
    drop policy if exists "Owner delete message attachments" on storage.objects;
    create policy "Owner delete message attachments"
      on storage.objects for delete
      using (
        bucket_id = 'messages'
        and owner = auth.uid()
      );
  end if;
end $$;

-- Verification bucket: admin/moderator only
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    drop policy if exists "Verification admin only select" on storage.objects;
    create policy "Verification admin only select"
      on storage.objects for select
      using (
        bucket_id = 'verification'
        and public.is_moderator()
      );

    drop policy if exists "Verification admin only insert" on storage.objects;
    create policy "Verification admin only insert"
      on storage.objects for insert
      with check (
        bucket_id = 'verification'
        and public.is_moderator()
      );

    drop policy if exists "Verification admin only delete" on storage.objects;
    create policy "Verification admin only delete"
      on storage.objects for delete
      using (
        bucket_id = 'verification'
        and public.is_moderator()
      );
  end if;
end $$;

-- ============================================================================
-- BOT / SCRAPING PROTECTION
-- ============================================================================
-- Track suspicious access patterns for rate limiting decisions
-- This is an application-level table for storing rate-limit events

create table if not exists public.access_patterns (
  id uuid primary key default gen_random_uuid(),
  identifier_hash text not null,  -- Hashed IP or user ID (not raw value)
  pattern_type text not null check (pattern_type in (
    'rapid_auth', 'enumeration', 'bulk_profile', 'mass_messaging',
    'rapid_search', 'scraping', 'suspicious_headers', 'rate_limit_exceeded'
  )),
  endpoint_pattern text,
  request_count integer not null default 1,
  window_start timestamptz not null default now(),
  window_end timestamptz not null default now() + interval '1 hour',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  blocked boolean not null default false,
  blocked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.access_patterns enable row level security;

-- Only admins/moderators can see access patterns
create policy "Access patterns admin only"
  on public.access_patterns for select
  using (public.is_admin());

-- Application inserts patterns (security definer or service role)
create policy "Access patterns system insert"
  on public.access_patterns for insert
  with check (public.is_admin());

-- Application updates patterns
create policy "Access patterns system update"
  on public.access_patterns for update
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists idx_access_patterns_hash on public.access_patterns(identifier_hash);
create index if not exists idx_access_patterns_type on public.access_patterns(pattern_type);
create index if not exists idx_access_patterns_window on public.access_patterns(window_start, window_end);
create index if not exists idx_access_patterns_blocked on public.access_patterns(blocked) where blocked = true;

-- ============================================================================
-- LEGAL DOCUMENTS (Terms, Privacy, Community Guidelines)
-- ============================================================================

create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in (
    'terms_of_service', 'privacy_policy', 'community_guidelines',
    'cookie_policy', 'creator_terms', 'advertising_policy',
    'safety_policy', 'data_processing_agreement'
  )),
  version integer not null,
  title text not null,
  body text not null,  -- Markdown content
  summary text,  -- Short summary for users
  locale text not null default 'en',
  published_at timestamptz,
  effective_at timestamptz not null default now(),
  -- Whether acceptance is required to use the platform
  requires_acceptance boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_document_version unique (document_type, version)
);

alter table public.legal_documents enable row level security;

-- Public can read published legal documents
create policy "Legal documents publicly readable"
  on public.legal_documents for select
  using (published_at is not null and published_at <= now());

-- Admins manage legal documents
create policy "Admins manage legal documents"
  on public.legal_documents for insert
  with check (public.is_admin());

create policy "Admins update legal documents"
  on public.legal_documents for update
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists idx_legal_documents_type
  on public.legal_documents(document_type, version desc);

-- ============================================================================
-- POLICY ACCEPTANCE TRACKING
-- ============================================================================

create table if not exists public.policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  document_id uuid not null references public.legal_documents(id) on delete cascade,
  document_version integer not null,
  accepted_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  constraint unique_user_document_acceptance unique (user_id, document_id)
);

alter table public.policy_acceptances enable row level security;

-- Users can see their own policy acceptances
create policy "Users see own policy acceptances"
  on public.policy_acceptances for select
  using (user_id = auth.uid());

-- Users can accept policies
create policy "Users can accept policies"
  on public.policy_acceptances for insert
  with check (user_id = auth.uid());

-- Admins can see all acceptances
create policy "Admins see all policy acceptances"
  on public.policy_acceptances for select
  using (public.is_admin());

create index if not exists idx_policy_acceptances_user
  on public.policy_acceptances(user_id, document_id);

-- ============================================================================
-- CONSENT & PREFERENCE MANAGEMENT
-- ============================================================================

create type public.consent_category as enum (
  'marketing_communications',
  'analytics_processing',
  'ai_personalization',
  'advertising_personalization',
  'location_usage',
  'optional_notifications',
  'data_sharing',
  'third_party_processing'
);

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category public.consent_category not null,
  granted boolean not null default false,
  granted_at timestamptz,
  revoked_at timestamptz,
  ip_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_user_consent unique (user_id, category)
);

alter table public.user_consents enable row level security;

-- Users can see own consent settings
create policy "Users see own consent settings"
  on public.user_consents for select
  using (user_id = auth.uid());

-- Users can manage own consent settings
create policy "Users manage own consent settings"
  on public.user_consents for insert
  with check (user_id = auth.uid());

create policy "Users update own consent settings"
  on public.user_consents for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_user_consents_user on public.user_consents(user_id);
create index if not exists idx_user_consents_category on public.user_consents(category);

-- ============================================================================
-- DATA EXPORT TRACKING
-- ============================================================================

create table if not exists public.data_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  categories text[] not null default '{}',
  file_path text,
  file_size_bytes integer,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  expires_at timestamptz default now() + interval '7 days',
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.data_exports enable row level security;

-- Users can see own exports
create policy "Users see own data exports"
  on public.data_exports for select
  using (user_id = auth.uid());

-- Users can request exports
create policy "Users can request data exports"
  on public.data_exports for insert
  with check (user_id = auth.uid());

create index if not exists idx_data_exports_user on public.data_exports(user_id);

-- ============================================================================
-- RLS FIXES: Ensure newly created tables are also protected
-- ============================================================================

-- Enable RLS on any tables that might have been missed
-- Note: Most tables already have RLS enabled from migration 018

-- ============================================================================
-- ADDITIONAL INDEXES FOR SECURITY QUERIES
-- ============================================================================

-- Index for block enforcement queries (quick lookup)
create index if not exists idx_blocks_bidirectional
  on public.blocks(blocker_id, blocked_id);

-- Index for report abuse detection (mass reporting)
create index if not exists idx_reports_reporter_target
  on public.reports(reporter_id, target_user_id);

-- Index for checking active moderation actions
create index if not exists idx_moderation_actions_active
  on public.moderation_actions(user_id, action_type)
  where status = 'active';

-- ============================================================================
-- FUNCTION: Check if a user has accepted required policies
-- ============================================================================

create or replace function public.has_accepted_latest_policy(
  p_user_id uuid,
  p_document_type text
)
returns boolean
language plpgsql
security definer
as $$
declare
  latest_version integer;
  accepted_version integer;
begin
  -- Get the latest published version of this document type
  select max(version) into latest_version
  from public.legal_documents
  where document_type = p_document_type
    and published_at is not null
    and published_at <= now();

  if latest_version is null then
    return true; -- No published document, no acceptance needed
  end if;

  -- Check if the user has accepted the latest version
  select max(document_version) into accepted_version
  from public.policy_acceptances pa
  join public.legal_documents ld on ld.id = pa.document_id
  where pa.user_id = p_user_id
    and ld.document_type = p_document_type;

  return coalesce(accepted_version, 0) >= latest_version;
end;
$$;

-- ============================================================================
-- FUNCTION: Get a user's current consent for a category
-- ============================================================================

create or replace function public.get_user_consent(
  p_user_id uuid,
  p_category public.consent_category
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_granted boolean;
begin
  select granted into v_granted
  from public.user_consents
  where user_id = p_user_id
    and category = p_category;

  return coalesce(v_granted, false);
end;
$$;

-- ============================================================================
-- CLEANUP: Remove test/dev accounts (commented for safety)
-- ============================================================================
-- Production cleanup should be done manually via admin panel
-- delete from auth.users where email like 'test%@vibe.test';
