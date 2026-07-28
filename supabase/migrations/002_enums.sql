-- Vibe Database — Enums
-- All application enum types. These represent values that are
-- genuinely constrained and should not be stored as free text.

-- Gender representation
create type gender as enum (
  'male',
  'female',
  'non_binary',
  'prefer_not_to_say'
);

-- Dating / relationship intent
create type dating_intent as enum (
  'dating',
  'friendship',
  'chat',
  'relationship',
  'not_sure'
);

-- Type of social post
create type post_type as enum (
  'text',
  'image',
  'video',
  'poll'
);

-- Type of media file
create type media_type as enum (
  'image',
  'video',
  'audio'
);

-- Media processing status
create type media_processing_status as enum (
  'pending',
  'processing',
  'ready',
  'failed'
);

-- Storage provider for media
create type storage_provider as enum (
  'telegram',
  'supabase',
  'external_cdn'
);

-- Reaction types on posts
create type reaction_type as enum (
  'like',
  'love',
  'haha',
  'wow',
  'sad',
  'angry'
);

-- Dating action types
create type dating_action_type as enum (
  'like',
  'pass',
  'super_like'
);

-- Match status
create type match_status as enum (
  'active',
  'unmatched',
  'blocked'
);

-- Report status for moderation
create type report_status as enum (
  'pending',
  'reviewing',
  'resolved',
  'dismissed'
);

-- Report reason categories
create type report_reason as enum (
  'spam',
  'harassment',
  'nudity',
  'hate_speech',
  'violence',
  'impersonation',
  'copyright',
  'other'
);

-- Block source
create type block_source as enum (
  'manual',
  'auto_moderation'
);

-- Subscription status
create type subscription_status as enum (
  'active',
  'cancelled',
  'expired',
  'paused'
);

-- Subscription provider
create type subscription_provider as enum (
  'telegram_stars',
  'app_store',
  'play_store'
);

-- Purchase/product type
create type product_type as enum (
  'premium_subscription',
  'boost',
  'super_like',
  'gift',
  'spotlight'
);

-- Payment/purchase status
create type purchase_status as enum (
  'pending',
  'completed',
  'failed',
  'refunded',
  'cancelled'
);

-- User role for authorization
create type user_role as enum (
  'user',
  'moderator',
  'admin',
  'super_admin'
);

-- Notification type
create type notification_type as enum (
  'new_match',
  'new_message',
  'post_like',
  'post_comment',
  'new_follower',
  'story_view',
  'subscription_expired',
  'subscription_renewed',
  'report_update',
  'system'
);

-- Post visibility
create type post_visibility as enum (
  'public',
  'followers_only',
  'private'
);

-- Story visibility
create type story_visibility as enum (
  'public',
  'followers_only'
);

-- Profile visibility
create type profile_visibility as enum (
  'public',
  'matches_only',
  'private'
);

-- Online visibility
create type online_visibility as enum (
  'everyone',
  'matches_only',
  'nobody'
);

-- Referral reward status
create type referral_reward_status as enum (
  'pending',
  'awarded',
  'expired'
);

-- Community visibility
create type community_visibility as enum (
  'public',
  'private'
);

-- Notification delivery channel
create type notification_channel as enum (
  'in_app',
  'push',
  'email'
);
