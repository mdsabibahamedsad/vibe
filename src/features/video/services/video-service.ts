import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import type { ShortVideoWithCreator, VideoFeedResponse, FeedType } from '../types';

const VIDEO_CONFIG = {
  maxFileSize: 50 * 1024 * 1024,
  maxDurationSeconds: 180,
  minDurationSeconds: 1,
  minWidth: 360,
  minHeight: 360,
  maxWidth: 3840,
  maxHeight: 3840,
  allowedMimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'] as readonly string[],
  maxCaptionLength: 500,
  maxHashtags: 30,
  baseUploadLimit: 10,
  premiumUploadLimit: 50,
  feedPageSize: 10,
  prefetchCount: 3,
} as const;

function sanitizeText(text: string): string {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function parseHashtags(caption: string): string[] {
  const matches = caption.match(/#[a-zA-Z0-9_]+/g);
  if (!matches) return [];
  return [...new Set(matches.map(t => t.slice(1).toLowerCase()))].slice(0, VIDEO_CONFIG.maxHashtags);
}

function parseMentions(caption: string): string[] {
  const matches = caption.match(/@[a-zA-Z0-9_]+/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(1)))];
}

async function getSignedVideoUrl(supabase: any, videoUrl: string): Promise<string> {
  if (!videoUrl) return '';
  const { data } = await supabase.storage
    .from('short-videos')
    .createSignedUrl(videoUrl, 60 * 60);
  return data?.signedUrl || '';
}

async function checkPremiumUploadLimit(supabase: any, userId: string): Promise<{ allowed: boolean; limit: number }> {
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('subscription_tier, subscription_expires_at')
    .eq('user_id', userId)
    .single();

  const isPremium = userProfile?.subscription_tier &&
    userProfile.subscription_tier !== 'free' &&
    userProfile.subscription_expires_at &&
    new Date(userProfile.subscription_expires_at) > new Date();

  const limit = isPremium ? VIDEO_CONFIG.premiumUploadLimit : VIDEO_CONFIG.baseUploadLimit;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('short_videos')
    .select('*', { count: 'exact', head: true })
    .eq('creator_id', userId)
    .gte('created_at', today.toISOString());

  return { allowed: (count || 0) < limit, limit };
}

async function trackAnalyticsEvent(
  supabase: any,
  userId: string,
  eventName: string,
  videoId: string,
  metadata?: Record<string, any>
): Promise<void> {
  await supabase.from('analytics_events').insert({
    user_id: userId,
    event_name: eventName,
    entity_type: 'video',
    entity_id: videoId,
    properties: metadata || {},
  });
}

export async function uploadVideo(data: {
  caption: string;
  durationSeconds: number;
  width: number;
  height: number;
  fileSize: number;
  mimeType: string;
  videoUrl: string;
  thumbnailUrl?: string;
  musicTrack?: string;
  isPremiumOnly?: boolean;
}): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  if (!VIDEO_CONFIG.allowedMimeTypes.includes(data.mimeType as any)) {
    return { error: 'Invalid video format. Only MP4, WebM, and QuickTime are supported.' };
  }

  if (data.durationSeconds < VIDEO_CONFIG.minDurationSeconds || data.durationSeconds > VIDEO_CONFIG.maxDurationSeconds) {
    return { error: `Video must be between ${VIDEO_CONFIG.minDurationSeconds} and ${VIDEO_CONFIG.maxDurationSeconds} seconds.` };
  }

  const { allowed, limit } = await checkPremiumUploadLimit(supabase, user.id);
  if (!allowed) return { error: `Daily upload limit reached (${limit} videos). Upgrade to premium for more.` };

  const hashtags = parseHashtags(data.caption);
  const mentions = parseMentions(data.caption);

  const { data: video, error } = await supabase
    .from('short_videos')
    .insert({
      creator_id: user.id,
      caption: sanitizeText(data.caption.slice(0, VIDEO_CONFIG.maxCaptionLength)),
      video_url: data.videoUrl,
      thumbnail_url: data.thumbnailUrl || null,
      duration_seconds: data.durationSeconds,
      width: data.width,
      height: data.height,
      file_size: data.fileSize,
      mime_type: data.mimeType,
      music_track: data.musicTrack || null,
      hashtags,
      mentions,
      is_premium_only: data.isPremiumOnly || false,
      status: 'processing',
    })
    .select('id')
    .single();

  if (error) return { error: 'Failed to upload video' };

  await trackAnalyticsEvent(supabase, user.id, 'video_uploaded', video.id, {
    duration: data.durationSeconds, hasThumbnail: !!data.thumbnailUrl,
  });

  return { id: video.id };
}

