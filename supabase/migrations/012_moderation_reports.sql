-- Vibe Database — Moderation & Reports
-- User/content reporting system for moderation workflows.

-- ============================================================================
-- REPORTS — User-generated reports on users and content
-- ============================================================================
create table public.reports (
  id                uuid          default gen_random_uuid() primary key,
  reporter_id       uuid          not null references public.users(id) on delete cascade,
  reported_user_id  uuid          references public.users(id) on delete set null,
  reported_post_id  uuid          references public.posts(id) on delete set null,
  reported_message_id uuid       references public.messages(id) on delete set null,
  reason            report_reason not null,
  details           text,
  status            report_status not null default 'pending',
  reviewed_by       uuid          references public.users(id) on delete set null,
  reviewed_at       timestamptz,
  created_at        timestamptz   not null default now()
);

-- Moderation queue: pending reports, newest first
create index reports_pending_idx on public.reports (created_at desc)
  where status = 'pending';

-- Moderation queue by reviewer
create index reports_reviewer_idx on public.reports (reviewed_by)
  where reviewed_by is not null;

create index reports_reporter_idx on public.reports (reporter_id);
create index reports_reported_user_idx on public.reports (reported_user_id);
