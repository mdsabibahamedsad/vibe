import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import type { LiveSession, StreamParticipant, StreamChatMessage, GiftCatalogItem, StreamDiscoveryItem } from '../types';

const LIVE_CONFIG = {
  maxTitleLength: 200,
  maxDescriptionLength: 2000,
  maxScheduledDaysAhead: 30,
  slowModeOptions: [0, 5, 10, 30, 60],
  maxViewersPerStream: 10000,
} as const;

function sanitizeText(text: string): string {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

async function trackAnalytics(supabase: any, userId: string, eventName: string, sessionId: string, metadata?: Record<string, any>) {
  try {
    await supabase.from('analytics_events').insert({
      user_id: userId,
      event_name: eventName,
      entity_type: 'live_session',
      entity_id: sessionId,
      properties: metadata || {},
    });
  } catch {}
}

export async function createStream(data: {
  title: string;
  description?: string;
  category?: string;
  privacy?: string;
  language?: string;
  scheduledAt?: string;
  isPremium?: boolean;
}): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: trust } = await supabase.from('user_trust_levels').select('trust_level').eq('user_id', user.id).maybeSingle();
  if (trust?.trust_level === 'restricted') return { error: 'Account restricted from streaming' };

  const title = data.title.slice(0, LIVE_CONFIG.maxTitleLength);
  const category = data.category || 'just_chatting';
  const privacy = data.privacy || 'public';
  const validCategories = ['just_chatting', 'gaming', 'music', 'creative', 'sports', 'fitness', 'food', 'travel', 'education', 'dating_advice', 'other'];
  const validPrivacy = ['public', 'followers', 'subscribers'];

  if (!validCategories.includes(category)) return { error: 'Invalid category' };
  if (!validPrivacy.includes(privacy)) return { error: 'Invalid privacy' };

  const status = data.scheduledAt ? 'scheduled' : 'starting';

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name')
    .eq('user_id', user.id)
    .single();

  const { data: session, error } = await supabase
    .from('live_sessions')
    .insert({
      title: sanitizeText(title),
      description: data.description ? sanitizeText(data.description.slice(0, LIVE_CONFIG.maxDescriptionLength)) : null,
      host_id: user.id,
      host_name: profile?.full_name || 'Unknown',
      category,
      privacy,
      language: data.language || 'en',
      status,
      scheduled_at: data.scheduledAt || null,
      is_premium: data.isPremium || false,
      is_recording: true,
    })
    .select('id')
    .single();

  if (error) return { error: 'Failed to create stream' };

  await trackAnalytics(supabase, user.id, 'stream_created', session.id, { category, privacy });
  return { id: session.id };
}

export async function startStream(sessionId: string, streamUrl: string, streamKey: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.rpc('start_live_stream', {
    p_session_id: sessionId,
    p_stream_url: streamUrl,
    p_stream_key: streamKey,
  });

  if (error) return { success: false, error: 'Failed to start stream' };

  const { data: followers } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('following_id', user.id);

  if (followers && followers.length > 0) {
    const notifications = followers.map((f: any) => ({
      user_id: f.follower_id,
      type: 'stream_live',
      title: 'Stream Started!',
      body: 'A creator you follow has started streaming.',
      actor_id: user.id,
      target_type: 'live_session',
      target_id: sessionId,
      link: `/live/${sessionId}`,
    }));
    try {
      await supabase.from('notifications').insert(notifications);
    } catch {}
  }

  await trackAnalytics(supabase, user.id, 'stream_started', sessionId);
  return { success: true };
}

export async function endStream(sessionId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.rpc('end_live_stream', { p_session_id: sessionId });
  if (error) return { success: false, error: 'Failed to end stream' };

  await trackAnalytics(supabase, user.id, 'stream_ended', sessionId);
  return { success: true };
}

