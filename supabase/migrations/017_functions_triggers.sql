-- Vibe Database — Functions & Triggers
-- Reusable database functions for security checks, data consistency,
-- and automatic timestamp management.

-- ============================================================================
-- TRIGGER: updated_at — Auto-update updated_at on row modification
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply to all tables with updated_at
create trigger set_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.profile_preferences
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.posts
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.post_comments
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.matches
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.communities
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.purchases
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.system_config
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.feature_flags
  for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCTION: get_current_user_id — Get the authenticated user's UUID
-- ============================================================================
-- Wraps auth.uid() with a clearer name for RLS policies.
-- Returns null if no authenticated user.
create or replace function public.get_current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid()
$$;

-- ============================================================================
-- FUNCTION: get_current_user_role — Get the authenticated user's role
-- ============================================================================
create or replace function public.get_current_user_role()
returns user_role
language sql
stable
as $$
  select role
  from public.users
  where id = auth.uid()
$$;

-- ============================================================================
-- FUNCTION: is_admin — Check if the current user has admin/moderator role
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;

-- ============================================================================
-- FUNCTION: is_moderator — Check if the current user has mod/admin role
-- ============================================================================
create or replace function public.is_moderator()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role in ('moderator', 'admin', 'super_admin')
  );
$$;

-- ============================================================================
-- FUNCTION: user_is_blocked — Check if user A has blocked user B (or vice versa)
-- ============================================================================
-- This is a critical security function used by RLS policies and services.
-- Blocking is directional: if A blocks B, B cannot interact with A.
create or replace function public.user_is_blocked(user_a_id uuid, user_b_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.blocks
    where (blocker_id = user_a_id and blocked_id = user_b_id)
       or (blocker_id = user_b_id and blocked_id = user_a_id)
  );
$$;

-- ============================================================================
-- FUNCTION: users_are_matched — Check if two users are matched
-- ============================================================================
create or replace function public.users_are_matched(user_a_id uuid, user_b_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.matches
    where (
      (user_a_id = users_are_matched.user_a_id and user_b_id = users_are_matched.user_b_id)
      or
      (user_a_id = users_are_matched.user_b_id and user_b_id = users_are_matched.user_a_id)
    )
    and status = 'active'
  );
$$;

