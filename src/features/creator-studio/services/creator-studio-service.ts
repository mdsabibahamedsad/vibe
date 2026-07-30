import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { logger } from '@/lib/logger';
import type {
  CreatorDashboard, CreatorAnalytics, AudienceInsight, ContentItem, ContentDraft,
  ContentSchedule, CreatorCampaign, CreatorPayout, EarningsLedgerEntry,
  MonetizationEligibility, RevenueReport, CreatorNotification,
} from '../types';

export async function getCreatorDashboard(): Promise<{ dashboard?: CreatorDashboard; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const { data, error } = await supabase.rpc('get_creator_dashboard', { p_user_id: user.id });
  if (error || !data) return { error: 'Failed to load dashboard' };

  const row = (data as any[])[0];
  return {
    dashboard: {
      totalFollowers: row?.total_followers || 0,
      newFollowers24h: row?.new_followers_24h || 0,
      totalViews: row?.total_views || 0,
      videoViews24h: row?.video_views_24h || 0,
      storyViews24h: row?.story_views_24h || 0,
      liveViewersCurrent: row?.live_viewers_current || 0,
      totalRevenueStars: row?.total_revenue_stars || 0,
      revenue24hStars: row?.revenue_24h_stars || 0,
      activeCampaigns: row?.active_campaigns || 0,
      pendingPayouts: row?.pending_payouts || 0,
      unreadNotifications: row?.unread_notifications || 0,
      contentCount: row?.content_count || 0,
      draftCount: row?.draft_count || 0,
      scheduledCount: row?.scheduled_count || 0,
    },
  };
}

export async function getCreatorAnalytics(
  period: string = 'daily',
  startDate?: string,
  endDate?: string
): Promise<{ analytics: CreatorAnalytics[]; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { analytics: [], error: 'Unauthorized' };

  let query = supabase
    .from('creator_analytics_cache')
    .select('*')
    .eq('user_id', user.id)
    .eq('period', period)
    .order('period_start', { ascending: false })
    .limit(30);

  if (startDate && endDate) {
    query = query.gte('period_start', startDate).lte('period_end', endDate);
  }

  const { data, error } = await query;
  if (error) return { analytics: [], error: 'Failed to load analytics' };

  return {
    analytics: (data || []).map((a: any) => ({
      totalFollowers: a.total_followers || 0,
      newFollowers: a.new_followers || 0,
      totalViews: a.total_views || 0,
      videoViews: a.video_views || 0,
      storyViews: a.story_views || 0,
      liveViewers: a.live_viewers || 0,
      watchTimeMinutes: a.watch_time_minutes || 0,
      avgCompletionPct: a.avg_completion_pct || 0,
      totalLikes: a.total_likes || 0,
      totalComments: a.total_comments || 0,
      totalShares: a.total_shares || 0,
      totalSaves: a.total_saves || 0,
      engagementRate: a.engagement_rate || 0,
      exploreViews: a.explore_views || 0,
      searchViews: a.search_views || 0,
      followingViews: a.following_views || 0,
      sharesViews: a.shares_views || 0,
      profileViews: a.profile_views || 0,
      totalRevenueStars: a.total_revenue_stars || 0,
      liveGiftRevenue: a.live_gift_revenue || 0,
      adRevenue: a.ad_revenue || 0,
      campaignRevenue: a.campaign_revenue || 0,
      periodStart: a.period_start,
      periodEnd: a.period_end,
      computedAt: a.computed_at,
    })),
  };
}

export async function getAudienceInsights(): Promise<{ insights: AudienceInsight[]; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { insights: [], error: 'Unauthorized' };

  const { data, error } = await supabase.rpc('get_audience_insights', { p_user_id: user.id });
  if (error) return { insights: [], error: 'Failed to load audience insights' };

  return { insights: (data || []) as AudienceInsight[] };
}

export async function getContentList(
  contentType?: string,
  page: number = 1,
  limit: number = 20
): Promise<{ content: ContentItem[]; total?: number; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { content: [], error: 'Unauthorized' };

  let query = supabase
    .from('creator_content')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (contentType) {
    query = query.eq('content_type', contentType);
  }

  const { data, error, count } = await query;
  if (error) return { content: [], error: 'Failed to load content list' };

  return {
    content: (data || []).map((c: any) => ({
      id: c.id,
      contentType: c.content_type,
      title: c.title,
      caption: c.caption,
      thumbnailUrl: c.thumbnail_url || undefined,
      viewCount: c.view_count || 0,
      likeCount: c.like_count || 0,
      commentCount: c.comment_count || 0,
      shareCount: c.share_count || 0,
      saveCount: c.save_count || 0,
      revenueGenerated: c.revenue_generated || 0,
      createdAt: c.created_at,
    })),
    total: count || 0,
  };
}

