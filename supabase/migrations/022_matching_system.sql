-- Vibe Database — Mutual Matching System (Prompt 08)
-- Adds:
--   - Read state columns on matches
--   - Enhanced atomic process_dating_action() function
--   - Notification helper function
--   - Match access check function
--   - Updated RLS policies for matches
--   - Additional indexes

-- ============================================================================
-- ALTER MATCHES TABLE — Add read state and last activity tracking
-- ============================================================================
alter table public.matches
  add column if not exists last_activity_at timestamptz not null default now();

alter table public.matches
  add column if not exists last_read_at_user_a timestamptz;

alter table public.matches
  add column if not exists last_read_at_user_b timestamptz;

alter table public.matches
  add column if not exists unmatched_by uuid references public.users(id) on delete set null;

-- ============================================================================
-- NOTIFICATION DEDUP CONSTRAINT
-- ============================================================================
-- Prevents duplicate notifications for the same event (e.g., match creation).
-- The process_dating_action function uses ON CONFLICT DO NOTHING with this.
alter table public.notifications
  add constraint notifications_dedup_unique
  unique (recipient_id, type, entity_id);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Match list queries: active matches for a user, ordered by last activity
create index if not exists matches_active_user_a_idx on public.matches (user_a_id, last_activity_at desc)
  where status = 'active';

create index if not exists matches_active_user_b_idx on public.matches (user_b_id, last_activity_at desc)
  where status = 'active';

-- Match lookup by participants (any order)
create index if not exists matches_participants_idx on public.matches (user_a_id, user_b_id);

-- Dating actions: reciprocal check index
create index if not exists dating_actions_reciprocal_idx on public.dating_actions (target_id, actor_id, action)
  where action in ('like', 'super_like');

-- Notifications: unread match notifications for a user
create index if not exists notifications_match_unread_idx on public.notifications (recipient_id, created_at desc)
  where type = 'new_match' and is_read = false;

-- ============================================================================
-- FUNCTION: is_positive_dating_action — Check if an action indicates positive interest
-- ============================================================================
create or replace function public.is_positive_dating_action(action_type text)
returns boolean
language sql
immutable
as $$
  select action_type in ('like', 'super_like');
$$;

