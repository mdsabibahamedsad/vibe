-- Vibe Database — Recommendation + Matching Intelligence Engine (Prompt 13)
-- Adds:
--   - recommendation_impressions: track candidate exposure and attribution
--   - recommendation_config: versioned ranking configuration
--   - Indexes for efficient feedback queries
--   - RLS policies for impression privacy

-- ============================================================================
-- RECOMMENDATION IMPRESSIONS
-- ============================================================================
-- Tracks when a candidate profile was shown to a viewer.
-- Used for ranking evaluation, feedback loops, and avoiding repeated exposure.
-- Privacy: stores only exposure metadata, never private message content.

create table if not exists public.recommendation_impressions (
  id                uuid          default gen_random_uuid() primary key,
  viewer_id         uuid          not null references public.users(id) on delete cascade,
  candidate_id      uuid          not null references public.users(id) on delete cascade,
  mode              text          not null default 'social', -- 'social' | 'dating'
  request_id        uuid          not null,                  -- groups impressions from one request
  ranking_version   text          not null default 'v1',
  position          smallint      not null,                  -- 0-based position in results
  score_bucket      text,                                    -- 'high' | 'medium' | 'low' | null
  interaction_type  text,                                    -- 'like' | 'pass' | 'follow' | 'view' | null
  interacted_at     timestamptz,                             -- when user interacted
  created_at        timestamptz   not null default now()
);

-- Indexes for efficient query patterns
create index if not exists impressions_viewer_idx
  on public.recommendation_impressions (viewer_id, created_at desc);

create index if not exists impressions_candidate_idx
  on public.recommendation_impressions (candidate_id, created_at desc);

create index if not exists impressions_request_idx
  on public.recommendation_impressions (request_id);

-- Index for checking recently seen candidates
create index if not exists impressions_recent_seen_idx
  on public.recommendation_impressions (viewer_id, candidate_id, created_at desc);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.recommendation_impressions enable row level security;

-- Users can see their own impressions (what they were shown)
create policy "Users can see own impressions"
  on public.recommendation_impressions for select
  using (viewer_id = auth.uid());

-- Server-side services create impressions (via service_role bypasses RLS)
-- Users cannot directly insert impressions
create policy "Users cannot insert impressions directly"
  on public.recommendation_impressions for insert
  with check (false);

-- Users cannot update impressions
create policy "Users cannot update impressions"
  on public.recommendation_impressions for update
  using (false);

-- Users cannot delete impressions
create policy "Users cannot delete impressions"
  on public.recommendation_impressions for delete
  using (false);

-- ============================================================================
-- RETENTION FUNCTION
-- ============================================================================
-- Cleans up old impression data beyond the retention period.

create or replace function public.cleanup_recommendation_impressions(
  p_retention_days int default 90
)
returns int
language plpgsql
as $$
declare
  v_deleted int;
begin
  delete from public.recommendation_impressions
  where created_at < now() - (p_retention_days || ' days')::interval;
  
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ============================================================================
-- INDEXES FOR ANALYTICS QUERIES
-- ============================================================================

-- Index for match quality analysis
create index if not exists impressions_interaction_idx
  on public.recommendation_impressions (interaction_type, created_at desc)
  where interaction_type is not null;

-- Index for mode-specific analysis
create index if not exists impressions_mode_idx
  on public.recommendation_impressions (mode, created_at desc);
