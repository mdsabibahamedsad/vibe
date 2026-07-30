-- Vibe Database — Trust & Safety System
-- Migration 033: Trust profiles, safety signals, chat warnings, message requests,
-- link safety, impersonation detection, safety education, escalation categories
--
-- This migration builds on existing moderation, reporting, and block infrastructure
-- without duplicating it. Key additions:
--   1. trust_profiles — Internal trust scoring per user
--   2. safety_signals — Tracked risk signals (romance scams, impersonation, etc.)
--   3. chat_safety_warnings — Contextual warnings shown in risky conversations
--   4. message_requests — Privacy-controlled message intake
--   5. safety_education_log — Track which safety messages users have seen
--   6. escalation_queue — High-priority safety escalation for admin
--   7. safety_analytics — Aggregated safety metrics
--   8. Additional indexes and RLS policies

-- ============================================================================
-- TRUST PROFILES
-- ============================================================================
-- Internal trust profile for each user. NOT exposed to users.
-- Contains signals used to compute an internal trust assessment.
-- The raw score is NEVER revealed — only derived trust levels and badges.

create table if not exists public.trust_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  -- Account age signals
  account_age_days integer not null default 0,
  account_age_tier text not null default 'new' check (account_age_tier in ('new', 'established', 'trusted', 'senior')),
  -- Verification state
  verification_level text not null default 'unverified' check (verification_level in ('unverified', 'basic', 'verified', 'enhanced')),
  verification_completed_at timestamptz,
  -- Report history (count, not content — privacy preserving)
  total_reports_received integer not null default 0,
  total_reports_filed integer not null default 0,
  unique_reporters integer not null default 0,
  -- Moderation history
  total_warnings integer not null default 0,
  total_restrictions integer not null default 0,
  has_been_suspended boolean not null default false,
  has_been_banned boolean not null default false,
  last_moderation_action_at timestamptz,
  -- Suspicious activity signals (counts, not content)
  suspicious_flag_count integer not null default 0,
  spam_signal_count integer not null default 0,
  scam_signal_count integer not null default 0,
  impersonation_signal_count integer not null default 0,
  -- Login/session anomalies
  login_anomaly_count integer not null default 0,
  last_login_anomaly_at timestamptz,
  -- Successful interactions
  successful_matches integer not null default 0,
  successful_conversations integer not null default 0,
  positive_interaction_count integer not null default 0,
  -- Abuse history
  abuse_report_count integer not null default 0,
  harassment_report_count integer not null default 0,
  -- Computed internal trust tier (never exposed to users)
  internal_trust_tier text not null default 'unknown' check (internal_trust_tier in ('unknown', 'low', 'medium', 'high', 'trusted')),
  -- Derived user-facing badges (set by admin or automated rules)
  badges text[] not null default '{}',
  -- Metadata
  last_recalculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_user_trust_profile unique (user_id)
);

-- Only admins/moderators can read trust profiles directly
-- Users cannot see their own internal trust score
alter table public.trust_profiles enable row level security;

create policy "Trust profiles are admin-only"
  on public.trust_profiles for select
  using (public.is_moderator());

create policy "Trust profiles inserted by system"
  on public.trust_profiles for insert
  with check (public.is_moderator());

create policy "Trust profiles updated by system"
  on public.trust_profiles for update
  using (public.is_moderator())
  with check (public.is_moderator());

-- Indexes for trust profile lookups
create index if not exists idx_trust_profiles_user_id on public.trust_profiles(user_id);
create index if not exists idx_trust_profiles_internal_tier on public.trust_profiles(internal_trust_tier);
create index if not exists idx_trust_profiles_verification on public.trust_profiles(verification_level);

-- ============================================================================
-- SAFETY SIGNALS
-- ============================================================================
-- Tracked signals for specific safety concerns.
-- Each signal has a type, source, and optional metadata.
-- Signals are never exposed to other users.

