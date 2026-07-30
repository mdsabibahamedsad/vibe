export type StreamStatus = 'scheduled' | 'starting' | 'live' | 'ending' | 'ended' | 'cancelled';
export type StreamCategory = 'just_chatting' | 'gaming' | 'music' | 'creative' | 'sports' | 'fitness' | 'food' | 'travel' | 'education' | 'dating_advice' | 'other';
export type StreamPrivacy = 'public' | 'followers' | 'subscribers';
export type GiftCurrency = 'stars' | 'coins';

export interface LiveSession {
  id: string;
  title: string;
  description?: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  category: StreamCategory;
  privacy: StreamPrivacy;
  status: StreamStatus;
  thumbnailUrl?: string;
  streamUrl?: string;
  playbackUrl?: string;
  language: string;
  slowModeSeconds: number;
  isModerationEnabled: boolean;
  isChatEnabled: boolean;
  currentParticipants: number;
  peakViewerCount: number;
  maxParticipants: number;
  totalGiftAmount: number;
  isRecording: boolean;
  isPremium: boolean;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
}

export interface StreamParticipant {
  id: string;
  sessionId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  role: string;
  status: string;
  isMuted: boolean;
  isMutedByHost: boolean;
  isModerator: boolean;
  giftAmount: number;
  joinedAt: string;
  durationSeconds: number;
}

export interface StreamChatMessage {
  id: string;
  sessionId: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  content: string;
  isReply: boolean;
  replyToId?: string;
  replyToContent?: string;
  isSystemMessage: boolean;
  isDeleted: boolean;
  isFlagged: boolean;
  createdAt: string;
}

export interface GiftCatalogItem {
  id: string;
  name: string;
  emoji: string;
  priceStars: number;
  priceCoins: number;
  animationUrl?: string;
  sortOrder: number;
}

export interface GiftTransaction {
  id: string;
  sessionId: string;
  senderId: string;
  receiverId: string;
  giftId: string;
  giftName?: string;
  giftEmoji?: string;
  quantity: number;
  totalPrice: number;
  currency: string;
  isVerified: boolean;
  createdAt: string;
}

export interface CreatorEarning {
  id: string;
  userId: string;
  sessionId?: string;
  amount: number;
  currency: string;
  type: 'gift' | 'subscription' | 'bonus' | 'withdrawal';
  status: 'pending' | 'available' | 'paid' | 'cancelled';
  createdAt: string;
}

export interface StreamModerator {
  id: string;
  sessionId: string;
  userId: string;
  userName?: string;
  canMute: boolean;
  canDelete: boolean;
  canRemove: boolean;
  canReport: boolean;
}

export interface StreamDiscoveryItem {
  id: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  title: string;
  category: string;
  status: string;
  thumbnailUrl?: string;
  viewerCount: number;
  language: string;
  isPremium: boolean;
  startedAt?: string;
  scheduledAt?: string;
}
