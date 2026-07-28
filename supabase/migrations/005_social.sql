-- Vibe Database — Social Graph & Posts
-- Follow relationships, posts, and post engagement (likes, comments, saves, reactions).

-- ============================================================================
-- FOLLOWS — Social graph follow relationships
-- ============================================================================
create table public.follows (
  follower_id   uuid        not null references public.users(id) on delete cascade,
  following_id  uuid        not null references public.users(id) on delete cascade,
  created_at    timestamptz not null default now(),

  primary key (follower_id, following_id),

  -- Prevent self-follow
  constraint follows_no_self_check check (follower_id != following_id)
);

create index follows_following_id_idx on public.follows (following_id);
create index follows_created_at_idx on public.follows (created_at);

-- ============================================================================
-- POSTS — Social feed posts
-- ============================================================================
create table public.posts (
  id                uuid             default gen_random_uuid() primary key,
  author_id         uuid             not null references public.users(id) on delete cascade,
  caption           text,
  post_type         post_type        not null default 'text',
  visibility        post_visibility  not null default 'public',
  comments_enabled  boolean          not null default true,
  like_count        integer          not null default 0,
  comment_count     integer          not null default 0,
  created_at        timestamptz      not null default now(),
  updated_at        timestamptz      not null default now(),
  deleted_at        timestamptz       -- soft delete
);

create index posts_author_id_idx on public.posts (author_id);
create index posts_created_at_idx on public.posts (created_at desc);
create index posts_visibility_idx on public.posts (visibility);
create index posts_active_idx on public.posts (author_id, created_at desc) where deleted_at is null;

-- ============================================================================
-- POST LIKES — Like/unlike engagement on posts
-- ============================================================================
create table public.post_likes (
  post_id     uuid        not null references public.posts(id) on delete cascade,
  user_id     uuid        not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),

  primary key (post_id, user_id),

  -- Prevent self-liking posts is allowed, but we check it at the RLS/app level
  -- Actually, it's allowed — people can like their own posts.
  -- But we add a check for a different reason:
  -- The like must be on a post that exists (enforced by FK)
);

create index post_likes_user_id_idx on public.post_likes (user_id);

-- ============================================================================
-- POST COMMENTS — Comments on posts with threading support
-- ============================================================================
create table public.post_comments (
  id                uuid         default gen_random_uuid() primary key,
  post_id           uuid         not null references public.posts(id) on delete cascade,
  author_id         uuid         not null references public.users(id) on delete cascade,
  parent_comment_id uuid         references public.post_comments(id) on delete cascade,
  content           text         not null,
  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now(),
  deleted_at        timestamptz   -- soft delete
);

create index post_comments_post_id_idx on public.post_comments (post_id, created_at);
create index post_comments_author_id_idx on public.post_comments (author_id);
create index post_comments_parent_idx on public.post_comments (parent_comment_id) where parent_comment_id is not null;

-- ============================================================================
-- POST REACTIONS — Rich reactions on posts (like, love, haha, etc.)
-- ============================================================================
create table public.post_reactions (
  post_id     uuid            not null references public.posts(id) on delete cascade,
  user_id     uuid            not null references public.users(id) on delete cascade,
  reaction    reaction_type   not null,
  created_at  timestamptz     not null default now(),

  primary key (post_id, user_id)

  -- Users can change their reaction via ON CONFLICT on the PK
);

create index post_reactions_user_id_idx on public.post_reactions (user_id);

-- ============================================================================
-- POST SAVES — Bookmark/save posts for later
-- ============================================================================
create table public.post_saves (
  post_id     uuid        not null references public.posts(id) on delete cascade,
  user_id     uuid        not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),

  primary key (post_id, user_id)
);

create index post_saves_user_id_idx on public.post_saves (user_id);
