-- Vibe Database — Row Level Security
-- RLS policies for every application table.
-- Default: DENY all. Policies selectively grant access based on user identity.
-- Uses auth.uid() from Supabase Auth for identity verification.
-- NEVER trust client-provided user IDs.

-- ============================================================================
-- Enable RLS on all tables
-- ============================================================================
alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_photos enable row level security;
alter table public.profile_preferences enable row level security;
alter table public.interests enable row level security;
alter table public.profile_interests enable row level security;
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_saves enable row level security;
alter table public.media enable row level security;
alter table public.post_media enable row level security;
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.dating_actions enable row level security;
alter table public.matches enable row level security;
alter table public.blocks enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_reads enable row level security;
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_rewards enable row level security;
alter table public.purchases enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.system_config enable row level security;
alter table public.feature_flags enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.analytics_events enable row level security;

-- ============================================================================
-- USERS
-- ============================================================================
-- Users can read their own data. Moderators/admin can read all.
create policy "Users can read own data"
  on public.users for select
  using (id = auth.uid() or public.is_moderator());

create policy "Users can update own non-role data"
  on public.users for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Only super_admin can insert/delete users (via admin functions)
create policy "Admin-only insert"
  on public.users for insert
  with check (public.is_admin());

create policy "Admin-only delete"
  on public.users for delete
  using (public.is_admin());

-- ============================================================================
-- PROFILES
-- ============================================================================
create policy "Profiles are readable by visibility"
  on public.profiles for select
  using (
    -- Owner can always read
    user_id = auth.uid()
    -- Public profiles readable by anyone
    or profile_visibility = 'public'
    -- Match-only profiles readable if matched
    or (profile_visibility = 'matches_only' and public.users_are_matched(user_id, auth.uid()))
    -- Moderators can read all
    or public.is_moderator()
  );

create policy "Users can update own profile"
  on public.profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (user_id = auth.uid());

create policy "Admin-only delete"
  on public.profiles for delete
  using (public.is_moderator());

-- ============================================================================
-- PROFILE PHOTOS
-- ============================================================================
create policy "Profile photos are publicly readable"
  on public.profile_photos for select
  using (true);

create policy "Users can manage own profile photos"
  on public.profile_photos for insert
  with check (user_id = auth.uid());

create policy "Users can update own profile photos"
  on public.profile_photos for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own profile photos"
  on public.profile_photos for delete
  using (user_id = auth.uid());

-- ============================================================================
-- PROFILE PREFERENCES
-- ============================================================================
create policy "Users can read own preferences"
  on public.profile_preferences for select
  using (user_id = auth.uid());

create policy "Users can manage own preferences"
  on public.profile_preferences for insert
  with check (user_id = auth.uid());

create policy "Users can update own preferences"
  on public.profile_preferences for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own preferences"
  on public.profile_preferences for delete
  using (user_id = auth.uid());

-- ============================================================================
-- INTERESTS
-- ============================================================================
-- Interests catalog is publicly readable
create policy "Interests are publicly readable"
  on public.interests for select
  using (true);

create policy "Admin-only interest management"
  on public.interests for insert
  with check (public.is_admin());

create policy "Admin-only interest update"
  on public.interests for update
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- PROFILE INTERESTS
-- ============================================================================
create policy "Profile interests are publicly readable"
  on public.profile_interests for select
  using (true);

create policy "Users can manage own profile interests"
  on public.profile_interests for insert
  with check (exists (
    select 1 from public.profiles where id = profile_id and user_id = auth.uid()
  ));

create policy "Users can delete own profile interests"
  on public.profile_interests for delete
  using (exists (
    select 1 from public.profiles where id = profile_id and user_id = auth.uid()
  ));

-- ============================================================================
-- FOLLOWS
-- ============================================================================
create policy "Follows are publicly readable"
  on public.follows for select
  using (true);

create policy "Users can manage own follows"
  on public.follows for insert
  with check (follower_id = auth.uid());

create policy "Users can unfollow"
  on public.follows for delete
  using (follower_id = auth.uid());

