-- Vibe Database — Analytics Foundation
-- Lightweight event tracking for product analytics.
-- High-volume analytics should eventually move to a dedicated analytics
-- pipeline (e.g., ClickHouse, BigQuery, or a dedicated event-tracking service).

-- ============================================================================
-- ANALYTICS EVENTS — User action events
-- ============================================================================
create table public.analytics_events (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references public.users(id) on delete set null,
  event_name  text        not null,
  entity_type text,
  entity_id   text,
  properties  jsonb       default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Index for querying events by name and time range
create index analytics_events_name_created_at_idx
  on public.analytics_events (event_name, created_at desc);

-- Index for user-specific event queries
create index analytics_events_user_id_idx
  on public.analytics_events (user_id, created_at desc);

-- Partition hint: when this table grows large, consider partitioning by
-- created_at (e.g., monthly partitions) or moving high-volume events
-- to a dedicated analytics service.

comment on table public.analytics_events is
  'Lightweight event tracking. High-volume analytics should be moved to a dedicated analytics pipeline. Consider partitioning by created_at for large datasets.';
