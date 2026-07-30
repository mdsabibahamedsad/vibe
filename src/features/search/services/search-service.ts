import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import type { SearchResult, SearchSuggestion, SearchHistoryItem, TrendingHashtag, TrendingCreator, TrendingVideo, ExploreFeedItem, SearchFilters, SearchResponse, TrendingPeriod, ExploreCategory } from '../types';

function sanitizeQuery(query: string): string {
  return query.replace(/[<>"'%;()&]/g, '').trim();
}

export async function globalSearch(
  query: string,
  filters?: SearchFilters,
  page: number = 1,
  limit: number = 20
): Promise<SearchResponse> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { results: [], total: 0, page, limit, query };

  const sanitized = sanitizeQuery(query);
  if (!sanitized) return { results: [], total: 0, page, limit, query };

  const entityTypes = filters?.entityTypes || ['user', 'post', 'video', 'story', 'live_stream', 'hashtag'];

  const { data, error } = await supabase.rpc('global_search', {
    p_query: sanitized,
    p_viewer_id: user.id,
    p_entity_types: entityTypes,
    p_limit: limit,
    p_offset: (page - 1) * limit,
    p_verified_only: filters?.verifiedOnly || false,
    p_language: filters?.language || null,
    p_min_age: filters?.minAge || null,
    p_max_age: filters?.maxAge || null,
  });

  if (error) return { results: [], total: 0, page, limit, query };

  try {
    await supabase.rpc('log_search', {
      p_user_id: user.id,
      p_query: sanitized,
      p_entity_type: null,
      p_entity_id: null,
      p_clicked: false,
    });
  } catch {}

  try {
    await supabase.from('analytics_events').insert({
      user_id: user.id,
      event_name: 'search_performed',
      entity_type: 'search',
      entity_id: null,
      properties: { query: sanitized, results_count: (data as any[])?.length || 0, filters: entityTypes },
    });
  } catch {}

  const results: SearchResult[] = ((data || []) as any[]).map((r: any) => ({
    entityType: r.entity_type,
    entityId: r.entity_id,
    title: r.title,
    subtitle: r.subtitle || '',
    description: r.description || '',
    imageUrl: r.image_url || undefined,
    url: r.url,
    relevanceScore: r.relevance_score,
    engagementCount: r.engagement_count || 0,
    isVerified: r.is_verified || false,
    isLive: r.is_live || false,
    createdAt: r.created_at,
  }));

  return { results, total: results.length, page, limit, query };
}

export async function getSearchSuggestions(query: string): Promise<{ suggestions: SearchSuggestion[] }> {
  const supabase = createServerClient();
  const { data } = await supabase.rpc('get_search_suggestions', { p_query: query, p_limit: 10 });
  return {
    suggestions: ((data || []) as any[]).map((s: any) => ({
      suggestion: s.suggestion,
      entityType: s.entity_type,
      entityId: s.entity_id || undefined,
      popularity: s.popularity || 0,
      isTrending: s.is_trending || false,
    })),
  };
}

export async function getSearchHistory(): Promise<{ history: SearchHistoryItem[] }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { history: [] };

  const { data } = await supabase
    .from('search_history')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  return {
    history: ((data || []) as any[]).map((h: any) => ({
      id: h.id,
      query: h.query,
      entityType: h.entity_type || undefined,
      entityId: h.entity_id || undefined,
      clicked: h.clicked,
      createdAt: h.created_at,
    })),
  };
}

export async function clearSearchHistory(): Promise<{ success: boolean }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { success: false };

  await supabase.from('search_history').delete().eq('user_id', user.id);
  return { success: true };
}

export async function getTrendingHashtags(period: TrendingPeriod = '24h', limit: number = 20): Promise<{ hashtags: TrendingHashtag[] }> {
  const supabase = createServerClient();
  const { data } = await supabase.rpc('get_trending_hashtags', { p_period: period, p_limit: limit });
  return {
    hashtags: ((data || []) as any[]).map((h: any) => ({
      id: h.id,
      hashtag: h.hashtag,
      displayName: h.display_name || undefined,
      postCount: h.post_count || 0,
      videoCount: h.video_count || 0,
      storyCount: h.story_count || 0,
      totalMentions: h.total_mentions || 0,
      uniqueCreators: h.unique_creators || 0,
      growthVelocity: h.growth_velocity || 0,
      engagementScore: h.engagement_score || 0,
      rank: h.rank || 0,
      lastTrending: h.last_trending || false,
      computedAt: h.computed_at,
    })),
  };
}

export async function getTrendingCreators(period: TrendingPeriod = '24h', limit: number = 20): Promise<{ creators: TrendingCreator[] }> {
  const supabase = createServerClient();
  const { data } = await supabase.rpc('get_trending_creators', { p_period: period, p_limit: limit });
  return {
    creators: ((data || []) as any[]).map((c: any) => ({
      id: c.id,
      userId: c.user_id,
      fullName: c.full_name || undefined,
      avatarUrl: c.avatar_url || undefined,
      isVerified: c.is_verified || false,
      followersGained: c.followers_gained || 0,
      totalEngagement: c.total_engagement || 0,
      watchTimeMinutes: c.watch_time_minutes || 0,
      videoCount: c.video_count || 0,
      storyCount: c.story_count || 0,
      streamMinutes: c.stream_minutes || 0,
      peakConcurrent: c.peak_concurrent || 0,
      growthVelocity: c.growth_velocity || 0,
      engagementScore: c.engagement_score || 0,
      rank: c.rank || 0,
      prevRank: c.prev_rank || undefined,
      computedAt: c.computed_at,
    })),
  };
}

export async function getExploreFeed(category: ExploreCategory = 'trending', page: number = 1, limit: number = 20): Promise<{ items: ExploreFeedItem[] }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { items: [] };

  const { data } = await supabase.rpc('get_explore_feed', {
    p_viewer_id: user.id,
    p_category: category,
    p_limit: limit,
    p_offset: (page - 1) * limit,
  });

  return {
    items: ((data || []) as any[]).map((i: any) => ({
      entityType: i.entity_type,
      entityId: i.entity_id,
      title: i.title,
      subtitle: i.subtitle || '',
      imageUrl: i.image_url || undefined,
      url: i.url,
      score: i.score || 0,
      creatorName: i.creator_name || undefined,
      creatorAvatar: i.creator_avatar || undefined,
    })),
  };
}