export async function getStream(sessionId: string): Promise<{ session?: LiveSession; participants?: StreamParticipant[]; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('live_sessions')
    .select('*, user_profiles!host_id(full_name, avatar_url)')
    .eq('id', sessionId)
    .single();

  if (error || !data) return { error: 'Stream not found' };

  const { data: participants } = await supabase
    .from('live_participants')
    .select('*')
    .eq('session_id', sessionId)
    .eq('status', 'joined')
    .order('joined_at', { ascending: true });

  return {
    session: {
      id: data.id,
      title: data.title,
      hostId: data.host_id,
      hostName: data.user_profiles?.full_name || 'Unknown',
      hostAvatar: data.user_profiles?.avatar_url || undefined,
      category: data.category || 'just_chatting',
      privacy: data.privacy || 'public',
      status: data.status,
      thumbnailUrl: data.thumbnail_url || undefined,
      streamUrl: data.stream_url || undefined,
      playbackUrl: data.playback_url || undefined,
      language: data.language || 'en',
      slowModeSeconds: data.slow_mode_seconds || 0,
      isModerationEnabled: data.is_moderation_enabled,
      isChatEnabled: data.is_chat_enabled,
      currentParticipants: data.current_participants || 0,
      peakViewerCount: data.peak_viewer_count || 0,
      maxParticipants: data.max_participants || 100,
      totalGiftAmount: data.total_gift_amount || 0,
      isRecording: data.is_recording || false,
      isPremium: data.is_premium || false,
      scheduledAt: data.scheduled_at,
      startedAt: data.started_at,
      endedAt: data.ended_at,
      createdAt: data.created_at,
    },
    participants: (participants || []).map((p: any) => ({
      id: p.id,
      sessionId: p.session_id,
      userId: p.user_id,
      userName: p.user_name,
      userAvatar: p.user_avatar,
      role: p.role,
      status: p.status,
      isMuted: p.is_muted,
      isMutedByHost: p.is_muted_by_host || false,
      isModerator: p.is_moderator || false,
      giftAmount: p.gift_amount || 0,
      joinedAt: p.joined_at,
      durationSeconds: p.duration_seconds || 0,
    })),
  };
}

export async function joinStream(sessionId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.rpc('join_live_stream', {
    p_session_id: sessionId,
    p_user_id: user.id,
  });

  if (error) return { success: false, error: 'Cannot join stream' };
  return { success: true };
}

export async function leaveStream(sessionId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  await supabase.rpc('leave_live_stream', { p_session_id: sessionId, p_user_id: user.id });
  return { success: true };
}

export async function getDiscoveryFeed(feedType: string = 'trending', category?: string): Promise<{
  streams: StreamDiscoveryItem[];
  error?: string;
}> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { streams: [], error: 'Unauthorized' };

  const { data, error } = await supabase.rpc('get_live_streams', {
    p_viewer_id: user.id,
    p_feed_type: feedType,
    p_category: category || null,
    p_limit: 20,
    p_offset: 0,
  });

  if (error) return { streams: [], error: 'Failed to load streams' };

  return {
    streams: (data || []).map((s: any) => ({
      id: s.id,
      hostId: s.host_id,
      hostName: s.host_name,
      hostAvatar: s.host_avatar || undefined,
      title: s.title,
      category: s.category,
      status: s.status,
      thumbnailUrl: s.thumbnail_url || undefined,
      viewerCount: s.viewer_count || 0,
      language: s.language || 'en',
      isPremium: s.is_premium || false,
      startedAt: s.started_at,
      scheduledAt: s.scheduled_at,
    })),
  };
}

export async function sendChatMessage(sessionId: string, content: string, replyToId?: string): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  if (!content.trim()) return { error: 'Message is empty' };

  const { data: msgId, error } = await supabase.rpc('send_stream_message', {
    p_session_id: sessionId,
    p_sender_id: user.id,
    p_content: sanitizeText(content.slice(0, 500)),
  });

  if (error) {
    if (error.message?.includes('Slow mode')) return { error: 'Slow mode enabled. Please wait.' };
    return { error: 'Failed to send message' };
  }

  if (replyToId) {
    await supabase.from('stream_chat_messages').update({ is_reply: true, reply_to_id: replyToId }).eq('id', msgId);
  }

  return { id: msgId };
}

