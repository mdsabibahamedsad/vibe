export type CreatorContentType = 'video' | 'photo' | 'story' | 'live_recording';
export type CampaignStatus = 'draft' | 'pending' | 'active' | 'paused' | 'completed' | 'cancelled';
export type PayoutStatus = 'pending' | 'approved' | 'paid' | 'failed';
export type ScheduleStatus = 'scheduled' | 'published' | 'failed';
export type MonetizationStatus = 'ineligible' | 'eligible' | 'enabled' | 'restricted';
export type EarningsSource = 'gift' | 'ad_revenue' | 'campaign' | 'subscription' | 'bonus';

export interface CreatorDashboard {
  totalFollowers: number;
  newFollowers24h: number;
  totalViews: number;
  videoViews24h: number;
  storyViews24h: number;
  liveViewersCurrent: number;
  totalRevenueStars: number;
  revenue24hStars: number;
  activeCampaigns: number;
  pendingPayouts: number;
  unreadNotifications: number;
  contentCount: number;
  draftCount: number;
  scheduledCount: number;
}

export interface CreatorAnalytics {
  totalFollowers: number;
  newFollowers: number;
  totalViews: number;
  videoViews: number;
  storyViews: number;
  liveViewers: number;
  watchTimeMinutes: number;
  avgCompletionPct: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  engagementRate: number;
  exploreViews: number;
  searchViews: number;
  followingViews: number;
  sharesViews: number;
  profileViews: number;
  totalRevenueStars: number;
  liveGiftRevenue: number;
  adRevenue: number;
  campaignRevenue: number;
  periodStart: string;
  periodEnd: string;
  computedAt: string;
}

export interface AudienceInsight {
  type: string;
  data: { label: string; value: number; percentage: number }[];
}

export interface ContentItem {
  id: string;
  contentType: CreatorContentType;
  title?: string;
  caption?: string;
  thumbnailUrl?: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  revenueGenerated?: number;
  createdAt: string;
}

export interface ContentDraft {
  id: string;
  contentType: CreatorContentType;
  title?: string;
  caption?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  hashtags: string[];
  isScheduled: boolean;
  scheduledAt?: string;
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface ContentSchedule {
  id: string;
  contentType: CreatorContentType;
  caption?: string;
  mediaUrl?: string;
  hashtags: string[];
  scheduledAt: string;
  publishedAt?: string;
  status: ScheduleStatus;
}

export interface CreatorCampaign {
  id: string;
  title: string;
  description?: string;
  brandName?: string;
  brandLogoUrl?: string;
  contentType?: CreatorContentType;
  budgetStars: number;
  platformFeePct: number;
  creatorEarnings: number;
  status: CampaignStatus;
  startsAt?: string;
  endsAt?: string;
  impressions: number;
  clicks: number;
  conversions: number;
  createdAt: string;
}

export interface CreatorPayout {
  id: string;
  amountStars: number;
  amountFiat: number;
  currency: string;
  source: EarningsSource;
  status: PayoutStatus;
  feeAmount: number;
  netAmount: number;
  requestedAt: string;
  approvedAt?: string;
  paidAt?: string;
}

export interface EarningsLedgerEntry {
  id: string;
  source: EarningsSource;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  currency: string;
  status: 'pending' | 'available' | 'paid' | 'cancelled';
  description?: string;
  createdAt: string;
}

export interface MonetizationEligibility {
  isEligible: boolean;
  requirements: Record<string, any>;
  accountStanding: string;
  isVerified: boolean;
  trustLevel: string;
  followerCount: number;
  totalWatchHours: number;
  reasons: string[];
}

export interface RevenueReport {
  period: string;
  grossRevenue: number;
  platformFees: number;
  netRevenue: number;
  bySource: { source: string; amount: number; percentage: number }[];
  byDay: { date: string; amount: number }[];
}

export interface CreatorNotification {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}
