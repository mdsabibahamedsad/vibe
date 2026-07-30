-- Vibe Database — Analytics Platform
-- Extends the existing analytics foundation with:
--   Event taxonomy, materialized views, funnel/retention/cohort analytics,
--   experiment platform, revenue reconciliation, data quality,
--   privacy controls, and performance infrastructure.

-- ============================================================================
-- 1. EVENT TAXONOMY — Registry of all known event names
-- ============================================================================
create table if not exists public.event_definitions (
    event_name       text primary key,
    description      text not null,
    category         text not null check (category in (
        'engagement', 'monetization', 'growth', 'moderation',
        'content', 'social', 'dating', 'system', 'advertising', 'support'
    )),
    schema_definition jsonb not null default '{}'::jsonb,
    is_sensitive     boolean not null default false,
    retention_days   integer not null default 365,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

-- Seed known event definitions
insert into public.event_definitions (event_name, description, category, schema_definition) values
    -- Onboarding
    ('telegram_launch', 'User launched the Telegram Mini App', 'growth', '{"required": ["platform"]}'),
    ('authentication_complete', 'User completed Telegram authentication', 'growth', '{"required": ["auth_method"]}'),
    ('onboarding_started', 'User began onboarding flow', 'growth', '{}'),
    ('onboarding_completed', 'User completed onboarding', 'growth', '{"required": ["completed_steps"]}'),
    ('profile_created', 'User created their profile', 'growth', '{}'),

    -- Engagement
    ('feed_impression', 'User viewed feed', 'engagement', '{"required": ["feed_type"]}'),
    ('post_view', 'User viewed a post', 'content', '{}'),
    ('post_like', 'User liked a post', 'content', '{}'),
    ('post_comment', 'User commented on a post', 'content', '{}'),
    ('post_share', 'User shared a post', 'content', '{}'),
    ('post_create', 'User created a post', 'content', '{"required": ["visibility"]}'),
    ('follow', 'User followed another user', 'social', '{}'),
    ('unfollow', 'User unfollowed another user', 'social', '{}'),

    -- Dating
    ('discovery_view', 'User viewed discovery feed', 'dating', '{}'),
    ('profile_view', 'User viewed a profile', 'dating', '{}'),
    ('like_sent', 'User sent a like', 'dating', '{"required": ["target_gender"]}'),
    ('super_like_sent', 'User sent a super like', 'dating', '{}'),
    ('match_created', 'User matched with another user', 'dating', '{}'),
    ('message_sent', 'User sent a message', 'social', '{}'),
    ('conversation_started', 'User started a conversation', 'social', '{}'),

    -- Stories
    ('story_view', 'User viewed a story', 'content', '{}'),
    ('story_create', 'User created a story', 'content', '{}'),
    ('story_reaction', 'User reacted to a story', 'content', '{}'),

    -- Video
    ('video_view', 'User viewed a short video', 'content', '{"required": ["duration_watched"]}'),
    ('video_like', 'User liked a video', 'content', '{}'),
    ('video_comment', 'User commented on a video', 'content', '{}'),
    ('video_share', 'User shared a video', 'content', '{}'),
    ('video_upload', 'User uploaded a video', 'content', '{"required": ["duration_seconds"]}'),

    -- Live
    ('live_start', 'User started a live stream', 'content', '{}'),
    ('live_end', 'User ended a live stream', 'content', '{"required": ["duration_seconds"]}'),
    ('live_join', 'User joined a live stream', 'content', '{}'),

    -- Premium
    ('premium_view', 'User viewed premium page', 'monetization', '{}'),
    ('checkout_started', 'User started checkout', 'monetization', '{"required": ["plan_slug"]}'),
    ('payment_completed', 'User completed payment', 'monetization', '{"required": ["plan_slug", "amount_stars"]}'),
    ('subscription_activated', 'User subscription activated', 'monetization', '{"required": ["plan_slug"]}'),
    ('subscription_cancelled', 'User cancelled subscription', 'monetization', '{}'),
    ('subscription_expired', 'User subscription expired', 'monetization', '{}'),
    ('subscription_renewed', 'User subscription renewed', 'monetization', '{"required": ["plan_slug"]}'),

    -- Advertising
    ('ad_impression', 'Ad was shown to user', 'advertising', '{"required": ["placement", "campaign_id"]}'),
    ('ad_click', 'User clicked an ad', 'advertising', '{"required": ["campaign_id"]}'),
    ('ad_conversion', 'User converted from ad', 'advertising', '{}'),

    -- Creator
    ('creator_dashboard_view', 'Creator viewed dashboard', 'engagement', '{}'),
    ('payout_requested', 'Creator requested payout', 'monetization', '{"required": ["amount_stars"]}'),
    ('payout_completed', 'Creator payout completed', 'monetization', '{"required": ["amount_stars"]}'),

    -- Search
    ('search_performed', 'User performed a search', 'engagement', '{"required": ["query"]}'),

    -- Notifications
    ('notification_received', 'User received a notification', 'system', '{"required": ["notification_type"]}'),
    ('notification_clicked', 'User clicked a notification', 'system', '{}'),

    -- System
    ('app_launch', 'User launched the app', 'system', '{"required": ["platform", "app_version"]}'),
    ('session_start', 'User session started', 'system', '{}'),
    ('session_end', 'User session ended', 'system', '{"required": ["duration_seconds"]}')
on conflict (event_name) do nothing;

-- ============================================================================
-- 2. EVENT VALIDATION FUNCTION
-- ============================================================================
create or replace function public.validate_analytics_event()
returns trigger as $$
declare
    def record;
    required_keys text[];
    missing_key text;
begin
    -- Check event_name exists in definitions
    select * into def from public.event_definitions where event_name = new.event_name;
    if not found then
        raise warning 'Unknown analytics event: %', new.event_name;
        return new;
    end if;

    -- Validate required fields
    if def.schema_definition ? 'required' then
        required_keys := array(select jsonb_array_elements_text(def.schema_definition->'required'));
        foreach missing_key in array required_keys
        loop
            if not new.properties ? missing_key then
                raise warning 'Missing required field "%" for event "%"', missing_key, new.event_name;
            end if;
        end loop;
    end if;

    -- Check metadata size
    if new.properties is not null and length(new.properties::text) > 10000 then
        raise warning 'Event % has oversized properties (% chars)', new.event_name, length(new.properties::text);
    end if;

    -- Reject sensitive fields in properties
    if new.properties ?| array['password', 'secret', 'token', 'credit_card', 'ssn', 'phone'] then
        raise exception 'Event % contains sensitive fields', new.event_name;
    end if;

    return new;
end;
$$ language plpgsql;

create trigger trg_validate_analytics_event
    before insert on public.analytics_events
    for each row
    execute function public.validate_analytics_event();

-- ============================================================================
-- 3. ANALYTICS AGGREGATION FUNCTIONS — DAU/MAU
-- ============================================================================
create or replace function public.get_dau(p_date date)
returns bigint as $$
    select count(distinct user_id)
    from public.analytics_events
    where created_at::date = p_date
      and user_id is not null;
$$ language sql stable;

create or replace function public.get_mau(p_year int, p_month int)
returns bigint as $$
    select count(distinct user_id)
    from public.analytics_events
    where extract(year from created_at) = p_year
      and extract(month from created_at) = p_month
      and user_id is not null;
$$ language sql stable;

create or replace function public.get_dau_timeseries(p_days int)
returns table (date date, dau bigint)
language sql stable as $$
    select d::date, count(distinct user_id)
    from generate_series(current_date - p_days + 1, current_date, '1 day'::interval) d
    left join public.analytics_events e on e.created_at::date = d::date
    group by d::date
    order by d::date;
$$;

create or replace function public.get_mau_timeseries(p_months int)
returns table (month text, mau bigint)
language sql stable as $$
    select to_char(m, 'YYYY-MM'), count(distinct user_id)
    from generate_series(date_trunc('month', current_date) - (p_months - 1) * interval '1 month', date_trunc('month', current_date), '1 month'::interval) m
    left join public.analytics_events e on date_trunc('month', e.created_at) = m
    group by m
    order by m;
$$;

-- ============================================================================
-- 4. MATERIALIZED VIEW — Daily aggregated events
-- ============================================================================
create materialized view if not exists public.mv_daily_event_counts as
select
    created_at::date as date,
    event_name,
    count(*) as event_count,
    count(distinct user_id) as unique_users
from public.analytics_events
where created_at >= current_date - interval '90 days'
group by created_at::date, event_name
with no data;

create unique index if not exists idx_mv_daily_event_counts
    on public.mv_daily_event_counts (date, event_name);

-- ============================================================================
-- 5. MATERIALIZED VIEW — User daily activity
-- ============================================================================
create materialized view if not exists public.mv_user_daily_activity as
select
    user_id,
    created_at::date as date,
    count(*) as event_count,
    count(distinct event_name) as unique_actions,
    bool_or(event_name in ('post_like', 'post_comment', 'like_sent', 'message_sent')) as was_active,
    bool_or(event_name in ('payment_completed', 'subscription_activated', 'subscription_renewed')) as had_monetization_event,
    bool_or(event_name in ('ad_impression', 'ad_click')) as had_ad_event
from public.analytics_events
where created_at >= current_date - interval '90 days'
  and user_id is not null
group by user_id, created_at::date
with no data;

create unique index if not exists idx_mv_user_daily_activity
    on public.mv_user_daily_activity (user_id, date);

-- ============================================================================
-- 6. FUNNEL ANALYTICS
-- ============================================================================
create or replace function public.get_funnel_analysis(
    p_event_names text[],
    p_start_date date,
    p_end_date date,
    p_window_hours int default 168
)
returns table (
    step int,
    event_name text,
    unique_users bigint,
    conversion_from_first numeric,
    dropoff_from_previous numeric
)
language plpgsql stable as $$
declare
    v_event_name text;
    v_prev_count bigint;
    v_first_count bigint;
begin
    v_first_count := 0;

    for step_idx in 1 .. array_length(p_event_names, 1)
    loop
        v_event_name := p_event_names[step_idx];

        return query execute format('
            select
                $1::int,
                $2::text,
                count(distinct e.user_id)::bigint,
                case when $3 > 0 then round(count(distinct e.user_id)::numeric / $3 * 100, 1) else 0 end,
                case when $4 > 0 then round((1 - count(distinct e.user_id)::numeric / nullif($4, 0)) * 100, 1) else 0 end
            from public.analytics_events e
            where e.event_name = $2
              and e.created_at::date between $5 and $6
              and e.user_id is not null
        ')
        using step_idx, v_event_name, v_first_count, v_prev_count, p_start_date, p_end_date;

        if step_idx = 1 then
            select unique_users into v_first_count from (
                select count(distinct e.user_id)::bigint
                from public.analytics_events e
                where e.event_name = v_event_name
                  and e.created_at::date between p_start_date and p_end_date
                  and e.user_id is not null
            ) sub;
        end if;

        select unique_users into v_prev_count from (
            select count(distinct e.user_id)::bigint
            from public.analytics_events e
            where e.event_name = v_event_name
              and e.created_at::date between p_start_date and p_end_date
              and e.user_id is not null
        ) sub;
    end loop;
end;
$$;

-- Predefined funnels
create or replace function public.get_onboarding_funnel(p_start_date date, p_end_date date)
returns table (step int, event_name text, unique_users bigint, conversion_from_first numeric, dropoff_from_previous numeric)
language sql stable as $$
    select * from public.get_funnel_analysis(
        array['app_launch', 'authentication_complete', 'onboarding_started', 'onboarding_completed', 'profile_created'],
        p_start_date, p_end_date
    );
$$;

create or replace function public.get_dating_funnel(p_start_date date, p_end_date date)
returns table (step int, event_name text, unique_users bigint, conversion_from_first numeric, dropoff_from_previous numeric)
language sql stable as $$
    select * from public.get_funnel_analysis(
        array['discovery_view', 'profile_view', 'like_sent', 'match_created', 'message_sent'],
        p_start_date, p_end_date
    );
$$;

create or replace function public.get_content_funnel(p_start_date date, p_end_date date)
returns table (step int, event_name text, unique_users bigint, conversion_from_first numeric, dropoff_from_previous numeric)
language sql stable as $$
    select * from public.get_funnel_analysis(
        array['feed_impression', 'post_view', 'post_like', 'post_comment', 'post_share'],
        p_start_date, p_end_date
    );
$$;

create or replace function public.get_premium_funnel(p_start_date date, p_end_date date)
returns table (step int, event_name text, unique_users bigint, conversion_from_first numeric, dropoff_from_previous numeric)
language sql stable as $$
    select * from public.get_funnel_analysis(
        array['premium_view', 'checkout_started', 'payment_completed', 'subscription_activated'],
        p_start_date, p_end_date
    );
$$;

-- ============================================================================
-- 7. RETENTION ANALYSIS
-- ============================================================================
create or replace function public.get_cohort_retention(
    p_cohort_start date,
    p_cohort_end date,
    p_weeks int default 12
)
returns table (
    cohort_week int,
    week_offset int,
    cohort_size bigint,
    retained_users bigint,
    retention_rate numeric
)
language plpgsql stable as $$
declare
    v_cohort_size bigint;
begin
    -- Get users who first appeared in the cohort period
    create temp table cohort_users on commit drop as
    select distinct user_id
    from public.analytics_events
    where created_at::date between p_cohort_start and p_cohort_end
      and user_id is not null
      and event_name not in ('ad_impression', 'ad_click');

    select count(*) into v_cohort_size from cohort_users;

    -- Return week-over-week retention
    return query
    with weeks as (
        select generate_series(0, p_weeks - 1) as week_offset
    ),
    retained as (
        select
            w.week_offset,
            count(distinct e.user_id)::bigint as retained
        from weeks w
        left join public.analytics_events e
            on e.user_id in (select user_id from cohort_users)
            and e.created_at::date between p_cohort_start + w.week_offset * 7 and p_cohort_start + (w.week_offset + 1) * 7 - 1
            and e.event_name not in ('ad_impression', 'ad_click')
        group by w.week_offset
    )
    select
        0::int as cohort_week,
        r.week_offset::int,
        v_cohort_size::bigint,
        coalesce(r.retained, 0::bigint),
        case when v_cohort_size > 0 then round(coalesce(r.retained, 0)::numeric / v_cohort_size * 100, 1) else 0 end
    from retained r
    order by r.week_offset;
end;
$$;

-- ============================================================================
-- 8. USER LIFECYCLE SEGMENTATION
-- ============================================================================
create or replace function public.get_user_lifecycle_segment(p_user_id uuid)
returns text
language plpgsql stable as $$
declare
    v_days_since_signup int;
    v_days_since_last_active int;
    v_total_events bigint;
    v_is_premium boolean;
    v_is_creator boolean;
    v_has_paid boolean;
begin
    select extract(day from now() - created_at)::int into v_days_since_signup
    from public.users where id = p_user_id;

    select extract(day from now() - max(created_at))::int into v_days_since_last_active
    from public.analytics_events where user_id = p_user_id;

    select count(*) into v_total_events
    from public.analytics_events where user_id = p_user_id;

    select exists(select 1 from public.subscriptions where user_id = p_user_id and status = 'active') into v_is_premium;

    select exists(select 1 from public.analytics_events where user_id = p_user_id and event_name = 'video_upload') into v_is_creator;

    select exists(select 1 from public.purchases where user_id = p_user_id and status = 'completed') into v_has_paid;

    if v_days_since_signup <= 1 then
        return 'new';
    elsif v_days_since_last_active <= 1 and v_total_events > 10 then
        if v_is_premium then return 'premium';
        elsif v_is_creator then return 'creator';
        else return 'engaged';
        end if;
    elsif v_days_since_last_active <= 7 and v_total_events > 0 then
        return 'activated';
    elsif v_days_since_last_active between 8 and 30 then
        return 'at_risk';
    elsif v_days_since_last_active > 30 then
        return 'dormant';
    else
        return 'new';
    end if;
end;
$$;

-- ============================================================================
-- 9. REVENUE ANALYTICS
-- ============================================================================
create materialized view if not exists public.mv_daily_revenue as
select
    date(payment_transactions.created_at) as date,
    sum(payment_transactions.amount_stars) as total_revenue_stars,
    count(distinct payment_transactions.user_id) as paying_users,
    count(*) as transaction_count,
    sum(case when pt.product_type = 'premium_subscription' then pt.amount_stars else 0 end) as subscription_revenue,
    sum(case when pt.product_type = 'boost' then pt.amount_stars else 0 end) as boost_revenue,
    sum(case when pt.product_type in ('gift', 'super_like', 'spotlight') then pt.amount_stars else 0 end) as feature_revenue
from public.payment_transactions
join public.purchases pt on pt.id = payment_transactions.purchase_id
where payment_transactions.status = 'completed'
  and payment_transactions.created_at >= current_date - interval '90 days'
group by date(payment_transactions.created_at)
with no data;

create unique index if not exists idx_mv_daily_revenue
    on public.mv_daily_revenue (date);

create or replace function public.get_revenue_summary(
    p_start_date date,
    p_end_date date
)
returns table (
    total_revenue_stars bigint,
    total_transactions bigint,
    unique_paying_users bigint,
    avg_revenue_per_user numeric,
    subscription_revenue bigint,
    boost_revenue bigint,
    feature_revenue bigint,
    ad_revenue bigint
)
language sql stable as $$
    select
        coalesce(sum(amount_stars), 0)::bigint,
        count(*)::bigint,
        count(distinct user_id)::bigint,
        round(coalesce(sum(amount_stars)::numeric / nullif(count(distinct user_id), 0), 0), 2),
        coalesce(sum(case when pt.product_type = 'premium_subscription' then pt.amount_stars else 0 end), 0)::bigint,
        coalesce(sum(case when pt.product_type = 'boost' then pt.amount_stars else 0 end), 0)::bigint,
        coalesce(sum(case when pt.product_type in ('gift', 'super_like', 'spotlight') then pt.amount_stars else 0 end), 0)::bigint,
        coalesce(sum(case when pt.product_type = 'ad' then pt.amount_stars else 0 end), 0)::bigint
    from public.payment_transactions
    join public.purchases pt on pt.id = payment_transactions.purchase_id
    where payment_transactions.status = 'completed'
      and payment_transactions.created_at::date between p_start_date and p_end_date;
$$;

create or replace function public.get_unit_economics(
    p_start_date date,
    p_end_date date
)
returns table (
    dau_avg numeric,
    mau bigint,
    total_users bigint,
    active_users bigint,
    premium_users bigint,
    revenue_stars bigint,
    arpu_stars numeric,
    arppu_stars numeric,
    premium_conversion_rate numeric,
    creator_count bigint,
    creator_revenue_stars bigint
)
language sql stable as $$
    select
        (select round(avg(dau), 1) from public.get_dau_timeseries((p_end_date - p_start_date)::int)),
        (select coalesce(sum(mau), 0) from public.get_mau_timeseries(1) limit 1),
        (select count(*) from public.users where created_at <= p_end_date),
        (select count(distinct user_id) from public.analytics_events where created_at::date between p_start_date and p_end_date),
        (select count(*) from public.subscriptions where status = 'active'),
        coalesce(r.total_revenue_stars, 0),
        round(coalesce(r.total_revenue_stars::numeric / nullif(nullif((select count(*) from public.users where created_at <= p_end_date), 0), 0), 0), 2),
        round(coalesce(r.total_revenue_stars::numeric / nullif(r.unique_paying_users, 0), 0), 2),
        case when (select count(*) from public.users where created_at <= p_end_date) > 0
            then round(coalesce(r.unique_paying_users::numeric / (select count(*)::numeric from public.users where created_at <= p_end_date) * 100, 0), 2)
            else 0 end,
        (select count(distinct user_id) from public.analytics_events where event_name = 'video_upload' and created_at::date between p_start_date and p_end_date),
        (select coalesce(sum(amount_stars), 0) from public.creator_earnings_ledger where created_at::date between p_start_date and p_end_date)
    from public.get_revenue_summary(p_start_date, p_end_date) r;
$$;

-- ============================================================================
-- 10. EXPERIMENTATION PLATFORM
-- ============================================================================
create table if not exists public.experiments (
    id              uuid primary key default gen_random_uuid(),
    name            text not null,
    description     text,
    owner           text not null,
    status          text not null default 'draft' check (status in ('draft', 'running', 'paused', 'completed', 'cancelled')),
    hypothesis      text,
    primary_metric  text not null,
    secondary_metrics jsonb default '[]'::jsonb,
    start_date      timestamptz,
    end_date        timestamptz,
    max_rollout_pct integer not null default 100 check (max_rollout_pct between 1 and 100),
    min_sample_size integer default 1000,
    targeting_rules jsonb default '{}'::jsonb,
    exclusion_rules jsonb default '[]'::jsonb,
    kill_switch     boolean not null default false,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create table if not exists public.experiment_variants (
    id              uuid primary key default gen_random_uuid(),
    experiment_id   uuid not null references public.experiments(id) on delete cascade,
    name            text not null,
    description     text,
    traffic_pct     integer not null check (traffic_pct between 0 and 100),
    config          jsonb default '{}'::jsonb,
    is_control      boolean not null default false,
    created_at      timestamptz not null default now(),
    unique (experiment_id, name)
);

create table if not exists public.experiment_assignments (
    id              uuid primary key default gen_random_uuid(),
    experiment_id   uuid not null references public.experiments(id) on delete cascade,
    variant_id      uuid not null references public.experiment_variants(id) on delete cascade,
    user_id         uuid not null references public.users(id) on delete cascade,
    assigned_at     timestamptz not null default now(),
    unique (experiment_id, user_id)
);

create table if not exists public.experiment_events (
    id              uuid primary key default gen_random_uuid(),
    experiment_id   uuid not null references public.experiments(id) on delete cascade,
    variant_id      uuid not null references public.experiment_variants(id) on delete cascade,
    user_id         uuid not null references public.users(id) on delete cascade,
    event_name      text not null,
    event_value     numeric,
    metadata        jsonb default '{}'::jsonb,
    created_at      timestamptz not null default now()
);

create index if not exists idx_experiment_assignments_user on public.experiment_assignments (user_id);
create index if not exists idx_experiment_events_lookup on public.experiment_events (experiment_id, event_name);
create index if not exists idx_experiment_events_user on public.experiment_events (user_id);

-- Experiment assignment function (deterministic hash-based)
create or replace function public.assign_experiment_variant(
    p_experiment_id uuid,
    p_user_id uuid
)
returns uuid
language plpgsql as $$
declare
    v_variant_id uuid;
    v_assignment_id uuid;
    v_experiment record;
    v_hash int;
    v_cumulative int := 0;
begin
    -- Check if already assigned
    select variant_id into v_variant_id
    from public.experiment_assignments
    where experiment_id = p_experiment_id and user_id = p_user_id;

    if found then
        return v_variant_id;
    end if;

    -- Get experiment
    select * into v_experiment
    from public.experiments
    where id = p_experiment_id and status = 'running' and kill_switch = false;

    if not found then
        return null;
    end if;

    -- Check targeting rules
    if v_experiment.targeting_rules is not null and v_experiment.targeting_rules != '{}'::jsonb then
        -- Simple targeting check — extend as needed
        if v_experiment.targeting_rules ? 'min_events' then
            if (select count(*) from public.analytics_events where user_id = p_user_id) < (v_experiment.targeting_rules->>'min_events')::int then
                return null;
            end if;
        end if;
    end if;

    -- Deterministic hash assignment
    v_hash := abs(hashtext(p_user_id::text || '-' || p_experiment_id::text)) % 100;

    -- If hash exceeds rollout %, return null (not in experiment)
    if v_hash >= v_experiment.max_rollout_pct then
        return null;
    end if;

    -- Assign based on variant traffic percentages
    for v_variant_id in
        select id from public.experiment_variants
        where experiment_id = p_experiment_id
        order by created_at
    loop
        v_cumulative := v_cumulative + (select traffic_pct from public.experiment_variants where id = v_variant_id);
        if v_hash < v_cumulative then
            insert into public.experiment_assignments (experiment_id, variant_id, user_id)
            values (p_experiment_id, v_variant_id, p_user_id)
            returning variant_id into v_variant_id;
            return v_variant_id;
        end if;
    end loop;

    return null;
end;
$$;

-- ============================================================================
-- 11. EXPERIMENT ANALYSIS
-- ============================================================================
create or replace function public.get_experiment_results(p_experiment_id uuid)
returns table (
    variant_name text,
    is_control boolean,
    user_count bigint,
    primary_metric_value numeric,
    primary_metric_per_user numeric,
    lift_vs_control numeric,
    confidence numeric
)
language plpgsql stable as $$
declare
    v_primary_metric text;
    v_control_count bigint;
    v_control_value numeric;
begin
    select primary_metric into v_primary_metric from public.experiments where id = p_experiment_id;

    -- Get control stats first
    select
        count(distinct ea.user_id),
        coalesce(sum(ee.event_value), 0)
    into v_control_count, v_control_value
    from public.experiment_assignments ea
    join public.experiment_variants ev on ev.id = ea.variant_id and ev.is_control = true
    left join public.experiment_events ee on ee.experiment_id = ea.experiment_id and ee.user_id = ea.user_id and ee.event_name = v_primary_metric
    where ea.experiment_id = p_experiment_id;

    return query
    select
        ev.name::text,
        ev.is_control,
        count(distinct ea.user_id)::bigint,
        coalesce(sum(ee.event_value), 0)::numeric,
        round(coalesce(sum(ee.event_value)::numeric / nullif(count(distinct ea.user_id), 0), 0), 4),
        case when v_control_count > 0 and v_control_value > 0 and not ev.is_control
            then round((coalesce(sum(ee.event_value)::numeric / nullif(count(distinct ea.user_id), 0) - v_control_value::numeric / nullif(v_control_count, 0)) / (v_control_value::numeric / nullif(v_control_count, 0)) * 100, 2)
            else 0 end,
        null::numeric -- Placeholder for statistical confidence
    from public.experiment_assignments ea
    join public.experiment_variants ev on ev.id = ea.variant_id
    left join public.experiment_events ee on ee.experiment_id = ea.experiment_id and ee.user_id = ea.user_id and ee.event_name = v_primary_metric
    where ea.experiment_id = p_experiment_id
    group by ev.name, ev.is_control, ev.id
    order by ev.is_control desc, ev.name;
end;
$$;

-- ============================================================================
-- 12. DATA QUALITY FUNCTIONS
-- ============================================================================
create or replace function public.check_analytics_data_quality()
returns table (
    check_name text,
    status text,
    detail text,
    severity text
)
language plpgsql stable as $$
begin
    -- Missing events
    return query select
        'missing_events_today'::text,
        case when count(*) > 0 then 'pass' else 'warn' end,
        coalesce(count(*)::text, '0') || ' events today',
        case when count(*) = 0 then 'high' else 'info' end
    from public.analytics_events where created_at::date = current_date;

    -- Duplicate events (same user + event + timestamp)
    return query select
        'duplicate_events'::text,
        case when count(*) = 0 then 'pass' else 'fail' end,
        count(*)::text || ' potential duplicate events found',
        'medium'
    from (
        select user_id, event_name, created_at, count(*)
        from public.analytics_events
        where created_at >= current_date - interval '7 days'
        group by user_id, event_name, created_at
        having count(*) > 1
    ) d;

    -- Negative or impossible values
    return query select
        'impossible_values'::text,
        case when count(*) = 0 then 'pass' else 'fail' end,
        count(*)::text || ' events with impossible values',
        'high'
    from public.analytics_events
    where properties ? 'amount_stars'
      and (properties->>'amount_stars')::numeric < 0;

    -- Stale materialized views
    return query select
        'stale_materialized_views'::text,
        'warn',
        'mv_daily_event_counts last refreshed',
        'medium'
    from public.mv_daily_event_counts limit 0;

    -- Revenue inconsistency check
    return query select
        'revenue_inconsistency'::text,
        case when abs(r1 - r2) < 0.01 then 'pass' else 'warn' end,
        'Revenue discrepancy: analytics=' || coalesce(r1::text, '0') || ' vs payments=' || coalesce(r2::text, '0'),
        'high'
    from (
        select
            (select coalesce(sum((properties->>'amount_stars')::numeric), 0)
             from public.analytics_events
             where event_name = 'payment_completed'
               and created_at::date = current_date) as r1,
            (select coalesce(sum(amount_stars), 0)
             from public.payment_transactions
             where status = 'completed'
               and created_at::date = current_date) as r2
    ) rev;

    -- Sudden tracking drop (compare today vs yesterday)
    return query select
        'sudden_tracking_drop'::text,
        case when today > yesterday * 0.5 then 'pass' else 'warn' end,
        'Events today: ' || today::text || ', yesterday: ' || yesterday::text,
        'high'
    from (
        select
            (select count(*) from public.analytics_events where created_at::date = current_date) as today,
            (select count(*) from public.analytics_events where created_at::date = current_date - 1) as yesterday
    ) counts;
end;
$$;

-- ============================================================================
-- 13. ANALYTICS RETENTION — Cleanup old events
-- ============================================================================
create or replace function public.cleanup_old_analytics_events(p_retention_days int default 365)
returns int
language plpgsql as $$
declare
    v_deleted int;
begin
    delete from public.analytics_events
    where created_at < current_date - p_retention_days;
    get diagnostics v_deleted = row_count;
    return v_deleted;
end;
$$;

create or replace function public.cleanup_old_analytics_data()
returns void
language plpgsql as $$
begin
    -- Clean by event type retention policy
    delete from public.analytics_events e
    using public.event_definitions d
    where e.event_name = d.event_name
      and e.created_at < current_date - d.retention_days;

    -- Delete events older than max retention (2 years)
    delete from public.analytics_events
    where created_at < current_date - interval '2 years';

    -- Clean experiment events older than 1 year
    delete from public.experiment_events
    where created_at < current_date - interval '1 year';
end;
$$;

-- ============================================================================
-- 14. PRIVACY — Minimum cohort size threshold
-- ============================================================================
create or replace function public.apply_privacy_threshold(
    p_value bigint,
    p_threshold int default 10
)
returns bigint as $$
begin
    if p_value < p_threshold then
        return 0; -- Suppress small cohorts
    end if;
    return p_value;
end;
$$ language plpgsql;

-- ============================================================================
-- 15. REFRESH MATERIALIZED VIEWS (scheduled function)
-- ============================================================================
create or replace function public.refresh_analytics_views()
returns void
language plpgsql as $$
begin
    refresh materialized view concurrently public.mv_daily_event_counts;
    refresh materialized view concurrently public.mv_user_daily_activity;
    refresh materialized view concurrently public.mv_daily_revenue;
end;
$$;

-- ============================================================================
-- 16. ADMIN DASHBOARD — Extended metrics
-- ============================================================================
create or replace function public.get_analytics_dashboard(
    p_start_date date,
    p_end_date date
)
returns jsonb
language plpgsql stable as $$
declare
    result jsonb;
begin
    select jsonb_build_object(
        'overview', (
            select jsonb_build_object(
                'dau', (select round(avg(dau), 0) from public.get_dau_timeseries((p_end_date - p_start_date)::int)),
                'mau', (select count(distinct user_id) from public.analytics_events where created_at::date between p_start_date and p_end_date),
                'total_events', (select count(*) from public.analytics_events where created_at::date between p_start_date and p_end_date),
                'active_users', (select count(distinct user_id) from public.analytics_events where created_at::date between p_start_date and p_end_date)
            )
        ),
        'engagement', (
            select jsonb_build_object(
                'total_messages', (select count(*) from public.analytics_events where event_name = 'message_sent' and created_at::date between p_start_date and p_end_date),
                'total_likes', (select count(*) from public.analytics_events where event_name = 'like_sent' and created_at::date between p_start_date and p_end_date),
                'total_matches', (select count(*) from public.analytics_events where event_name = 'match_created' and created_at::date between p_start_date and p_end_date),
                'total_posts', (select count(*) from public.analytics_events where event_name = 'post_create' and created_at::date between p_start_date and p_end_date)
            )
        ),
        'monetization', (
            select jsonb_build_object(
                'revenue_stars', coalesce(r.total_revenue_stars, 0),
                'paying_users', coalesce(r.unique_paying_users, 0),
                'subscription_revenue', coalesce(r.subscription_revenue, 0),
                'arpu', coalesce(r.arpu_stars, 0)
            )
            from public.get_unit_economics(p_start_date, p_end_date) r
        ),
        'safety', (
            select jsonb_build_object(
                'open_reports', (select count(*) from public.reports where status in ('pending', 'reviewing')),
                'resolved_reports', (select count(*) from public.reports where status = 'resolved' and created_at::date between p_start_date and p_end_date),
                'banned_users', (select count(*) from public.users where is_banned = true),
                'pending_appeals', (select count(*) from public.appeals where status in ('pending', 'in_review'))
            )
        ),
        'growth', (
            select jsonb_build_object(
                'new_users', (select count(*) from public.users where created_at::date between p_start_date and p_end_date),
                'signup_conversion', (select round(count(*)::numeric / nullif((select count(*) from public.analytics_events where event_name = 'app_launch' and created_at::date between p_start_date and p_end_date), 0) * 100, 1) from public.users where created_at::date between p_start_date and p_end_date),
                'premium_conversion', (select round(count(distinct user_id)::numeric / nullif((select count(*) from public.users where created_at <= p_end_date), 0) * 100, 2) from public.subscriptions where status = 'active')
            )
        )
    ) into result;

    return result;
end;
$$;