-- ============================================================================
-- FUNCTION: process_dating_action — Atomic match creation on mutual like
-- ============================================================================
-- This is the critical function that atomically:
--   1. Saves/updates the dating action (upsert)
--   2. Checks for reciprocal positive action
--   3. Creates or reactivates a match if reciprocal exists
--   4. Creates match notifications for both users
--   5. Returns structured result
--
-- Security: SECURITY DEFINER so it runs with elevated privileges
-- Idempotent: ON CONFLICT handling prevents duplicate matches
create or replace function public.process_dating_action(
  p_actor_id uuid,
  p_target_id uuid,
  p_action dating_action_type
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_match_id uuid;
  v_reciprocal_action dating_action_type;
  v_can_a uuid;
  v_can_b uuid;
  v_notification_id uuid;
  v_result jsonb;
begin
  -- ─── Validate inputs ────────────────────────────────────────────────
  if p_actor_id = p_target_id then
    return jsonb_build_object(
      'success', false,
      'error', 'Self-action not allowed',
      'action', p_action,
      'matched', false,
      'matchId', null
    );
  end if;

  -- ─── Upsert the dating action ─────────────────────────────────────
  insert into public.dating_actions (actor_id, target_id, action)
  values (p_actor_id, p_target_id, p_action)
  on conflict on constraint unique_actor_target
  do update set action = excluded.action
  where dating_actions.actor_id = p_actor_id
    and dating_actions.target_id = p_target_id;

  -- ─── Check if reciprocal positive action exists ──────────────────
  -- Positive actions: like, super_like
  -- If target has also liked/super_liked the actor, it's a match! 🎉
  if p_action in ('like', 'super_like') then
    select action into v_reciprocal_action
    from public.dating_actions
    where actor_id = p_target_id
      and target_id = p_actor_id
      and action in ('like', 'super_like')
    limit 1;

    if found then
      -- Verify neither user has blocked the other
      if not public.user_is_blocked(p_actor_id, p_target_id) then

        -- Canonical pair: user_a_id is always the smaller UUID
        -- Try to create a new match or reactivate an unmatched one
        insert into public.matches (
          user_a_id, user_b_id, status, matched_at, last_activity_at,
          unmatched_at, unmatched_by
        )
        values (
          least(p_actor_id, p_target_id),
          greatest(p_actor_id, p_target_id),
          'active', now(), now(),
          null, null
        )
        on conflict (user_a_id, user_b_id) do update set
          status = case
            when matches.status = 'unmatched' then 'active'
            else matches.status
          end,
          unmatched_at = case
            when matches.status = 'unmatched' then null
            else matches.unmatched_at
          end,
          unmatched_by = case
            when matches.status = 'unmatched' then null
            else matches.unmatched_by
          end,
          last_activity_at = now(),
          updated_at = now()
        where matches.status = 'unmatched' or matches.status = 'active'
        returning id into v_match_id;

        -- If no match was created/updated (already active), get existing match ID
        if v_match_id is null then
          select id into v_match_id
          from public.matches
          where (
            (user_a_id = least(p_actor_id, p_target_id)
             and user_b_id = greatest(p_actor_id, p_target_id))
            and status = 'active'
          )
          limit 1;
        end if;

        if v_match_id is not null then
          -- ─── Create bidirectional match notifications ──────────
          -- Insert for the actor (they just discovered the match)
          insert into public.notifications (
            recipient_id, type, actor_id, entity_type, entity_id,
            title, body, channel, is_read, created_at
          )
          values (
            p_actor_id, 'new_match', p_target_id, 'match', v_match_id::text,
            'New Match! 🎉', 'You matched! Start chatting now.',
            'in_app', false, now()
          )
          on conflict do nothing;

          -- Insert for the target (they already liked the actor)
          insert into public.notifications (
            recipient_id, type, actor_id, entity_type, entity_id,
            title, body, channel, is_read, created_at
          )
          values (
            p_target_id, 'new_match', p_actor_id, 'match', v_match_id::text,
            'New Match! 🎉', 'You matched! Start chatting now.',
            'in_app', false, now()
          )
          on conflict do nothing;

          return jsonb_build_object(
            'success', true,
            'action', p_action,
            'matched', true,
            'matchId', v_match_id,
            'notificationCreated', true
          );
        end if;
      end if;
    end if;
  end if;

  -- No match created — return basic action result
  return jsonb_build_object(
    'success', true,
    'action', p_action,
    'matched', false,
    'matchId', null,
    'notificationCreated', false
  );
end;
$$;

-- ============================================================================
-- FUNCTION: can_access_match — Check if a user can access a specific match
-- ============================================================================
create or replace function public.can_access_match(
  p_user_id uuid,
  p_match_id uuid
)
returns boolean
language plpgsql
stable
as $$
declare
  v_match record;
begin
  -- Get the match
  select * into v_match
  from public.matches
  where id = p_match_id;

  if not found then
    return false;
  end if;

  -- User must be one of the participants
  if v_match.user_a_id != p_user_id and v_match.user_b_id != p_user_id then
    return false;
  end if;

  -- Match must be active
  if v_match.status != 'active' then
    return false;
  end if;

  -- Neither user must have blocked the other
  if public.user_is_blocked(v_match.user_a_id, v_match.user_b_id) then
    return false;
  end if;

  return true;
end;
$$;

-- ============================================================================
-- UPDATED RLS POLICIES FOR MATCHES
-- ============================================================================

-- Replace the existing matches select policy to also check blocks
drop policy if exists "Users can see own matches" on public.matches;

create policy "Users can see own matches"
  on public.matches for select
  using (
    (user_a_id = auth.uid() or user_b_id = auth.uid())
    and status = 'active'
    and not public.user_is_blocked(user_a_id, user_b_id)
    or public.is_moderator()
  );

-- Allow users to update their own read state on matches they belong to
create policy "Users can update own match state"
  on public.matches for update
  using (user_a_id = auth.uid() or user_b_id = auth.uid())
  with check (user_a_id = auth.uid() or user_b_id = auth.uid());

-- ============================================================================
-- UPDATED RLS POLICIES FOR NOTIFICATIONS
-- ============================================================================
-- Notifications already have proper RLS from migration 018.
-- We just need to ensure that the insert policy allows the
-- security definer function to create notifications.

-- Notifications are created by the security definer process_dating_action()
-- function, which bypasses RLS. No additional insert policy needed.