-- ============================================================================
-- POSTS
-- ============================================================================
create policy "Public posts are readable"
  on public.posts for select
  using (
    deleted_at is null
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

create policy "Users can create posts"
  on public.posts for insert
  with check (author_id = auth.uid());

create policy "Users can update own posts"
  on public.posts for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "Users can soft-delete own posts"
  on public.posts for delete
  using (author_id = auth.uid() or public.is_moderator());

-- ============================================================================
-- POST LIKES
-- ============================================================================
create policy "Post likes are readable"
  on public.post_likes for select
  using (true);

create policy "Users can like posts"
  on public.post_likes for insert
  with check (user_id = auth.uid());

create policy "Users can unlike posts"
  on public.post_likes for delete
  using (user_id = auth.uid());

-- ============================================================================
-- POST COMMENTS
-- ============================================================================
create policy "Post comments are readable"
  on public.post_comments for select
  using (deleted_at is null or public.is_moderator());

create policy "Users can comment"
  on public.post_comments for insert
  with check (author_id = auth.uid());

create policy "Users can update own comments"
  on public.post_comments for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "Users can delete own comments"
  on public.post_comments for delete
  using (author_id = auth.uid() or public.is_moderator());

-- ============================================================================
-- POST REACTIONS
-- ============================================================================
create policy "Post reactions are readable"
  on public.post_reactions for select
  using (true);

create policy "Users can react"
  on public.post_reactions for insert
  with check (user_id = auth.uid());

create policy "Users can update own reaction"
  on public.post_reactions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can remove own reaction"
  on public.post_reactions for delete
  using (user_id = auth.uid());

-- ============================================================================
-- POST SAVES
-- ============================================================================
create policy "Users can read own saves"
  on public.post_saves for select
  using (user_id = auth.uid());

create policy "Users can save posts"
  on public.post_saves for insert
  with check (user_id = auth.uid());

create policy "Users can unsave posts"
  on public.post_saves for delete
  using (user_id = auth.uid());

-- ============================================================================
-- MEDIA
-- ============================================================================
create policy "Media is readable by owner and post viewers"
  on public.media for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.post_media where media_id = id
      and exists (
        select 1 from public.posts where id = post_id
        and (visibility = 'public' or author_id = auth.uid() or public.is_moderator())
      )
    )
    or public.is_moderator()
  );

create policy "Users can insert own media"
  on public.media for insert
  with check (owner_id = auth.uid());

create policy "Users can update own media"
  on public.media for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Users can soft-delete own media"
  on public.media for delete
  using (owner_id = auth.uid() or public.is_moderator());

-- ============================================================================
-- POST MEDIA
-- ============================================================================
create policy "Post media readable with post"
  on public.post_media for select
  using (true);

create policy "Post authors can attach media"
  on public.post_media for insert
  with check (exists (
    select 1 from public.posts where id = post_id and author_id = auth.uid()
  ));

create policy "Post authors can remove media"
  on public.post_media for delete
  using (exists (
    select 1 from public.posts where id = post_id and author_id = auth.uid()
  ));