export async function getDrafts(): Promise<{ drafts: ContentDraft[]; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { drafts: [], error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('content_drafts')
    .select('*')
    .eq('user_id', user.id)
    .in('status', ['draft', 'scheduled'])
    .order('updated_at', { ascending: false });

  if (error) return { drafts: [], error: 'Failed to load drafts' };

  return {
    drafts: (data || []).map((d: any) => ({
      id: d.id,
      contentType: d.content_type,
      title: d.title,
      caption: d.caption,
      mediaUrl: d.media_url || undefined,
      thumbnailUrl: d.thumbnail_url || undefined,
      hashtags: d.hashtags || [],
      isScheduled: d.status === 'scheduled',
      scheduledAt: d.scheduled_at,
      status: d.status,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    })),
  };
}

export async function saveDraft(data: {
  contentType: string;
  title?: string;
  caption?: string;
  mediaUrl?: string;
  hashtags?: string[];
  scheduledAt?: string;
}): Promise<{ id?: string; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const status = data.scheduledAt ? 'scheduled' : 'draft';

  const { data: draft, error } = await supabase
    .from('content_drafts')
    .upsert({
      user_id: user.id,
      content_type: data.contentType,
      title: data.title || null,
      caption: data.caption || null,
      media_url: data.mediaUrl || null,
      hashtags: data.hashtags || [],
      status,
      scheduled_at: data.scheduledAt || null,
    })
    .select('id')
    .single();

  if (error) return { error: 'Failed to save draft' };
  return { id: draft.id };
}

export async function deleteDraft(draftId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase
    .from('content_drafts')
    .update({ status: 'archived' })
    .eq('id', draftId)
    .eq('user_id', user.id);

  if (error) return { success: false, error: 'Failed to delete draft' };
  return { success: true };
}

export async function getCampaigns(): Promise<{ campaigns: CreatorCampaign[]; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { campaigns: [], error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('creator_campaigns')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return { campaigns: [], error: 'Failed to load campaigns' };

  return {
    campaigns: (data || []).map((c: any) => ({
      id: c.id,
      title: c.title,
      description: c.description || undefined,
      brandName: c.brand_name || undefined,
      brandLogoUrl: c.brand_logo_url || undefined,
      contentType: c.content_type || undefined,
      budgetStars: c.budget_stars || 0,
      platformFeePct: c.platform_fee_pct || 20,
      creatorEarnings: c.creator_earnings || 0,
      status: c.status,
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      impressions: c.impressions || 0,
      clicks: c.clicks || 0,
      conversions: c.conversions || 0,
      createdAt: c.created_at,
    })),
  };
}

export async function getEarningsLedger(
  limit: number = 50,
  offset: number = 0
): Promise<{ entries: EarningsLedgerEntry[]; total?: number; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { entries: [], error: 'Unauthorized' };

  const { data, error, count } = await supabase
    .from('creator_earnings_ledger')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return { entries: [], error: 'Failed to load earnings' };

  return {
    entries: (data || []).map((e: any) => ({
      id: e.id,
      source: e.source,
      grossAmount: e.gross_amount,
      platformFee: e.platform_fee || 0,
      netAmount: e.net_amount,
      currency: e.currency || 'XTR',
      status: e.status,
      description: e.description || undefined,
      createdAt: e.created_at,
    })),
    total: count || 0,
  };
}

export async function requestPayout(amountStars: number): Promise<{ payout?: CreatorPayout; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  if (amountStars < 100) return { error: 'Minimum payout is 100 Stars' };

  const { data, error } = await supabase.rpc('request_creator_payout', {
    p_user_id: user.id,
    p_amount_stars: amountStars,
  });

  if (error) return { error: 'Failed to request payout' };

  return {
    payout: {
      id: data.id,
      amountStars: data.amount_stars,
      amountFiat: data.amount_fiat || 0,
      currency: data.currency || 'XTR',
      source: 'gift',
      status: data.status || 'pending',
      feeAmount: data.fee_amount || 0,
      netAmount: data.net_amount || 0,
      requestedAt: data.requested_at || new Date().toISOString(),
    },
  };
}

export async function getMonetizationEligibility(): Promise<{ eligibility?: MonetizationEligibility; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const { data, error } = await supabase.rpc('check_monetization_eligibility', { p_user_id: user.id });
  if (error) return { error: 'Failed to check eligibility' };

  return { eligibility: data as MonetizationEligibility };
}

export async function getRevenueReport(
  period: string = 'monthly',
  year: number = new Date().getFullYear(),
  month?: number
): Promise<{ report?: RevenueReport; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const { data, error } = await supabase.rpc('get_revenue_report', {
    p_user_id: user.id,
    p_period: period,
    p_year: year,
    p_month: month || null,
  });

  if (error) return { error: 'Failed to load revenue report' };
  return { report: data as RevenueReport };
}

export async function getNotifications(): Promise<{ notifications: CreatorNotification[]; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { notifications: [], error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('creator_notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return { notifications: [], error: 'Failed to load notifications' };

  return {
    notifications: (data || []).map((n: any) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body || undefined,
      link: n.link || undefined,
      isRead: n.is_read,
      createdAt: n.created_at,
    })),
  };
}