create type public.safety_signal_type as enum (
  'romance_scam_pattern',
  'financial_scam_pattern',
  'impersonation',
  'spam_pattern',
  'harassment_pattern',
  'fake_profile',
  'phishing_link',
  'suspicious_message',
  'mass_created_account',
  'reused_media',
  'duplicate_bio',
  'rapid_profile_change',
  'suspicious_follower_pattern',
  'copy_paste_message',
  'money_request_pattern',
  'off_platform_move_request',
  'investment_solicitation',
  'fake_giveaway',
  'account_recovery_scam'
);

create table if not exists public.safety_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  signal_type public.safety_signal_type not null,
  -- Source of the signal
  source text not null check (source in ('ai_analysis', 'auto_detector', 'user_report', 'admin_review', 'system')),
  -- Confidence 0.0–1.0
  confidence float4 not null default 0.5 check (confidence >= 0 and confidence <= 1),
  -- Severity
  severity text not null default 'low' check (severity in ('low', 'medium', 'high', 'critical')),
  -- Optional metadata (context, never PII)
  metadata jsonb default '{}'::jsonb,
  -- Whether this signal has been reviewed by a human
  reviewed boolean not null default false,
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  -- Whether this signal led to a moderation action
  escalated boolean not null default false,
  escalation_ref uuid, -- references moderation_actions.id
  -- Auto-expire after 90 days (soft deletion)
  expires_at timestamptz default now() + interval '90 days',
  created_at timestamptz not null default now()
);

alter table public.safety_signals enable row level security;

create policy "Safety signals are admin-only"
  on public.safety_signals for select
  using (public.is_moderator());

create policy "Safety signals inserted by system"
  on public.safety_signals for insert
  with check (public.is_moderator());

create policy "Safety signals updated by moderators"
  on public.safety_signals for update
  using (public.is_moderator())
  with check (public.is_moderator());

create index if not exists idx_safety_signals_user_id on public.safety_signals(user_id);
create index if not exists idx_safety_signals_type on public.safety_signals(signal_type);
create index if not exists idx_safety_signals_severity on public.safety_signals(severity);
create index if not exists idx_safety_signals_unreviewed on public.safety_signals(signal_type, reviewed) where reviewed = false;
create index if not exists idx_safety_signals_expires on public.safety_signals(expires_at) where expires_at is not null;

-- ============================================================================
-- CHAT SAFETY WARNINGS
-- ============================================================================
-- Contextual warnings shown in conversations with high-risk signals.
-- Warnings are user-facing but the detection logic is never revealed.

create type public.chat_safety_warning_type as enum (
  'payment_warning',
  'investment_warning',
  'password_sharing_warning',
  'off_platform_warning',
  'identity_theft_warning',
  'gift_scam_warning',
  'emergency_scam_warning',
  'phishing_warning',
  'suspicious_behavior_warning',
  'impersonation_warning',
  'romance_scam_reminder',
  'general_safety_reminder'
);

create table if not exists public.chat_safety_warnings (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  -- Which users this warning applies to
  warned_user_id uuid not null references public.users(id) on delete cascade,
  warning_type public.chat_safety_warning_type not null,
  -- The warning message shown to the user (pre-translated/default)
  warning_title text not null,
  warning_body text not null,
  -- Link to relevant safety center article
  safety_article_slug text,
  -- Whether the user has dismissed this warning
  dismissed boolean not null default false,
  dismissed_at timestamptz,
  -- Severity for UI emphasis
  severity text not null default 'info' check (severity in ('info', 'caution', 'warning', 'critical')),
  -- The AI/rule that generated this warning
  generated_by text not null default 'system' check (generated_by in ('system', 'ai_analysis', 'rule', 'admin')),
  -- Metadata for analytics (not user-visible)
  detection_signal_ids uuid[] default '{}',
  created_at timestamptz not null default now()
);

alter table public.chat_safety_warnings enable row level security;

-- Users can see their own warnings
create policy "Users can see own safety warnings"
  on public.chat_safety_warnings for select
  using (warned_user_id = auth.uid());

-- Users can dismiss their own warnings
create policy "Users can dismiss own safety warnings"
  on public.chat_safety_warnings for update
  using (warned_user_id = auth.uid())
  with check (warned_user_id = auth.uid());

