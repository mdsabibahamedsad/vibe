export type VideoStatus = 'processing' | 'published' | 'failed' | 'removed';
export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'flagged';
export type FeedType = 'for_you' | 'following' | 'trending' | 'new';

export interface ShortVideo {
  id: string;
  creatorId: string;
  caption: string;
  videoUrl: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  durationSeconds: number;
  width: number;
  height: number;
  fileSize: number;
  mimeType: string;
  codec?: string;
  status: VideoStatus;
  hashtags: string[];
  mentions: string[];
  musicTrack?: string;
  moderationStatus: ModerationStatus;
  moderationNote?: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  isPremiumOnly: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShortVideoWithCreator extends ShortVideo {
  creatorName: string;
  creatorAvatar?: string;
  creatorVerified: boolean;
  isLiked: boolean;
  isSaved: boolean;
  isFollowing: boolean;
}

export interface VideoFeedResponse {
  videos: ShortVideoWithCreator[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface VideoWatchHistory {
  id: string;
  userId: string;
  videoId: string;
  watchDurationMs: number;
  completionPct: number;
  isCompleted: boolean;
  replayCount: number;
  watchedAt: string;
}

export interface VideoSave {
  id: string;
  userId: string;
  videoId: string;
  createdAt: string;
}

export interface VideoUploadResponse {
  id: string;
  videoUrl: string;
  thumbnailUrl?: string;
  error?: string;
}

export interface VideoEngagementCounts {
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
}

export interface HashtagTrend {
  hashtag: string;
  videoCount: number;
  totalViews: number;
}
