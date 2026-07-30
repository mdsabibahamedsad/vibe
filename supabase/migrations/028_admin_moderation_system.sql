-- Vibe Database — Admin + Moderation + Safety Control Center (Prompt 15)
-- Extends existing reports, users, admin_audit_log with:
--   - Extended reports (priority, assignment, escalation)
--   - User restrictions (fine-grained capability controls)
--   - User warnings
--   - Appeals system
--   - Moderation actions (action history)
--   - Moderation cases (grouping related reports)
--   - Admin internal notes
--   - Review locks (prevent double-processing)
--   - Safety signals/flags
--   - Permissions system
--   - Enhanced audit functions
--   - Server-side enforcement functions

-- ============================================================================
-- NEW ENUMS
-- ============================================================================

-- Report priority levels
do $$ begin
  create type report_priority as enum ('low', 'normal', 'high', 'critical');
exception
  when duplicate_object then null;
end $$;

-- Report status: extend existing pending/reviewing/resolved/dismissed with escalated
do $$ begin
  create type moderation_action_type as enum (
    'report_dismissed',
    'content_removed',
    'content_restored',
    'user_warned',
    'user_restricted',
    'user_suspended',
    'user_banned',
    'user_unbanned',
    'appeal_approved',
    'appeal_denied',
    'case_escalated',
    'flag_dismissed'
  );
exception
  when duplicate_object then null;
end $$;

-- Appeal status
do $$ begin
  create type appeal_status as enum ('pending', 'in_review', 'approved', 'denied');
exception
  when duplicate_object then null;
end $$;

-- Restriction types
do $$ begin
  create type restriction_type as enum (
    'posting_disabled',
    'messaging_disabled',
    'commenting_disabled',
    'following_disabled',
    'dating_disabled'
  );
exception
  when duplicate_object then null;
end $$;

-- User account status
do $$ begin
  create type account_status as enum ('active', 'restricted', 'suspended', 'banned', 'deleted');
exception
  when duplicate_object then null;
end $$;

-- Content moderation status (for posts, comments, stories, media)
do $$ begin
  create type content_moderation_status as enum ('visible', 'under_review', 'removed', 'restored');
exception
  when duplicate_object then null;
end $$;

-- Case status
do $$ begin
  create type case_status as enum ('open', 'in_review', 'resolved', 'escalated');
exception
  when duplicate_object then null;
end $$;

-- Target types for moderation actions
do $$ begin
  create type moderation_target_type as enum ('user', 'post', 'comment', 'story', 'message', 'media');
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- EXTEND EXISTING ENUMS
-- ============================================================================

-- Add new report reasons to cover safety categories
do $$ begin
  alter type report_reason add value if not exists 'minor_safety';
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter type report_reason add value if not exists 'self_harm';
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter type report_reason add value if not exists 'illegal_activity';
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter type report_reason add value if not exists 'privacy';
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter type report_reason add value if not exists 'scam';
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- EXTEND REPORTS TABLE
-- ============================================================================
alter table public.reports
  add column if not exists priority report_priority not null default 'normal';

alter table public.reports
  add column if not exists assigned_to uuid references public.users(id) on delete set null;

alter table public.reports
  add column if not exists assigned_at timestamptz;

alter table public.reports
  add column if not exists escalated_to uuid references public.users(id) on delete set null;

alter table public.reports
  add column if not exists escalated_at timestamptz;

alter table public.reports
  add column if not exists escalation_reason text;

alter table public.reports
  add column if not exists resolved_by uuid references public.users(id) on delete set null;

alter table public.reports
  add column if not exists resolved_at timestamptz;

alter table public.reports
  add column if not exists resolution_note text;

alter table public.reports
  add column if not exists duplicate_group_id uuid; -- Group related reports on same target

-- Add report for stories and media
alter table public.reports
  add column if not exists reported_story_id uuid references public.stories(id) on delete set null;

alter table public.reports
  add column if not exists reported_media_id uuid references public.media(id) on delete set null;

alter table public.reports
  add column if not exists reported_comment_id uuid references public.post_comments(id) on delete set null;

-- Indexes for efficient report queries
create index if not exists reports_priority_status_idx on public.reports (priority, status);
create index if not exists reports_assigned_to_idx on public.reports (assigned_to) where assigned_to is not null;
create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists reports_duplicate_group_idx on public.reports (duplicate_group_id) where duplicate_group_id is not null;

-- ============================================================================
-- MODERATION ACTIONS TABLE — History of all moderation actions
-- ============================================================================
create table if not exists public.moderation_actions (
  id                uuid                    default gen_random_uuid() primary key,
  moderator_id      uuid                    not null references public.users(id) on delete cascade,
  action_type       moderation_action_type  not null,
  target_type       moderation_target_type  not null,
  target_id         text                    not null, -- UUID of the target
  reason_code       text,                    -- Centralized reason code
  reason            text,                    -- Human-readable reason
  details           jsonb                   default '{}'::jsonb,
  policy_version    text,                    -- Policy version at time of action
  created_at        timestamptz             not null default now()
);

