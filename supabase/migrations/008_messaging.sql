-- Vibe Database — Messaging Foundation
-- Direct and future group conversations with message history.
-- Designed for real-time retrieval patterns.

-- ============================================================================
-- CONVERSATIONS — Chat conversation metadata
-- ============================================================================
create table public.conversations (
  id            uuid          default gen_random_uuid() primary key,
  is_group      boolean       not null default false,
  title         text,                   -- null for 1:1 (derived from participants)
  created_by    uuid          references public.users(id) on delete set null,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create index conversations_updated_at_idx on public.conversations (updated_at desc);

-- ============================================================================
-- CONVERSATION MEMBERS — Participants in conversations
-- ============================================================================
create table public.conversation_members (
  conversation_id   uuid        not null references public.conversations(id) on delete cascade,
  user_id           uuid        not null references public.users(id) on delete cascade,
  joined_at         timestamptz not null default now(),
  last_read_at      timestamptz,
  is_active         boolean     not null default true,

  primary key (conversation_id, user_id)
);

-- Index for finding all conversations a user belongs to
create index conversation_members_user_id_idx on public.conversation_members (user_id, last_read_at);

-- ============================================================================
-- MESSAGES — Individual messages within conversations
-- ============================================================================
create table public.messages (
  id              uuid         default gen_random_uuid() primary key,
  conversation_id uuid         not null references public.conversations(id) on delete cascade,
  sender_id       uuid         not null references public.users(id) on delete cascade,
  content         text,
  reply_to_id     uuid         references public.messages(id) on delete set null,
  created_at      timestamptz  not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz   -- soft delete for "unsend"
);

-- Clustered index pattern: conversation_id + created_at for chronological retrieval
create index messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at desc);

create index messages_sender_id_idx on public.messages (sender_id);

-- ============================================================================
-- MESSAGE ATTACHMENTS — Media/files attached to messages
-- ============================================================================
create table public.message_attachments (
  id          uuid        default gen_random_uuid() primary key,
  message_id  uuid        not null references public.messages(id) on delete cascade,
  media_id    uuid        not null references public.media(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index message_attachments_message_id_idx on public.message_attachments (message_id);

-- ============================================================================
-- MESSAGE READS — Per-message read receipts (optional, for future)
-- ============================================================================
create table public.message_reads (
  message_id  uuid        not null references public.messages(id) on delete cascade,
  user_id     uuid        not null references public.users(id) on delete cascade,
  read_at     timestamptz not null default now(),

  primary key (message_id, user_id)
);