-- ============================================================================
-- FUNCTION: create_match — Create a mutual match when both users like each other
-- ============================================================================
-- Called after a user performs a 'like' or 'super_like' action.
-- If the target has already liked the actor, a match is created.
create or replace function public.create_match(actor_id uuid, target_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  match_id uuid;
begin
  -- Check that the target has also liked the actor
  if exists (
    select 1
    from public.dating_actions
    where actor_id = target_id
      and target_id = actor_id
      and action in ('like', 'super_like')
  ) then
    -- Create match (user_a_id is always the smaller UUID)
    insert into public.matches (user_a_id, user_b_id)
    values (
      least(actor_id, target_id),
      greatest(actor_id, target_id)
    )
    on conflict (user_a_id, user_b_id) do nothing
    returning id into match_id;

    return match_id;
  end if;

  return null;
end;
$$;

-- ============================================================================
-- FUNCTION: handle_profile_completion — Calculate profile completion percentage
-- ============================================================================
create or replace function public.calculate_profile_completion(profile_id uuid)
returns smallint
language plpgsql
stable
as $$
declare
  score smallint := 0;
  p_record public.profiles%rowtype;
begin
  select * into p_record from public.profiles where id = profile_id;

  -- Each field is worth points (total 100)
  if p_record.bio is not null and length(p_record.bio) > 0 then score := score + 20; end if;
  if p_record.date_of_birth is not null then score := score + 15; end if;
  if p_record.gender is not null then score := score + 10; end if;
  if p_record.city is not null then score := score + 10; end if;
  if p_record.country is not null then score := score + 5; end if;
  if p_record.dating_intent is not null then score := score + 10; end if;
  if exists (select 1 from public.profile_photos where user_id = p_record.user_id) then score := score + 20; end if;
  if exists (select 1 from public.profile_interests where profile_id = p_record.id) then score := score + 10; end if;

  return score;
end;
$$;

-- ============================================================================
-- TRIGGER: Update profile completion when profile changes
-- ============================================================================
create or replace function public.update_profile_completion()
returns trigger
language plpgsql
as $$
begin
  new.profile_completion_pct = public.calculate_profile_completion(new.id);
  return new;
end;
$$;

create trigger update_profile_completion before insert or update on public.profiles
  for each row execute function public.update_profile_completion();

-- ============================================================================
-- TRIGGER: Update user last_seen_at on activity
-- ============================================================================
-- This is intentionally not a database trigger (too expensive).
-- The application should periodically update last_seen_at via a
-- lightweight API call.

-- ============================================================================
-- FUNCTION: lookup_referral_code — Securely look up a referral code during signup
-- ============================================================================
-- This is a security definer function so users can look up referral codes
-- without direct table access (preventing enumeration abuse).
-- Returns the referrer's user ID if the code is valid and active.
create or replace function public.lookup_referral_code(code_text text)
returns uuid
language plpgsql
security definer
as $$
declare
  referrer_id uuid;
begin
  select user_id into referrer_id
  from public.referral_codes
  where code = code_text
    and is_active = true;

  return referrer_id;
end;
$$;

-- ============================================================================
-- FUNCTION: create_referral — Securely create a referral record during signup
-- ============================================================================
create or replace function public.create_referral(
  p_referrer_id uuid,
  p_referred_user_id uuid,
  p_referral_code_id uuid,
  p_source text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  referral_id uuid;
begin
  -- Validate inputs
  if p_referrer_id = p_referred_user_id then
    raise exception 'Self-referral is not allowed';
  end if;

  -- Check referred user doesn't already have a referral
  if exists (select 1 from public.referrals where referred_user_id = p_referred_user_id) then
    return null;
  end if;

  -- Check referrer exists and is active
  if not exists (select 1 from public.users where id = p_referrer_id and is_active = true and is_banned = false) then
    return null;
  end if;

  insert into public.referrals (referrer_id, referred_user_id, referral_code_id, source)
  values (p_referrer_id, p_referred_user_id, p_referral_code_id, p_source)
  returning id into referral_id;

  return referral_id;
end;
$$;

-- ============================================================================
-- FUNCTION: create_subscription — Securely create a subscription
-- ============================================================================
create or replace function public.create_subscription(
  p_user_id uuid,
  p_plan text,
  p_provider subscription_provider default 'telegram_stars',
  p_provider_subscription_id text default null,
  p_purchase_id uuid default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  sub_id uuid;
  expires timestamptz;
begin
  -- Calculate expiration based on plan
  if p_plan = 'monthly' then
    expires := now() + interval '30 days';
  elsif p_plan = 'yearly' then
    expires := now() + interval '365 days';
  else
    expires := null;
  end if;

  insert into public.subscriptions (user_id, plan, status, provider, provider_subscription_id, purchase_id, starts_at, expires_at)
  values (p_user_id, p_plan, 'active', p_provider, p_provider_subscription_id, p_purchase_id, now(), expires)
  returning id into sub_id;

  -- Log subscription event
  insert into public.subscription_events (subscription_id, event_type, old_status, new_status, metadata)
  values (sub_id, 'created', null, 'active', jsonb_build_object('plan', p_plan, 'provider', p_provider));

  return sub_id;
end;
$$;

-- ============================================================================
-- TRIGGER: Update post like/comment counts (denormalized counters)
-- ============================================================================
create or replace function public.update_post_like_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger update_post_like_count after insert or delete on public.post_likes
  for each row execute function public.update_post_like_count();

create or replace function public.update_post_comment_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger update_post_comment_count after insert or delete on public.post_comments
  for each row execute function public.update_post_comment_count();