export async function getChatMessages(sessionId: string, limit: number = 50): Promise<{ messages: StreamChatMessage[] }> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('stream_chat_messages')
    .select('*, user_profiles!sender_id(full_name, avatar_url)')
    .eq('session_id', sessionId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(limit);

  return {
    messages: (data || []).map((m: any) => ({
      id: m.id,
      sessionId: m.session_id,
      senderId: m.sender_id,
      senderName: m.user_profiles?.full_name || 'Unknown',
      senderAvatar: m.user_profiles?.avatar_url || undefined,
      content: m.content,
      isReply: m.is_reply,
      replyToId: m.reply_to_id || undefined,
      isSystemMessage: m.is_system_message,
      isDeleted: m.is_deleted,
      isFlagged: m.is_flagged,
      createdAt: m.created_at,
    })),
  };
}

export async function getGiftCatalog(): Promise<{ gifts: GiftCatalogItem[] }> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('stream_gift_catalog')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  return {
    gifts: (data || []).map((g: any) => ({
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      priceStars: g.price_stars,
      priceCoins: g.price_coins,
      animationUrl: g.animation_url || undefined,
      sortOrder: g.sort_order,
    })),
  };
}

export async function sendGift(sessionId: string, giftId: string, quantity: number = 1): Promise<{ transactionId?: string; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  if (quantity < 1 || quantity > 100) return { error: 'Invalid quantity' };

  const { data: txId, error } = await supabase.rpc('record_gift_transaction', {
    p_session_id: sessionId,
    p_sender_id: user.id,
    p_gift_id: giftId,
    p_quantity: quantity,
    p_transaction_ref: `gift_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
  });

  if (error) return { error: 'Failed to send gift' };

  await trackAnalytics(supabase, user.id, 'stream_gift_sent', sessionId, { gift_id: giftId, quantity });
  return { transactionId: txId };
}

export async function addModerator(sessionId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.from('stream_moderators').insert({
    session_id: sessionId,
    user_id: userId,
    added_by: user.id,
  });

  if (error) return { success: false, error: 'Failed to add moderator' };
  return { success: true };
}

export async function removeModerator(sessionId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('stream_moderators')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', userId);

  if (error) return { success: false, error: 'Failed to remove moderator' };
  return { success: true };
}

export async function muteParticipant(sessionId: string, targetUserId: string, muted: boolean): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.rpc('mute_stream_participant', {
    p_session_id: sessionId,
    p_target_user_id: targetUserId,
    p_muted: muted,
  });

  if (error) return { success: false, error: 'Failed to update mute status' };
  return { success: true };
}

export async function removeParticipant(sessionId: string, targetUserId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.rpc('remove_stream_participant', {
    p_session_id: sessionId,
    p_target_user_id: targetUserId,
  });

  if (error) return { success: false, error: 'Failed to remove participant' };
  return { success: true };
}

export async function deleteChatMessage(messageId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('stream_chat_messages')
    .update({ is_deleted: true })
    .eq('id', messageId);

  if (error) return { success: false, error: 'Failed to delete message' };
  return { success: true };
}

export async function getEarnings(): Promise<{ total: number; pending: number; available: number; history: any[]; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { total: 0, pending: 0, available: 0, history: [], error: 'Unauthorized' };

  const { data: earnings } = await supabase
    .from('creator_earnings')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const total = (earnings || []).reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const pending = (earnings || []).filter((e: any) => e.status === 'pending').reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const available = (earnings || []).filter((e: any) => e.status === 'available').reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

  return { total, pending, available, history: earnings || [] };
}