create index if not exists moderation_actions_target_idx on public.moderation_actions (target_type, target_id);
create index if not exists moderation_actions_moderator_idx on public.moderation_actions (moderator_id);
create index if not exists moderation_actions_created_at_idx on public.moderation_actions (created_at desc);
create index if not exists moderation_actions_action_type_idx on public.moderation_actions (action_type);

-- ============================================================================
-- USER WARNINGS TABLE
-- ============================================================================
create table if not exists public.user_warnings (
  id                uuid        default gen_random_uuid() primary key,
  user_id           uuid        not null references public.users(id) on delete cascade,
  issued_by         uuid        not null references public.users(id) on delete cascade,
  reason_code       text        not null,
  reason            text        not null,
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now()
);

create index if not exists user_warnings_user_idx on public.user_warnings (user_id, created_at desc);
create index if not exists user_warnings_active_idx on public.user_warnings (user_id) where is_active = true;

-- ============================================================================
-- USER RESTRICTIONS TABLE — Fine-grained capability controls
-- ============================================================================
create table if not exists public.user_restrictions (
  id                uuid                default gen_random_uuid() primary key,
  user_id           uuid                not null references public.users(id) on delete cascade,
  restriction_type  restriction_type    not null,
  reason_code       text                not null,
  reason            text,
  issued_by         uuid                not null references public.users(id) on delete cascade,
  expires_at        timestamptz,        -- NULL means permanent until removed
  is_active         boolean             not null default true,
  created_at        timestamptz         not null default now(),
  lifted_at         timestamptz,
  lifted_by         uuid                references public.users(id) on delete set null,

  unique (user_id, restriction_type, is_active) where is_active = true
);

create index if not exists user_restrictions_active_idx on public.user_restrictions (user_id) where is_active = true;
create index if not exists user_restrictions_type_idx on public.user_restrictions (restriction_type, is_active);

-- ============================================================================
-- APPEALS TABLE
-- ============================================================================
create table if not exists public.appeals (
  id                    uuid            default gen_random_uuid() primary key,
  user_id               uuid            not null references public.users(id) on delete cascade,
  moderation_action_id  uuid            references public.moderation_actions(id) on delete set null,
  reason                text            not null,
  status                appeal_status   not null default 'pending',
  decision_note         text,
  resolved_by           uuid            references public.users(id) on delete set null,
  resolved_at           timestamptz,
  created_at            timestamptz     not null default now(),
  updated_at            timestamptz     not null default now()
);

create index if not exists appeals_user_idx on public.appeals (user_id, created_at desc);
create index if not exists appeals_status_idx on public.appeals (status);
create index if not exists appeals_moderation_action_idx on public.appeals (moderation_action_id);

-- ============================================================================
-- MODERATION CASES — Group multiple reports and actions for a single case
-- ============================================================================
create table if not exists public.moderation_cases (
  id                uuid                default gen_random_uuid() primary key,
  target_type       moderation_target_type not null,
  target_id         text                not null, -- UUID of the subject
  status            case_status         not null default 'open',
  priority          report_priority     not null default 'normal',
  assigned_to       uuid                references public.users(id) on delete set null,
  assigned_at       timestamptz,
  escalated_to      uuid                references public.users(id) on delete set null,
  escalated_at      timestamptz,
  escalation_reason text,
  resolved_by       uuid                references public.users(id) on delete set null,
  resolved_at       timestamptz,
  created_at        timestamptz         not null default now(),
  updated_at        timestamptz         not null default now()
);

create index if not exists moderation_cases_target_idx on public.moderation_cases (target_type, target_id);
create index if not exists moderation_cases_status_idx on public.moderation_cases (status);
create index if not exists moderation_cases_assigned_idx on public.moderation_cases (assigned_to) where assigned_to is not null;

-- ============================================================================
-- MODERATION CASE ITEMS — Link reports to cases
-- ============================================================================
create table if not exists public.moderation_case_items (
  case_id     uuid    not null references public.moderation_cases(id) on delete cascade,
  report_id   uuid    not null references public.reports(id) on delete cascade,
  created_at  timestamptz not null default now(),

  primary key (case_id, report_id)
);

