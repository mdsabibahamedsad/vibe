export type EntityType = 'user' | 'post' | 'video' | 'story' | 'live_stream' | 'hashtag' | 'search';
export type TrendingPeriod = '1h' | '6h' | '24h' | '3d' | '7d';
export type ExploreCategory = 'trending' | 'new' | 'videos' | 'photos' | 'stories' | 'live' | 'for_you';

export interface SearchResult {
  entityType: EntityType;
  entityId: string;
  title: string;
  subtitle: string;
  description: string;
  imageUrl?: string;
  url: string;
  relevanceScore: number;
  engagementCount: number;
  isVerified: boolean;
  isLive: boolean;
  createdAt: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  limit: number;
  query: string;
}

export interface SearchSuggestion {
  suggestion: string;
  entityType: EntityType;
  entityId?: string;
  popularity: number;
  isTrending: boolean;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  entityType?: EntityType;
  entityId?: string;
  clicked: boolean;
  createdAt: string;
}

export interface TrendingHashtag {
  id: string;
  hashtag: string;
  displayName?: string;
  postCount: number;
  videoCount: number;
  storyCount: number;
  totalMentions: number;
  uniqueCreators: number;
  growthVelocity: number;
  engagementScore: number;
  rank: number;
  lastTrending: boolean;
  computedAt: string;
}

export interface TrendingCreator {
  id: string;
  userId: string;
  fullName?: string;
  avatarUrl?: string;
  isVerified?: boolean;
  followersGained: number;
  totalEngagement: number;
  watchTimeMinutes: number;
  videoCount: number;
  storyCount: number;
  streamMinutes: number;
  peakConcurrent: number;
  growthVelocity: number;
  engagementScore: number;
  rank: number;
  prevRank?: number;
  computedAt: string;
}

export interface TrendingVideo {
  id: string;
  videoId: string;
  caption?: string;
  thumbnailUrl?: string;
  creatorName?: string;
  creatorAvatar?: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  completionRate: number;
  growthVelocity: number;
  engagementScore: number;
  rank: number;
  computedAt: string;
}

export interface ExploreFeedItem {
  entityType: EntityType;
  entityId: string;
  title: string;
  subtitle: string;
  imageUrl?: string;
  url: string;
  score: number;
  creatorName?: string;
  creatorAvatar?: string;
}

export interface SearchFilters {
  entityTypes?: EntityType[];
  verifiedOnly?: boolean;
  language?: string;
  minAge?: number;
  maxAge?: number;
}