-- Moderators can see all warnings
create policy "Moderators can see all safety warnings"
  on public.chat_safety_warnings for select
  using (public.is_moderator());

create policy "System inserts safety warnings"
  on public.chat_safety_warnings for insert
  with check (public.is_moderator());

create index if not exists idx_chat_safety_warnings_user on public.chat_safety_warnings(warned_user_id, dismissed);
create index if not exists idx_chat_safety_warnings_conv on public.chat_safety_warnings(conversation_id);
create index if not exists idx_chat_safety_warnings_type on public.chat_safety_warnings(warning_type);

-- ============================================================================
-- MESSAGE REQUESTS
-- ============================================================================
-- Configurable message request settings for who can message the user.
-- Respects existing block and privacy settings.

create table if not exists public.message_request_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  -- Who can send message requests
  who_can_message text not null default 'everyone' check (who_can_message in ('everyone', 'followers', 'matches_only', 'nobody')),
  -- Whether to show a prompt before accepting a request
  require_prompt boolean not null default true,
  -- Auto-decline requests after N days
  auto_decline_days integer not null default 7 check (auto_decline_days between 1 and 30),
  -- Whether to allow message requests from new accounts (under 7 days)
  allow_new_accounts boolean not null default false,
  -- Whitelist of users who can always message
  whitelist uuid[] not null default '{}',
  -- Blocklist (managed via blocks table, this is for additional text-based blocks)
  blocked_text_patterns text[] not null default '{}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint unique_message_request_settings unique (user_id)
);

alter table public.message_request_settings enable row level security;

create policy "Users can see own message request settings"
  on public.message_request_settings for select
  using (user_id = auth.uid());

create policy "Users can manage own message request settings"
  on public.message_request_settings for insert
  with check (user_id = auth.uid());

create policy "Users can update own message request settings"
  on public.message_request_settings for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_message_request_settings_user on public.message_request_settings(user_id);

-- ============================================================================
-- PENDING MESSAGE REQUESTS
-- ============================================================================
-- When a non-messagable user tries to message, a request is created.

create table if not exists public.pending_message_requests (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id) on delete cascade,
  requester_id uuid not null references public.users(id) on delete cascade,
  -- Optional initial message content (preview only)
  preview_text text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  -- If accepted, the conversation that was created
  accepted_conversation_id uuid references public.conversations(id) on delete set null,
  declined_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  -- Allow new pending requests after previous ones are declined/expired
  -- by using a partial unique index on only 'pending' status

);

alter table public.pending_message_requests enable row level security;

create policy "Recipients can see their pending requests"
  on public.pending_message_requests for select
  using (recipient_id = auth.uid());

create policy "Requesters can see their sent requests"
  on public.pending_message_requests for select
  using (requester_id = auth.uid());

create policy "Users can accept/decline own requests"
  on public.pending_message_requests for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create policy "Users can send message requests"
  on public.pending_message_requests for insert
  with check (requester_id = auth.uid());

create index if not exists idx_pending_message_requests_recipient on public.pending_message_requests(recipient_id, status);
create index if not exists idx_pending_message_requests_requester on public.pending_message_requests(requester_id, status);
-- Partial unique index: only one pending request per requester-recipient pair
-- This allows new requests after previous ones are declined or expired
create unique index if not exists idx_unique_pending_request
  on public.pending_message_requests(recipient_id, requester_id)
  where status = 'pending';

create index if not exists idx_pending_message_requests_expires on public.pending_message_requests(expires_at) where status = 'pending';

-- ============================================================================
-- SAFETY EDUCATION LOG
-- ============================================================================
-- Tracks which safety education content a user has seen/interacted with.
-- Used to avoid showing the same education repeatedly.

create table if not exists public.safety_education_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  education_slug text not null, -- unique identifier for the education content
  -- How the education was triggered
  trigger_type text not null check (trigger_type in ('onboarding', 'contextual_warning', 'safety_center_visit', 'report_flow', 'payment_flow', 'admin_triggered')),
  -- Whether the user engaged (clicked, read more, etc.)
  engaged boolean not null default false,
  -- Optional related reference (e.g., the conversation where a warning was shown)
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