-- ============================================================================
-- ADMIN INTERNAL NOTES — Private moderator notes
-- ============================================================================
create table if not exists public.admin_notes (
  id          uuid        default gen_random_uuid() primary key,
  author_id   uuid        not null references public.users(id) on delete cascade,
  target_type text        not null, -- 'report', 'user', 'case', 'appeal'
  target_id   uuid        not null,
  content     text        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists admin_notes_target_idx on public.admin_notes (target_type, target_id);
create index if not exists admin_notes_author_idx on public.admin_notes (author_id);

-- ============================================================================
-- REVIEW LOCKS — Prevent duplicate processing
-- ============================================================================
create table if not exists public.review_locks (
  id                uuid        default gen_random_uuid() primary key,
  locked_by         uuid        not null references public.users(id) on delete cascade,
  target_type       text        not null, -- 'report', 'case'
  target_id         uuid        not null,
  locked_at         timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '30 minutes',

  unique (target_type, target_id),
  constraint review_locks_target_check check (target_type in ('report', 'case'))
);

create index if not exists review_locks_expires_idx on public.review_locks (expires_at);
create index if not exists review_locks_locked_by_idx on public.review_locks (locked_by);

-- ============================================================================
-- SAFETY SIGNALS / FLAGS — Automated safety detection
-- ============================================================================
create table if not exists public.safety_flags (
  id            uuid        default gen_random_uuid() primary key,
  flag_type     text        not null, -- 'rapid_follows', 'rapid_messages', 'spam_content', 'duplicate_content'
  severity      integer     not null default 1 check (severity >= 1 and severity <= 10),
  target_type   text        not null, -- 'user', 'post', 'message', 'media'
  target_id     uuid        not null,
  signal_data   jsonb       default '{}'::jsonb,
  is_reviewed   boolean     not null default false,
  reviewed_by   uuid        references public.users(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists safety_flags_unreviewed_idx on public.safety_flags (severity desc, created_at)
  where is_reviewed = false;

create index if not exists safety_flags_target_idx on public.safety_flags (target_type, target_id);
create index if not exists safety_flags_type_idx on public.safety_flags (flag_type);

-- ============================================================================
-- PERMISSIONS DEFINITION TABLE — Centralized role-to-permission mapping
-- ============================================================================
create table if not exists public.admin_permissions (
  id           uuid        default gen_random_uuid() primary key,
  role         user_role   not null unique,
  permissions  text[]      not null default '{}',
  updated_by   uuid        references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ============================================================================
-- INSERT DEFAULT PERMISSIONS
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
    'reports.assign'
  ]),
  ('admin', ARRAY[
    'users.view', 'users.restrict', 'users.suspend', 'users.ban',
    'content.view', 'content.remove', 'content.restore',
    'reports.view', 'reports.resolve',
    'appeals.view', 'appeals.resolve',
    'analytics.view',
    'audit.view',
    'admin.notes',
    'reports.assign'
  ]),
  ('moderator', ARRAY[
    'users.view', 'users.restrict',
    'content.view', 'content.remove', 'content.restore',
    'reports.view', 'reports.resolve',
    'appeals.view',
    'admin.notes',
    'reports.assign'
  ]),
  ('support', ARRAY[
    'users.view',
    'reports.view',
    'appeals.view'
  ])
on conflict (role) do nothing;

-- ============================================================================
-- EXTEND ADMIN AUDIT LOG — Add action type and ensure consistency
-- ============================================================================
alter table public.admin_audit_log
  add column if not exists action_type moderation_action_type;

alter table public.admin_audit_log
  add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.admin_audit_log
  alter column details type jsonb using details::jsonb;

-- ============================================================================
-- EXTEND USERS TABLE — Add account status field
-- ============================================================================
alter table public.users
  add column if not exists account_status account_status not null default 'active';

alter table public.users
  add column if not exists suspended_until timestamptz;

alter table public.users
  add column if not exists suspension_reason text;

alter table public.users
  add column if not exists banned_by uuid references public.users(id) on delete set null;

alter table public.users
  add column if not exists banned_at timestamptz;

alter table public.users
  add column if not exists ban_reason text;

-- ============================================================================
-- EXTEND CONTENT TABLES — Add moderation status columns
-- ============================================================================
alter table public.posts
  add column if not exists moderation_status content_moderation_status not null default 'visible';

alter table public.posts
  add column if not exists removed_at timestamptz;

alter table public.posts
  add column if not exists removed_by uuid references public.users(id) on delete set null;

alter table public.posts
  add column if not exists removal_reason text;

alter table public.posts
  add column if not exists restored_at timestamptz;

alter table public.posts
  add column if not exists restored_by uuid references public.users(id) on delete set null;

alter table public.post_comments
  add column if not exists moderation_status content_moderation_status not null default 'visible';

alter table public.post_comments
  add column if not exists removed_at timestamptz;

alter table public.post_comments
  add column if not exists removed_by uuid references public.users(id) on delete set null;

alter table public.post_comments
  add column if not exists removal_reason text;

alter table public.post_comments
  add column if not exists restored_at timestamptz;

alter table public.post_comments
  add column if not exists restored_by uuid references public.users(id) on delete set null;

alter table public.stories
  add column if not exists moderation_status content_moderation_status not null default 'visible';

alter table public.stories
  add column if not exists removed_at timestamptz;

alter table public.stories
  add column if not exists removed_by uuid references public.users(id) on delete set null;

alter table public.stories
  add column if not exists removal_reason text;

alter table public.stories
  add column if not exists restored_at timestamptz;

alter table public.stories
  add column if not exists restored_by uuid references public.users(id) on delete set null;

alter table public.media
  add column if not exists moderation_status content_moderation_status not null default 'visible';

alter table public.media
  add column if not exists removed_at timestamptz;

alter table public.media
  add column if not exists removed_by uuid references public.users(id) on delete set null;

alter table public.media
  add column if not exists removal_reason text;

alter table public.media
  add column if not exists restored_at timestamptz;

alter table public.media
  add column if not exists restored_by uuid references public.users(id) on delete set null;

-- ============================================================================
-- UPDATE EXISTING CONTENT TO MATCH NEW STATUS FIELDS
-- ============================================================================
update public.posts set moderation_status = 'visible' where moderation_status = 'visible' and deleted_at is null;
update public.posts set moderation_status = 'removed' where deleted_at is not null and moderation_status = 'visible';
update public.post_comments set moderation_status = 'visible' where moderation_status = 'visible' and deleted_at is null;
update public.post_comments set moderation_status = 'removed' where deleted_at is not null and moderation_status = 'visible';
update public.stories set moderation_status = 'visible' where moderation_status = 'visible' and deleted_at is null;
update public.stories set moderation_status = 'removed' where deleted_at is not null and moderation_status = 'visible';
update public.media set moderation_status = 'visible' where moderation_status = 'visible' and deleted_at is null;
update public.media set moderation_status = 'removed' where deleted_at is not null and moderation_status = 'visible';

-- ============================================================================
-- TRIGGER: set_updated_at for new tables
-- ============================================================================
create trigger set_updated_at before update on public.appeals
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.moderation_cases
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.admin_notes
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.admin_permissions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TRIGGER: Sync is_banned with account_status
-- ============================================================================
create or replace function public.sync_account_status()
returns trigger
language plpgsql
as $$
begin
  if new.account_status = 'banned' then
    new.is_banned := true;
  elsif new.account_status = 'active' or new.account_status = 'restricted' then
    new.is_banned := false;
  end if;
  return new;
end;
$$;

create trigger sync_account_status before insert or update on public.users
  for each row execute function public.sync_account_status();

-- ============================================================================
-- TRIGGER: Auto-expire temporary restrictions
-- ============================================================================
create or replace function public.expire_restrictions()
returns trigger
language plpgsql
as $$
begin
  if new.expires_at is not null and new.expires_at <= now() then
    new.is_active := false;
    new.lifted_at := now();
  end if;
  return new;
end;
$$;

create trigger expire_restrictions before update on public.user_restrictions
  for each row execute function public.expire_restrictions();

-- ============================================================================
-- TRIGGER: Auto-validate report priority for critical safety categories
-- ============================================================================
create or replace function public.validate_report_priority()
returns trigger
language plpgsql
as $$
begin
  -- Critical safety categories automatically set priority to critical
  if new.reason in ('minor_safety', 'self_harm', 'illegal_activity') then
    new.priority := 'critical';
  elsif new.reason in ('violence', 'harassment') then
    -- High severity harassment/violence
    if new.priority = 'normal' or new.priority is null then
      new.priority := 'high';
    end if;
  end if;

  -- Default priority
  if new.priority is null then
    new.priority := 'normal';
  end if;

  -- Link to duplicate group if same target exists
  if new.reported_user_id is not null then
    select id into new.duplicate_group_id
    from public.reports
    where reported_user_id = new.reported_user_id
      and status in ('pending', 'reviewing')
      and id != new.id
    limit 1;
  elsif new.reported_post_id is not null then
    select id into new.duplicate_group_id
    from public.reports
    where reported_post_id = new.reported_post_id
      and status in ('pending', 'reviewing')
      and id != new.id
    limit 1;
  end if;

  return new;
end;
$$;

create trigger validate_report_priority before insert on public.reports
  for each row execute function public.validate_report_priority();

-- ============================================================================
-- TRIGGER: Ensure suspension_until is respected (for recurring check)
-- ============================================================================
create or replace function public.check_suspension_expiry()
returns trigger
language plpgsql
as $$
begin
  if old.suspended_until is not null
     and old.account_status = 'suspended'
     and new.suspended_until <= now() then
    new.account_status := 'active';
    new.suspended_until := null;
    new.suspension_reason := null;
  end if;
  return new;
end;
$$;

create trigger check_suspension_expiry before update on public.users
  for each row execute function public.check_suspension_expiry();

-- ============================================================================
-- TRIGGER: Auto-remove review locks on resolution
-- ============================================================================
create or replace function public.cleanup_review_locks()
returns trigger
language plpgsql
as $$
begin
  -- Clean up review locks when reports are resolved or dismissed
  if new.status in ('resolved', 'dismissed') and old.status not in ('resolved', 'dismissed') then
    delete from public.review_locks
    where target_type = 'report' and target_id = old.id;
  end if;
  return new;
end;
$$;

create trigger cleanup_review_locks after update on public.reports
  for each row execute function public.cleanup_review_locks();

-- ============================================================================
-- FUNCTION: get_admin_permissions — Get permissions for a user role
-- ============================================================================
create or replace function public.get_admin_permissions(p_role user_role)
returns text[]
language sql
stable
as $$
  select coalesce(
    (select permissions from public.admin_permissions where role = p_role),
    '{}'::text[]
  );
$$;

-- ============================================================================
-- FUNCTION: has_admin_permission — Check if current user has a specific permission
-- ============================================================================
create or replace function public.has_admin_permission(p_permission text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.admin_permissions ap
    join public.users u on u.role = ap.role
    where u.id = auth.uid()
      and p_permission = any(ap.permissions)
  );
$$;

-- ============================================================================
-- FUNCTION: can_moderate — Generalized permission check
-- ============================================================================
create or replace function public.can_moderate(p_permission text)
returns boolean
language sql
stable
as $$
  select public.has_admin_permission(p_permission);
$$;

-- ============================================================================
-- FUNCTION: create_moderation_action — Record a moderation action and audit log
-- ============================================================================
create or replace function public.create_moderation_action(
  p_moderator_id uuid,
  p_action_type moderation_action_type,
  p_target_type moderation_target_type,
  p_target_id text,
  p_reason_code text default null,
  p_reason text default null,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_action_id uuid;
begin
  -- Create moderation action record
  insert into public.moderation_actions (
    moderator_id, action_type, target_type, target_id,
    reason_code, reason, details
  )
  values (
    p_moderator_id, p_action_type, p_target_type, p_target_id,
    p_reason_code, p_reason, p_details
  )
  returning id into v_action_id;

  -- Create audit log entry
  insert into public.admin_audit_log (
    admin_id, action, action_type, entity_type, entity_id, details
  )
  values (
    p_moderator_id,
    p_action_type::text,
    p_action_type,
    p_target_type::text,
    p_target_id,
    jsonb_build_object(
      'moderation_action_id', v_action_id,
      'reason_code', p_reason_code,
      'reason', p_reason,
      'details', p_details
    )
  );

  return v_action_id;
end;
$$;

-- ============================================================================
-- FUNCTION: check_user_restrictions — Check if user has a specific restriction
-- ============================================================================
create or replace function public.check_user_restriction(
  p_user_id uuid,
  p_restriction_type restriction_type
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_restrictions
    where user_id = p_user_id
      and restriction_type = p_restriction_type
      and is_active = true
      and (expires_at is null or expires_at > now())
  );
$$;

-- ============================================================================
-- FUNCTION: get_user_moderation_status — Get full moderation status for a user
-- ============================================================================
create or replace function public.get_user_moderation_status(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
as $$
declare
  v_user record;
  v_active_warnings bigint;
  v_active_restrictions jsonb;
  v_pending_reports bigint;
  v_pending_appeals bigint;
begin
  -- Get user
  select * into v_user from public.users where id = p_user_id;

  if not found then
    return null;
  end if;

  -- Count active warnings
  select count(*) into v_active_warnings
  from public.user_warnings
  where user_id = p_user_id and is_active = true;

  -- Get active restrictions
  select jsonb_agg(jsonb_build_object(
    'type', restriction_type,
    'expires_at', expires_at,
    'reason', reason
  )) into v_active_restrictions
  from public.user_restrictions
  where user_id = p_user_id and is_active = true
    and (expires_at is null or expires_at > now());

  -- Count pending reports (where user is the target)
  select count(*) into v_pending_reports
  from public.reports
  where reported_user_id = p_user_id
    and status in ('pending', 'reviewing');

  -- Count pending appeals
  select count(*) into v_pending_appeals
  from public.appeals
  where user_id = p_user_id and status in ('pending', 'in_review');

  return jsonb_build_object(
    'account_status', v_user.account_status,
    'is_banned', v_user.is_banned,
    'is_active', v_user.is_active,
    'suspended_until', v_user.suspended_until,
    'active_warnings', v_active_warnings,
    'active_restrictions', coalesce(v_active_restrictions, '[]'::jsonb),
    'pending_reports', v_pending_reports,
    'pending_appeals', v_pending_appeals
  );
end;
$$;

-- ============================================================================
-- FUNCTION: can_user_post — Server-side posting eligibility check
-- ============================================================================
create or replace function public.can_user_post(p_user_id uuid)
returns boolean
language plpgsql
stable
as $$
begin
  -- Check account status
  if exists (
    select 1 from public.users
    where id = p_user_id
      and (is_banned = true or is_active = false or account_status in ('suspended', 'banned'))
  ) then
    return false;
  end if;

  -- Check posting restriction
  if public.check_user_restriction(p_user_id, 'posting_disabled') then
    return false;
  end if;

  return true;
end;
$$;

-- ============================================================================
-- FUNCTION: can_user_message — Server-side messaging eligibility check
-- ============================================================================
create or replace function public.can_user_message(p_user_id uuid)
returns boolean
language plpgsql
stable
as $$
begin
  -- Check account status
  if exists (
    select 1 from public.users
    where id = p_user_id
      and (is_banned = true or is_active = false or account_status in ('suspended', 'banned'))
  ) then
    return false;
  end if;

  -- Check messaging restriction
  if public.check_user_restriction(p_user_id, 'messaging_disabled') then
    return false;
  end if;

  return true;
end;
$$;

-- ============================================================================
-- FUNCTION: can_user_comment — Server-side commenting eligibility check
-- ============================================================================
create or replace function public.can_user_comment(p_user_id uuid)
returns boolean
language plpgsql
stable
as $$
begin
  if exists (
    select 1 from public.users
    where id = p_user_id
      and (is_banned = true or is_active = false or account_status in ('suspended', 'banned'))
  ) then
    return false;
  end if;

  if public.check_user_restriction(p_user_id, 'commenting_disabled') then
    return false;
  end if;

  return true;
end;
$$;

-- ============================================================================
-- FUNCTION: can_user_follow — Server-side following eligibility check
-- ============================================================================
create or replace function public.can_user_follow(p_user_id uuid)
returns boolean
language plpgsql
stable
as $$
begin
  if exists (
    select 1 from public.users
    where id = p_user_id
      and (is_banned = true or is_active = false or account_status in ('suspended', 'banned'))
  ) then
    return false;
  end if;

  if public.check_user_restriction(p_user_id, 'following_disabled') then
    return false;
  end if;

  return true;
end;
$$;

-- ============================================================================
-- FUNCTION: can_user_date — Server-side dating eligibility check
-- ============================================================================
create or replace function public.can_user_date(p_user_id uuid)
returns boolean
language plpgsql
stable
as $$
begin
  if exists (
    select 1 from public.users
    where id = p_user_id
      and (is_banned = true or is_active = false or account_status in ('suspended', 'banned'))
  ) then
    return false;
  end if;

  if public.check_user_restriction(p_user_id, 'dating_disabled') then
    return false;
  end if;

  return true;
end;
$$;

-- ============================================================================
-- FUNCTION: get_moderation_dashboard_metrics — Aggregate admin dashboard data
-- ============================================================================
create or replace function public.get_moderation_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
as $$
declare
  v_metrics jsonb;
begin
  select jsonb_build_object(
    'new_users_today', (
      select count(*) from public.users
      where created_at >= current_date
    ),
    'active_users_today', (
      select count(*) from public.users
      where last_seen_at >= current_date
        and is_active = true and is_banned = false
    ),
    'open_reports', (
      select count(*) from public.reports
      where status in ('pending', 'reviewing')
    ),
    'critical_reports', (
      select count(*) from public.reports
      where status in ('pending', 'reviewing')
        and priority = 'critical'
    ),
    'banned_users', (
      select count(*) from public.users
      where account_status = 'banned'
    ),
    'suspended_users', (
      select count(*) from public.users
      where account_status = 'suspended'
    ),
    'pending_appeals', (
      select count(*) from public.appeals
      where status in ('pending', 'in_review')
    ),
    'unreviewed_flags', (
      select count(*) from public.safety_flags
      where is_reviewed = false
    ),
    'reports_today', (
      select count(*) from public.reports
      where created_at >= current_date
    ),
    'content_removed_today', (
      select count(*) from public.moderation_actions
      where action_type = 'content_removed'
        and created_at >= current_date
    )
  ) into v_metrics;

  return v_metrics;
end;
$$;

-- ============================================================================
-- FUNCTION: resolve_duplicate_reports — Close duplicate reports on resolution
-- ============================================================================
create or replace function public.resolve_duplicate_reports()
returns trigger
language plpgsql
as $$
begin
  -- Guard against trigger recursion
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- If a report is resolved/dismissed with a duplicate_group_id,
  -- resolve all related reports in the same group
  if new.status in ('resolved', 'dismissed')
     and old.status not in ('resolved', 'dismissed')
     and new.duplicate_group_id is not null then

    update public.reports
    set status = new.status,
        resolved_by = new.resolved_by,
        resolved_at = now(),
        reviewed_by = new.reviewed_by,
        reviewed_at = now()
    where duplicate_group_id = new.duplicate_group_id
      and status in ('pending', 'reviewing')
      and id != new.id;
  end if;

  return new;
end;
$$;

create trigger resolve_duplicate_reports after update on public.reports
  for each row execute function public.resolve_duplicate_reports();

-- ============================================================================
-- FUNCTIONS: Auto-create user restrictions when banning/suspending
-- ============================================================================
create or replace function public.apply_ban_restrictions()
returns trigger
language plpgsql
as $$
begin
  if new.account_status = 'banned' and old.account_status != 'banned' then
    -- Apply all restrictions when banned
    insert into public.user_restrictions (user_id, restriction_type, reason_code, reason, issued_by, is_active)
    values
      (new.id, 'posting_disabled', 'account_banned', 'Account banned', new.banned_by, true),
      (new.id, 'messaging_disabled', 'account_banned', 'Account banned', new.banned_by, true),
      (new.id, 'commenting_disabled', 'account_banned', 'Account banned', new.banned_by, true),
      (new.id, 'following_disabled', 'account_banned', 'Account banned', new.banned_by, true),
      (new.id, 'dating_disabled', 'account_banned', 'Account banned', new.banned_by, true)
    on conflict (user_id, restriction_type, is_active) where is_active = true do nothing;
  elsif new.account_status = 'active' and old.account_status in ('banned', 'suspended') then
    -- Lift all restrictions when unbanned
    update public.user_restrictions
    set is_active = false, lifted_at = now()
    where user_id = new.id and is_active = true;
  end if;
  return new;
end;
$$;

create trigger apply_ban_restrictions after update on public.users
  for each row execute function public.apply_ban_restrictions();

-- ============================================================================
-- FUNCTIONS: Create notification when user is warned/restricted/suspended/banned
-- ============================================================================
create or replace function public.notify_moderation_action()
returns trigger
language plpgsql
as $$
declare
  v_title text;
  v_body text;
  v_type notification_type;
begin
  -- Only notify on new actions
  if tg_op = 'INSERT' then
    case new.action_type
      when 'user_warned' then
        v_title := 'Warning';
        v_body := 'You have received a warning.';
        v_type := 'system';
      when 'user_restricted' then
        v_title := 'Account Restriction';
        v_body := 'Some account features have been restricted.';
        v_type := 'system';
      when 'user_suspended' then
        v_title := 'Account Suspended';
        v_body := 'Your account has been temporarily suspended.';
        v_type := 'system';
      when 'user_banned' then
        v_title := 'Account Banned';
        v_body := 'Your account has been banned.';
        v_type := 'system';
      when 'user_unbanned' then
        v_title := 'Account Restored';
        v_body := 'Your account has been restored.';
        v_type := 'system';
      when 'content_restored' then
        v_title := 'Content Restored';
        v_body := 'Your content has been restored.';
        v_type := 'system';
      when 'appeal_approved' then
        v_title := 'Appeal Approved';
        v_body := 'Your appeal has been approved.';
        v_type := 'system';
      when 'appeal_denied' then
        v_title := 'Appeal Denied';
        v_body := 'Your appeal has been reviewed and was not approved.';
        v_type := 'system';
      else
        return new;
    end case;

    -- Insert notification for the affected user
    insert into public.notifications (
      recipient_id, type, actor_id, entity_type, entity_id,
      title, body, channel, is_read, created_at
    )
    values (
      new.target_id::uuid, v_type, new.moderator_id, new.target_type::text, new.id::text,
      v_title, v_body, 'in_app', false, now()
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger notify_moderation_action after insert on public.moderation_actions
  for each row execute function public.notify_moderation_action();

-- ============================================================================
-- ENABLE RLS ON NEW TABLES
-- ============================================================================
alter table public.moderation_actions enable row level security;
alter table public.user_warnings enable row level security;
alter table public.user_restrictions enable row level security;
alter table public.appeals enable row level security;
alter table public.moderation_cases enable row level security;
alter table public.moderation_case_items enable row level security;
alter table public.admin_notes enable row level security;
alter table public.review_locks enable row level security;
alter table public.safety_flags enable row level security;
alter table public.admin_permissions enable row level security;

-- ============================================================================
-- RLS POLICIES — MODERATION ACTIONS
-- ============================================================================
-- Moderators and above can read
create policy "Moderators can read moderation actions"
  on public.moderation_actions for select
  using (public.is_moderator());

-- Only service-role inserts (via create_moderation_action function)
create policy "Server-side insert only"
  on public.moderation_actions for insert
  with check (public.is_moderator());

-- ============================================================================
-- RLS POLICIES — USER WARNINGS
-- ============================================================================
create policy "Moderators can read warnings"
  on public.user_warnings for select
  using (public.is_moderator() or user_id = auth.uid());

create policy "Moderators can issue warnings"
  on public.user_warnings for insert
  with check (public.is_moderator());

create policy "Moderators can update warnings"
  on public.user_warnings for update
  using (public.is_moderator())
  with check (public.is_moderator());

-- ============================================================================
-- RLS POLICIES — USER RESTRICTIONS
-- ============================================================================
create policy "Moderators can read restrictions"
  on public.user_restrictions for select
  using (public.is_moderator() or user_id = auth.uid());

create policy "Moderators can create restrictions"
  on public.user_restrictions for insert
  with check (public.is_moderator());

create policy "Moderators can update restrictions"
  on public.user_restrictions for update
  using (public.is_moderator())
  with check (public.is_moderator());

-- ============================================================================
-- RLS POLICIES — APPEALS
-- ============================================================================
create policy "Users can see own appeals"
  on public.appeals for select
  using (user_id = auth.uid() or public.is_moderator());

create policy "Users can create appeals"
  on public.appeals for insert
  with check (user_id = auth.uid());

create policy "Moderators can update appeals"
  on public.appeals for update
  using (public.is_moderator())
  with check (public.is_moderator());

-- ============================================================================
-- RLS POLICIES — MODERATION CASES
-- ============================================================================
create policy "Moderators can read cases"
  on public.moderation_cases for select
  using (public.is_moderator());

create policy "Moderators can manage cases"
  on public.moderation_cases for insert
  with check (public.is_moderator());

create policy "Moderators can update cases"
  on public.moderation_cases for update
  using (public.is_moderator())
  with check (public.is_moderator());

-- ============================================================================
-- RLS POLICIES — MODERATION CASE ITEMS
-- ============================================================================
create policy "Moderators can read case items"
  on public.moderation_case_items for select
  using (public.is_moderator());

create policy "Moderators can manage case items"
  on public.moderation_case_items for insert
  with check (public.is_moderator());

-- ============================================================================
-- RLS POLICIES — ADMIN NOTES
-- ============================================================================
create policy "Moderators can read admin notes"
  on public.admin_notes for select
  using (public.is_moderator());

create policy "Moderators can create notes"
  on public.admin_notes for insert
  with check (public.is_moderator());

-- ============================================================================
-- RLS POLICIES — REVIEW LOCKS
-- ============================================================================
create policy "Moderators can read review locks"
  on public.review_locks for select
  using (public.is_moderator());

create policy "Moderators can manage review locks"
  on public.review_locks for insert
  with check (public.is_moderator());

create policy "Moderators can delete review locks"
  on public.review_locks for delete
  using (public.is_moderator());

-- ============================================================================
-- RLS POLICIES — SAFETY FLAGS
-- ============================================================================
create policy "Moderators can read safety flags"
  on public.safety_flags for select
  using (public.is_moderator());

create policy "Moderators can update safety flags"
  on public.safety_flags for update
  using (public.is_moderator())
  with check (public.is_moderator());

-- ============================================================================
-- RLS POLICIES — ADMIN PERMISSIONS
-- ============================================================================
create policy "Admins can read permissions"
  on public.admin_permissions for select
  using (public.is_admin());

create policy "Super admins can manage permissions"
  on public.admin_permissions for all
  using (exists (
    select 1 from public.users where id = auth.uid() and role = 'super_admin'
  ))
  with check (exists (
    select 1 from public.users where id = auth.uid() and role = 'super_admin'
  ));

-- ============================================================================
-- UPDATE EXISTING RLS FOR REPORTS — Add new columns
-- ============================================================================
-- Add policy for admin full access to reports
create policy "Admins can manage all reports"
  on public.reports for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- UPDATE RLS FOR MEDIA — Add moderation_status visibility
-- ============================================================================
drop policy if exists "Media is readable by owner and post viewers" on public.media;
create policy "Media is readable by owner and post viewers"
  on public.media for select
  using (
    owner_id = auth.uid()
    or (
      moderation_status = 'visible'
      and exists (
        select 1 from public.post_media where media_id = id
        and exists (
          select 1 from public.posts where id = post_id
          and (visibility = 'public' or author_id = auth.uid())
        )
      )
    )
    or public.is_moderator()
  );

-- ============================================================================
-- UPDATE RLS FOR POSTS — Add moderation_status visibility
-- ============================================================================
drop policy if exists "Public posts are readable" on public.posts;
create policy "Public posts are readable"
  on public.posts for select
  using (
    moderation_status = 'visible'
    and deleted_at is null
    and (
      visibility = 'public'
      or (visibility = 'followers_only' and exists (
        select 1 from public.follows
        where follower_id = auth.uid() and following_id = author_id
      ))
      or author_id = auth.uid()
      or public.is_moderator()
    )
  );

-- ============================================================================
-- UPDATE RLS FOR POST COMMENTS — Add moderation_status visibility
-- ============================================================================
drop policy if exists "Post comments are readable" on public.post_comments;
create policy "Post comments are readable"
  on public.post_comments for select
  using (
    (moderation_status = 'visible' and deleted_at is null)
    or public.is_moderator()
  );

-- ============================================================================
-- UPDATE RLS FOR STORIES — Add moderation_status visibility
-- ============================================================================
drop policy if exists "Stories readable by followers or if public" on public.stories;
create policy "Stories readable by followers or if public"
  on public.stories for select
  using (
    moderation_status = 'visible'
    and deleted_at is null
    and expires_at > now()
    and (
      author_id = auth.uid()
      or visibility = 'public'
      or (visibility = 'followers_only' and exists (
        select 1 from public.follows
        where follower_id = auth.uid() and following_id = author_id
      ))
      or public.is_moderator()
    )
  );

-- ============================================================================
-- VERIFY EXISTING INDEXES AND ADD NEW ONES
-- ============================================================================
-- These indexes optimize the admin/moderation queries
create index if not exists users_account_status_idx on public.users (account_status);
create index if not exists users_banned_idx on public.users (is_banned) where is_banned = true;
create index if not exists posts_moderation_status_idx on public.posts (moderation_status) where moderation_status != 'visible';
create index if not exists comments_moderation_status_idx on public.post_comments (moderation_status) where moderation_status != 'visible';
create index if not exists stories_moderation_status_idx on public.stories (moderation_status) where moderation_status != 'visible';
create index if not exists media_moderation_status_idx on public.media (moderation_status) where moderation_status != 'visible';
create index if not exists reports_reported_user_idx on public.reports (reported_user_id) where reported_user_id is not null;
create index if not exists reports_reported_post_idx on public.reports (reported_post_id) where reported_post_id is not null;