export async function getVideoFeed(
  feedType: FeedType = 'for_you',
  cursor?: string,
  limit: number = VIDEO_CONFIG.feedPageSize
): Promise<VideoFeedResponse> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { videos: [], hasMore: false };

  const offset = cursor ? parseInt(cursor, 10) : 0;

  const { data, error } = await supabase.rpc('get_video_feed', {
    p_viewer_id: user.id,
    p_feed_type: feedType,
    p_limit: limit + 1,
    p_offset: offset,
  });

  if (error || !data) return { videos: [], hasMore: false };

  const hasMore = data.length > limit;
  const page = data.slice(0, limit);

  const videos: ShortVideoWithCreator[] = await Promise.all(
    page.map(async (v: any) => ({
      id: v.id,
      creatorId: v.creator_id,
      caption: v.caption || '',
      videoUrl: await getSignedVideoUrl(supabase, v.video_url),
      thumbnailUrl: v.thumbnail_url || undefined,
      durationSeconds: v.duration_seconds,
      width: v.width,
      height: v.height,
      fileSize: v.file_size,
      mimeType: v.mime_type,
      status: v.status,
      hashtags: v.hashtags || [],
      mentions: v.mentions || [],
      musicTrack: v.music_track || undefined,
      moderationStatus: v.moderation_status,
      viewCount: v.view_count || 0,
      likeCount: v.like_count || 0,
      commentCount: v.comment_count || 0,
      shareCount: v.share_count || 0,
      saveCount: v.save_count || 0,
      isPremiumOnly: v.is_premium_only || false,
      createdAt: v.created_at,
      updatedAt: v.updated_at,
      creatorName: v.creator_name || 'Unknown',
      creatorAvatar: v.creator_avatar || undefined,
      creatorVerified: v.creator_verified || false,
      isLiked: v.is_liked || false,
      isSaved: v.is_saved || false,
      isFollowing: v.is_following || false,
    }))
  );

  const nextCursor = hasMore ? String(offset + limit) : undefined;

  return { videos, nextCursor, hasMore };
}

export async function getVideo(videoId: string): Promise<{ video?: ShortVideoWithCreator; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const { data, error } = await supabase.rpc('get_video_details', {
    p_video_id: videoId,
    p_viewer_id: user.id,
  });

  if (error || !data) return { error: 'Video not found' };

  const v = (data as any[])[0];
  return {
    video: {
      id: v.id,
      creatorId: v.creator_id,
      caption: v.caption || '',
      videoUrl: await getSignedVideoUrl(supabase, v.video_url),
      thumbnailUrl: v.thumbnail_url || undefined,
      durationSeconds: v.duration_seconds,
      width: v.width,
      height: v.height,
      fileSize: v.file_size,
      mimeType: v.mime_type,
      status: v.status,
      hashtags: v.hashtags || [],
      mentions: v.mentions || [],
      musicTrack: v.music_track || undefined,
      moderationStatus: v.moderation_status,
      viewCount: v.view_count || 0,
      likeCount: v.like_count || 0,
      commentCount: v.comment_count || 0,
      shareCount: v.share_count || 0,
      saveCount: v.save_count || 0,
      isPremiumOnly: v.is_premium_only || false,
      createdAt: v.created_at,
      updatedAt: v.updated_at,
      creatorName: v.creator_name || 'Unknown',
      creatorAvatar: v.creator_avatar || undefined,
      creatorVerified: v.creator_verified || false,
      isLiked: v.is_liked || false,
      isSaved: v.is_saved || false,
      isFollowing: v.is_following || false,
    },
  };
}

export async function recordView(videoId: string, watchDurationMs: number): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const completionPct = Math.min((watchDurationMs / (180 * 1000)) * 100, 100);
  const isCompleted = completionPct >= 90;

  const { error } = await supabase.rpc('record_video_view', {
    p_video_id: videoId,
    p_user_id: user.id,
    p_watch_duration_ms: watchDurationMs,
    p_completion_pct: completionPct,
    p_is_completed: isCompleted,
  });

  if (error) return { success: false, error: 'Failed to record view' };

  await trackAnalyticsEvent(supabase, user.id, 'video_viewed', videoId, {
    watchDurationMs, completionPct, isCompleted,
  });

  return { success: true };
}

export async function likeVideo(videoId: string): Promise<{ liked: boolean; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { liked: false, error: 'Unauthorized' };

  const { data: existing } = await supabase
    .from('video_likes')
    .select('id')
    .eq('video_id', videoId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    await supabase.from('video_likes').delete().eq('id', existing.id);
    return { liked: false };
  }

  const { error } = await supabase.from('video_likes').insert({
    video_id: videoId,
    user_id: user.id,
  });

  if (error) return { liked: false, error: 'Failed to like video' };
  return { liked: true };
}

export async function saveVideo(videoId: string): Promise<{ saved: boolean; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { saved: false, error: 'Unauthorized' };

  const { data: existing } = await supabase
    .from('video_saves')
    .select('id')
    .eq('video_id', videoId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    await supabase.from('video_saves').delete().eq('id', existing.id);
    return { saved: false };
  }

  const { error } = await supabase.from('video_saves').insert({
    video_id: videoId,
    user_id: user.id,
  });

  if (error) return { saved: false, error: 'Failed to save video' };
  return { saved: true };
}