-- ============================================================================
-- STORIES
-- ============================================================================
create policy "Stories readable by followers or if public"
  on public.stories for select
  using (
    deleted_at is null
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

create policy "Users can create stories"
  on public.stories for insert
  with check (author_id = auth.uid());

create policy "Users can delete own stories"
  on public.stories for delete
  using (author_id = auth.uid());

-- ============================================================================
-- STORY VIEWS
-- ============================================================================
create policy "Story authors can see views"
  on public.story_views for select
  using (exists (
    select 1 from public.stories where id = story_id and author_id = auth.uid()
  ));

create policy "Users can view stories"
  on public.story_views for insert
  with check (viewer_id = auth.uid());

-- ============================================================================
-- DATING ACTIONS
-- ============================================================================
create policy "Users can read own dating actions"
  on public.dating_actions for select
  using (actor_id = auth.uid());

-- Target can see that they were liked (but not who passed)
create policy "Target can see likes"
  on public.dating_actions for select
  using (
    target_id = auth.uid()
    and action in ('like', 'super_like')
  );

create policy "Users can perform dating actions"
  on public.dating_actions for insert
  with check (actor_id = auth.uid());

create policy "Users can undo own actions"
  on public.dating_actions for delete
  using (actor_id = auth.uid());

-- ============================================================================
-- MATCHES
-- ============================================================================
create policy "Users can see own matches"
  on public.matches for select
  using (
    user_a_id = auth.uid()
    or user_b_id = auth.uid()
    or public.is_moderator()
  );

-- Matches are created by the create_match() function (security definer)
-- No direct insert/update/delete from user sessions

-- ============================================================================
-- BLOCKS
-- ============================================================================
create policy "Blockers can see own blocks"
  on public.blocks for select
  using (blocker_id = auth.uid());

-- Blocked users need to know they're blocked (to prevent interaction)
create policy "Blocked users can see block status"
  on public.blocks for select
  using (blocked_id = auth.uid());

create policy "Users can block others"
  on public.blocks for insert
  with check (blocker_id = auth.uid());

create policy "Users can unblock"
  on public.blocks for delete
  using (blocker_id = auth.uid());

-- ============================================================================
-- CONVERSATIONS
-- ============================================================================
create policy "Members can see conversations"
  on public.conversations for select
  using (
    exists (
      select 1 from public.conversation_members
      where conversation_id = id and user_id = auth.uid()
    )
    or public.is_moderator()
  );

create policy "Users can create conversations"
  on public.conversations for insert
  with check (created_by = auth.uid());

-- ============================================================================
-- CONVERSATION MEMBERS
-- ============================================================================
create policy "Users can see own memberships"
  on public.conversation_members for select
  using (user_id = auth.uid() or public.is_moderator());

create policy "Conversation creators can add members"
  on public.conversation_members for insert
  with check (
    exists (
      select 1 from public.conversations
      where id = conversation_id and created_by = auth.uid()
    )
  );

create policy "Users can leave conversations"
  on public.conversation_members for delete
  using (user_id = auth.uid());

-- ============================================================================
-- MESSAGES
-- ============================================================================
create policy "Conversation members can read messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversation_members
      where conversation_id = messages.conversation_id and user_id = auth.uid()
    )
    or public.is_moderator()
  );

create policy "Conversation members can send messages"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversation_members
      where conversation_id = messages.conversation_id and user_id = auth.uid()
      and is_active = true
    )
  );

create policy "Users can edit own messages"
  on public.messages for update
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

create policy "Users can soft-delete own messages"
  on public.messages for delete
  using (sender_id = auth.uid());

-- ============================================================================
-- MESSAGE ATTACHMENTS
-- ============================================================================
create policy "Message attachments readable with message"
  on public.message_attachments for select
  using (true);

create policy "Message senders can attach files"
  on public.message_attachments for insert
  with check (exists (
    select 1 from public.messages where id = message_id and sender_id = auth.uid()
  ));

-- ============================================================================
-- MESSAGE READS
-- ============================================================================
create policy "Users can see reads on own messages"
  on public.message_reads for select
  using (exists (
    select 1 from public.messages where id = message_id and sender_id = auth.uid()
  ));

create policy "Users can mark messages as read"
  on public.message_reads for insert
  with check (user_id = auth.uid());

-- ============================================================================
-- COMMUNITIES
-- ============================================================================
create policy "Public communities are visible to all"
  on public.communities for select
  using (visibility = 'public' or owner_id = auth.uid() or public.is_moderator());

create policy "Users can create communities"
  on public.communities for insert
  with check (owner_id = auth.uid());

create policy "Owners can update communities"
  on public.communities for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners can delete communities"
  on public.communities for delete
  using (owner_id = auth.uid() or public.is_moderator());

-- ============================================================================
-- COMMUNITY MEMBERS
-- ============================================================================
create policy "Membership is visible to members"
  on public.community_members for select
  using (
    user_id = auth.uid()
    or public.is_moderator()
  );

create policy "Users can join communities"
  on public.community_members for insert
  with check (user_id = auth.uid());