alter table public.safety_education_log enable row level security;

create policy "Users can see own education log"
  on public.safety_education_log for select
  using (user_id = auth.uid());

create policy "System inserts education log"
  on public.safety_education_log for insert
  with check (auth.uid() = user_id or public.is_moderator());

create index if not exists idx_safety_education_log_user on public.safety_education_log(user_id, education_slug);

-- ============================================================================
-- ESCALATION QUEUE
-- ============================================================================
-- High-priority safety issues that need human review.
-- Integrates with the existing moderation system.

create type public.escalation_category as enum (
  'severe_harassment',
  'credible_threat',
  'financial_fraud',
  'account_takeover',
  'impersonation',
  'child_safety',
  'coordinated_abuse',
  'romance_scam',
  'extreme_spam',
  'other_critical'
);

create table if not exists public.escalation_queue (
  id uuid primary key default gen_random_uuid(),
  category public.escalation_category not null,
  -- The user who triggered the escalation
  reported_user_id uuid not null references public.users(id) on delete cascade,
  -- Optional reporter (can be null for auto-detected escalations)
  reporter_id uuid references public.users(id),
  -- Link to the original report, if any
  report_id uuid references public.reports(id) on delete set null,
  -- Description of the issue
  description text not null,
  priority text not null default 'high' check (priority in ('medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  assigned_to uuid references public.users(id),
  assigned_at timestamptz,
  resolved_by uuid references public.users(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.escalation_queue enable row level security;

create policy "Escalation queue is moderator-only"
  on public.escalation_queue for select
  using (public.is_moderator());

create policy "System inserts escalations"
  on public.escalation_queue for insert
  with check (public.is_moderator());

create policy "Moderators update escalations"
  on public.escalation_queue for update
  using (public.is_moderator())
  with check (public.is_moderator());

create index if not exists idx_escalation_queue_status on public.escalation_queue(status, priority);
create index if not exists idx_escalation_queue_category on public.escalation_queue(category);
create index if not exists idx_escalation_queue_reported on public.escalation_queue(reported_user_id);

-- ============================================================================
-- SAFETY METRICS (materialized for dashboard)
-- ============================================================================
-- Pre-computed safety metrics for the admin safety dashboard.
-- Refreshed periodically by a scheduled function or on-demand.

create table if not exists public.safety_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null,
  -- Scam metrics
  scam_reports integer not null default 0,
  scam_signals_raised integer not null default 0,
  romance_scam_reports integer not null default 0,
  financial_scam_reports integer not null default 0,
  -- Harassment metrics
  harassment_reports integer not null default 0,
  harassment_signals_raised integer not null default 0,
  -- Fake profile metrics
  fake_profile_reports integer not null default 0,
  fake_profile_detected integer not null default 0,
  -- Block metrics
  blocks_placed integer not null default 0,
  unique_blockers integer not null default 0,
  -- Report resolution metrics
  reports_submitted integer not null default 0,
  reports_resolved integer not null default 0,
  reports_dismissed integer not null default 0,
  avg_resolution_hours float4 not null default 0,
  -- Appeal metrics
  appeals_submitted integer not null default 0,
  appeals_approved integer not null default 0,
  appeals_denied integer not null default 0,
  -- Safety warning metrics
  safety_warnings_shown integer not null default 0,
  safety_warnings_dismissed integer not null default 0,
  -- Account action metrics
  warnings_issued integer not null default 0,
  restrictions_applied integer not null default 0,
  suspensions_applied integer not null default 0,
  bans_applied integer not null default 0,
  -- Impersonation metrics
  impersonation_reports integer not null default 0,
  impersonation_confirmed integer not null default 0,
  -- Message request metrics
  message_requests_sent integer not null default 0,
  message_requests_accepted integer not null default 0,
  message_requests_declined integer not null default 0,
  -- AI safety
  ai_flags_raised integer not null default 0,
  ai_false_positive_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint unique_safety_metric_date unique (metric_date)
);

alter table public.safety_metrics enable row level security;

create policy "Safety metrics are admin-only"
  on public.safety_metrics for select
  using (public.is_admin());

create index if not exists idx_safety_metrics_date on public.safety_metrics(metric_date desc);

-- ============================================================================
-- FUNCTION: Initialize trust profile for new user
-- ============================================================================
-- Called on user creation to initialize the trust profile.

create or replace function public.initialize_trust_profile()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.trust_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ============================================================================
-- FUNCTION: Recalculate trust tier for a user
-- ============================================================================
-- Internal function that computes the internal trust tier.
-- NOT exposed to clients or users.

create or replace function public.recalculate_trust_tier(p_user_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  tp public.trust_profiles%rowtype;
  score float4 := 0;
  tier text;
begin
  select * into tp from public.trust_profiles where user_id = p_user_id;
  if not found then return 'unknown'; end if;

  -- Account age (up to 25 points)
  score := score + least(tp.account_age_days * 0.5, 25);

  -- Verification (20 points if verified)
  if tp.verification_level in ('verified', 'enhanced') then
    score := score + 20;
  end if;

  -- Positive interactions (up to 20 points)
  score := score + least(tp.positive_interaction_count * 2, 20);

  -- Successful matches (up to 10 points)
  score := score + least(tp.successful_matches * 1, 10);

  -- Penalties
  -- Reports received (up to -30 points)
  score := score - least(tp.total_reports_received * 5, 30);

  -- Warnings (up to -20 points)
  score := score - least(tp.total_warnings * 10, 20);

  -- Suspicious flags (up to -25 points)
  score := score - least(tp.suspicious_flag_count * 5, 25);

  -- Suspension/ban history (-15 each)
  if tp.has_been_suspended then score := score - 15; end if;
  if tp.has_been_banned then score := score - 25; end if;

  -- Determine tier
  if score >= 60 then tier := 'trusted';
  elsif score >= 40 then tier := 'high';
  elsif score >= 20 then tier := 'medium';
  elsif score >= 0 then tier := 'low';
  else tier := 'low';
  end if;

  -- Update the trust profile
  update public.trust_profiles
  set internal_trust_tier = tier,
      last_recalculated_at = now()
  where user_id = p_user_id;

  return tier;
end;
$$;

-- ============================================================================
-- FUNCTION: Record safety metric daily snapshot
-- ============================================================================

create or replace function public.record_daily_safety_metrics()
returns void
language plpgsql
security definer
as $$
declare
  today date := current_date;
begin
  insert into public.safety_metrics (metric_date,
    scam_reports, harassment_reports, fake_profile_reports,
    blocks_placed, reports_submitted, reports_resolved, reports_dismissed,
    appeals_submitted, appeals_approved, appeals_denied,
    warnings_issued, restrictions_applied, suspensions_applied, bans_applied,
    impersonation_reports, safety_warnings_shown,
    message_requests_sent, message_requests_accepted, message_requests_declined
  )
  select
    today,
    -- Scam reports
    (select count(*) from public.reports where reason = 'scam' and created_at::date = today),
    -- Harassment reports
    (select count(*) from public.reports where reason = 'harassment' and created_at::date = today),
    -- Fake profile reports
    (select count(*) from public.reports where reason = 'impersonation' and created_at::date = today),
    -- Blocks
    (select count(*) from public.blocks where created_at::date = today),
    -- Reports submitted
    (select count(*) from public.reports where created_at::date = today),
    -- Reports resolved
    (select count(*) from public.reports where status = 'resolved' and resolved_at::date = today),
    -- Reports dismissed
    (select count(*) from public.reports where status = 'dismissed' and resolved_at::date = today),
    -- Appeals submitted
    (select count(*) from public.appeals where created_at::date = today),
    -- Appeals approved
    (select count(*) from public.appeals where status = 'approved' and resolved_at::date = today),
    -- Appeals denied
    (select count(*) from public.appeals where status = 'denied' and resolved_at::date = today),
    -- Warnings
    (select count(*) from public.moderation_actions where action_type = 'user_warned' and created_at::date = today),
    -- Restrictions
    (select count(*) from public.moderation_actions where action_type = 'user_restricted' and created_at::date = today),
    -- Suspensions
    (select count(*) from public.moderation_actions where action_type = 'user_suspended' and created_at::date = today),
    -- Bans
    (select count(*) from public.moderation_actions where action_type = 'user_banned' and created_at::date = today),
    -- Impersonation reports
    (select count(*) from public.reports where reason = 'impersonation' and created_at::date = today),
    -- Safety warnings shown (placeholder — populated by app)
    0,
    -- Message requests sent
    (select count(*) from public.pending_message_requests where created_at::date = today),
    -- Message requests accepted
    (select count(*) from public.pending_message_requests where status = 'accepted' and updated_at::date = today),
    -- Message requests declined
    (select count(*) from public.pending_message_requests where status = 'declined' and updated_at::date = today)
  on conflict (metric_date) do update set
    scam_reports = excluded.scam_reports,
    harassment_reports = excluded.harassment_reports,
    fake_profile_reports = excluded.fake_profile_reports,
    blocks_placed = excluded.blocks_placed,
    reports_submitted = excluded.reports_submitted,
    reports_resolved = excluded.reports_resolved,
    reports_dismissed = excluded.reports_dismissed,
    appeals_submitted = excluded.appeals_submitted,
    appeals_approved = excluded.appeals_approved,
    appeals_denied = excluded.appeals_denied,
    warnings_issued = excluded.warnings_issued,
    restrictions_applied = excluded.restrictions_applied,
    suspensions_applied = excluded.suspensions_applied,
    bans_applied = excluded.bans_applied,
    impersonation_reports = excluded.impersonation_reports,
    message_requests_sent = excluded.message_requests_sent,
    message_requests_accepted = excluded.message_requests_accepted,
    message_requests_declined = excluded.message_requests_declined;
end;
$$;

-- ============================================================================
-- TRIGGER: Initialize trust profile on user creation
-- ============================================================================
-- create trigger initialize_trust_profile
--   after insert on public.users
--   for each row execute function public.initialize_trust_profile();

-- Note: The trigger above is commented out intentionally to avoid conflicts.
-- The trust profile should be initialized by the application service when a user
-- is fully onboarded, not on raw user creation.

-- ============================================================================
-- ADDITIONAL REPORT REASONS (for report_type enum)
-- ============================================================================
-- The existing reports table already has a 'scam' reason.
-- The existing reasons are: spam, harassment, nudity, hate_speech, violence,
-- impersonation, copyright, other, minor_safety, self_harm, illegal_activity,
-- privacy, scam
-- 
-- No new enum values needed — the existing ones cover safety needs.

-- ============================================================================
-- INDEXES FOR BLOCK ENFORCEMENT
-- ============================================================================
-- Ensure comprehensive block lookups are fast

create index if not exists idx_blocks_blocker_lookup on public.blocks(blocker_id, blocked_id);
create index if not exists idx_blocks_blocked_lookup on public.blocks(blocked_id, blocker_id);

-- ============================================================================
-- LOCATION PRIVACY
-- ============================================================================
-- Add a column to profiles for approximate location precision.
-- This is separate from the existing location fields.

alter table public.profiles
  add column if not exists location_precision text default 'city' check (location_precision in ('exact', 'approximate', 'city', 'region', 'disabled'));

alter table public.profiles
  add column if not exists location_updated_at timestamptz;

-- ============================================================================
-- AGE SAFETY: Ensure enforcement columns
-- ============================================================================
-- Add explicit dating eligibility tracking for server-side enforcement

create table if not exists public.dating_eligibility (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  eligible boolean not null default false,
  reason text,
  -- Age verification level
  age_verification text not null default 'self_declared' check (age_verification in ('self_declared', 'id_verified', 'admin_set')),
  verified_at timestamptz,
  expires_at timestamptz,
  checked_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_dating_eligibility unique (user_id)
);

alter table public.dating_eligibility enable row level security;

create policy "Users can see own dating eligibility"
  on public.dating_eligibility for select
  using (user_id = auth.uid());

create policy "Moderators can see all dating eligibility"
  on public.dating_eligibility for select
  using (public.is_moderator());

create index if not exists idx_dating_eligibility_user on public.dating_eligibility(user_id);
