-- Vibe Database — Private Match Chat System (Prompt 09)
-- Extends the existing messaging foundation (008_messaging.sql) for match-based 1-to-1 chat.
--
-- Adds:
--   - Message type, status, and delivery columns to messages
--   - match_id link from conversations to matches
--   - Idempotency support via client_message_id
--   - Auto-create conversation trigger on match creation
--   - RLS policies for match-based chat access
--   - Performance indexes

-- ============================================================================
-- EXTEND CONVERSATIONS — Link to matches
-- ============================================================================
alter table public.conversations
  add column if not exists match_id uuid references public.matches(id) on delete cascade;

-- Ensure at most one conversation per match
create unique index if not exists conversations_match_id_idx on public.conversations (match_id)
  where match_id is not null;

-- ============================================================================
-- NEW ENUMS FOR MESSAGE SYSTEM
-- ============================================================================
do $$ begin
  create type message_type as enum ('text', 'image', 'video', 'system');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type message_status as enum ('sent', 'delivered', 'read');
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- EXTEND MESSAGES — Add type, status, delivery tracking, idempotency
-- ============================================================================
alter table public.messages
  add column if not exists message_type message_type not null default 'text';

alter table public.messages
  add column if not exists status message_status not null default 'sent';

alter table public.messages
  add column if not exists delivered_at timestamptz;

alter table public.messages
  add column if not exists read_at timestamptz;

-- Idempotency: client-provided unique key per sender per conversation
alter table public.messages
  add column if not exists client_message_id text;

-- Prevent duplicate sends by idempotency key
create unique index if not exists messages_client_idempotency_idx
  on public.messages (conversation_id, sender_id, client_message_id)
  where client_message_id is not null;

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================
-- Efficient chronological message retrieval
create index if not exists messages_conversation_chronological_idx
  on public.messages (conversation_id, created_at asc, id asc);

-- Unread message count query
create index if not exists messages_unread_status_idx
  on public.messages (conversation_id, status)
  where status = 'sent' or status = 'delivered';

-- ============================================================================
-- FUNCTION: get_or_create_match_conversation
-- Returns the conversation ID for a match, creating it if needed.
-- ============================================================================
create or replace function public.get_or_create_match_conversation(p_match_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_conversation_id uuid;
  v_match record;
begin
  -- Try existing conversation
  select id into v_conversation_id
  from public.conversations
  where match_id = p_match_id;

  if found then
    return v_conversation_id;
  end if;

  -- Get match participants
  select * into v_match
  from public.matches
  where id = p_match_id;

  if not found then
    raise exception 'Match not found' using errcode = 'NFND';
  end if;

  if v_match.status != 'active' then
    raise exception 'Match is not active' using errcode = 'MACV';
  end if;

  -- Create conversation
  insert into public.conversations (is_group, created_by, match_id)
  values (false, v_match.user_a_id, p_match_id)
  returning id into v_conversation_id;

  -- Add both participants as members
  insert into public.conversation_members (conversation_id, user_id)
  values
    (v_conversation_id, v_match.user_a_id),
    (v_conversation_id, v_match.user_b_id);

  return v_conversation_id;
end;
$$;

-- ============================================================================
-- FUNCTION: can_access_match_chat
-- Centralized access check: user can chat only in active, unblocked matches
-- ============================================================================
create or replace function public.can_access_match_chat(
  p_user_id uuid,
  p_conversation_id uuid
)
returns boolean
language plpgsql
stable
security definer
as $$
declare
  v_conv record;
  v_match record;
begin
  -- Get conversation
  select c.*, m.user_a_id as match_user_a, m.user_b_id as match_user_b,
         m.status as match_status
  into v_conv
  from public.conversations c
  join public.matches m on m.id = c.match_id
  where c.id = p_conversation_id;

  if not found then
    return false;
  end if;

  -- User must be a participant
  if p_user_id != v_conv.match_user_a and p_user_id != v_conv.match_user_b then
    return false;
  end if;

  -- Match must be active
  if v_conv.match_status != 'active' then
    return false;
  end if;

  -- Neither user blocked the other
  if public.user_is_blocked(v_conv.match_user_a, v_conv.match_user_b) then
    return false;
  end if;

  return true;
end;
$$;

-- ============================================================================
-- RLS — MESSAGES
-- ============================================================================
alter table public.messages enable row level security;

-- Users can read messages in conversations they can access
create policy "Users can read own conversation messages"
  on public.messages for select
  using (
    public.can_access_match_chat(auth.uid(), conversation_id)
  );

-- Users can insert messages they send, in conversations they can access
create policy "Users can send messages in accessible conversations"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and public.can_access_match_chat(auth.uid(), conversation_id)
  );

-- Users can update delivery/read status on messages they received
create policy "Users can mark messages as delivered/read"
  on public.messages for update
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
    )
    and sender_id != auth.uid()
  )
  with check (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
    )
    and sender_id != auth.uid()
  );

-- Users can soft-delete only their own messages
create policy "Users can soft-delete own messages"
  on public.messages for update
  using (sender_id = auth.uid())
  with check (
    sender_id = auth.uid()
    and deleted_at is not null
  );

-- ============================================================================
-- RLS — CONVERSATIONS
-- ============================================================================
alter table public.conversations enable row level security;

-- Users can see conversations they're members of
create policy "Users can see own conversations"
  on public.conversations for select
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversations.id
        and cm.user_id = auth.uid()
    )
    or public.is_moderator()
  );

-- ============================================================================
-- RLS — CONVERSATION MEMBERS
-- ============================================================================
alter table public.conversation_members enable row level security;

-- Users can see members of their own conversations
create policy "Users can see own conversation members"
  on public.conversation_members for select
  using (
    exists (
      select 1 from public.conversation_members cm2
      where cm2.conversation_id = conversation_members.conversation_id
        and cm2.user_id = auth.uid()
    )
  );

-- ============================================================================
-- RLS — MESSAGE ATTACHMENTS
-- ============================================================================
alter table public.message_attachments enable row level security;

-- Users can see attachments in their conversations
create policy "Users can see own conversation attachments"
  on public.message_attachments for select
  using (
    exists (
      select 1 from public.conversation_members cm
      join public.messages m on m.id = message_attachments.message_id
      where cm.conversation_id = m.conversation_id
        and cm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- ENABLE REALTIME FOR CHAT
-- ============================================================================
-- Messages table needs realtime for live chat
alter publication supabase_realtime add table public.messages;