create policy "Users can leave communities"
  on public.community_members for delete
  using (user_id = auth.uid());

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
create policy "Users can see own notifications"
  on public.notifications for select
  using (recipient_id = auth.uid());

create policy "Users can mark notifications as read"
  on public.notifications for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Notifications are created by application services (security definer)
create policy "Users can delete own notifications"
  on public.notifications for delete
  using (recipient_id = auth.uid());

-- ============================================================================
-- REPORTS
-- ============================================================================
create policy "Reporters can see own reports"
  on public.reports for select
  using (reporter_id = auth.uid());

create policy "Moderators can see all reports"
  on public.reports for select
  using (public.is_moderator());

create policy "Users can create reports"
  on public.reports for insert
  with check (reporter_id = auth.uid());

create policy "Moderators can update reports"
  on public.reports for update
  using (public.is_moderator())
  with check (public.is_moderator());

-- ============================================================================
-- REFERRAL CODES
-- ============================================================================
-- Users can see their own referral code.
create policy "Users can see own referral code"
  on public.referral_codes for select
  using (user_id = auth.uid());

-- For code lookup during signup, use the security definer function
-- public.lookup_referral_code(code text) instead of direct table access.
-- This prevents enumeration of all referral codes.
-- NOTE: No public select policy — code lookup must use the helper function.

create policy "Users can create own referral code"
  on public.referral_codes for insert
  with check (user_id = auth.uid());

-- ============================================================================
-- REFERRALS
-- ============================================================================
-- Referral records are created by a security definer function during signup.
-- No direct insert/update/delete policies for regular users.
create policy "Referrers can see own referrals"
  on public.referrals for select
  using (referrer_id = auth.uid());

-- No insert/update/delete policies — must use security definer function

-- ============================================================================
-- REFERRAL REWARDS
-- ============================================================================
create policy "Users can see own rewards"
  on public.referral_rewards for select
  using (exists (
    select 1 from public.referrals where id = referral_id and referrer_id = auth.uid()
  ));

-- ============================================================================
-- PURCHASES
-- ============================================================================
create policy "Users can see own purchases"
  on public.purchases for select
  using (user_id = auth.uid());

-- Purchases are created by server-side code (security definer functions)
-- to prevent fraud — no direct user inserts

-- ============================================================================
-- SUBSCRIPTIONS
-- ============================================================================
create policy "Users can see own subscriptions"
  on public.subscriptions for select
  using (user_id = auth.uid());

-- Subscriptions are managed by server-side security definer functions.
-- Users cannot directly insert/update subscriptions to prevent fraud.
-- The application services call create_subscription() or admin functions.

-- ============================================================================
-- SUBSCRIPTION EVENTS
-- ============================================================================
create policy "Users can see own subscription events"
  on public.subscription_events for select
  using (exists (
    select 1 from public.subscriptions
    where id = subscription_id and user_id = auth.uid()
  ));

-- ============================================================================
-- SYSTEM CONFIG
-- ============================================================================
create policy "Config is readable by admins"
  on public.system_config for select
  using (public.is_admin());

create policy "Config is writable by admins"
  on public.system_config for insert
  with check (public.is_admin());

create policy "Config is updatable by admins"
  on public.system_config for update
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- FEATURE FLAGS
-- ============================================================================
create policy "Feature flags are visible to admins"
  on public.feature_flags for select
  using (public.is_admin());

create policy "Feature flags managed by admins"
  on public.feature_flags for insert
  with check (public.is_admin());

create policy "Feature flags updated by admins"
  on public.feature_flags for update
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- ADMIN AUDIT LOG
-- ============================================================================
create policy "Admins can read audit log"
  on public.admin_audit_log for select
  using (public.is_admin());

create policy "Admin actions are logged"
  on public.admin_audit_log for insert
  with check (admin_id = auth.uid() and public.is_admin());

-- ============================================================================
-- ANALYTICS EVENTS
-- ============================================================================
create policy "Users can insert own analytics events"
  on public.analytics_events for insert
  with check (user_id = auth.uid());

create policy "Admins can read analytics"
  on public.analytics_events for select
  using (public.is_admin());
