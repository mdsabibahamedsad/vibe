import { logger } from '@/lib/logger';

interface FeedItem {
  id: string;
  type: 'post' | 'video' | 'story' | 'live';
  creatorId: string;
  createdAt: string;
  engagementScore: number;
}

interface UserSignals {
  userId: string;
  recentLikes: string[];
  recentShares: string[];
  recentSaves: string[];
  recentComments: string[];
  followedCreators: string[];
  watchedCategories: string[];
  interactedCreators: string[];
  language: string;
  activeHours: number[];
  matchPreferences?: Record<string, unknown>;
}

interface RankedFeedItem extends FeedItem {
  score: number;
  reasons: string[];
}

const SIGNAL_WEIGHTS = {
  watchHistory: 0.20,
  likeHistory: 0.15,
  shareHistory: 0.10,
  saveHistory: 0.10,
  followGraph: 0.15,
  recency: 0.10,
  recencyDecay: 0.05,
  creativity: 0.10,
  discovery: 0.05,
};

export class FeedRankingEngine {
  async rankFeed(
    items: FeedItem[],
    userSignals: UserSignals,
    options: {
      useAI?: boolean;
      diversityFactor?: number;
      limit?: number;
    } = {}
  ): Promise<RankedFeedItem[]> {
    const startTime = Date.now();
    const diversityFactor = options.diversityFactor ?? 0.3;
    const limit = options.limit ?? 50;

    let ranked = items.map(item => {
      const signals: Record<string, number> = {};
      const reasons: string[] = [];

      signals.watchHistory = Math.min(item.engagementScore, 100);

      signals.followGraph = userSignals.followedCreators.includes(item.creatorId) ? 100 : 0;
      if (signals.followGraph > 0) reasons.push('Creator you follow');

      signals.interacted = userSignals.interactedCreators.includes(item.creatorId) ? 80 : 0;
      if (signals.interacted > 0) reasons.push('Creator you interact with');

      const ageHours = (Date.now() - new Date(item.createdAt).getTime()) / 3600000;
      signals.recency = Math.max(0, 100 - ageHours * 2);
      if (signals.recency > 80) reasons.push('Recent content');

      signals.recencyDecay = ageHours < 1 ? 100 : 0;
      if (signals.recencyDecay > 0) reasons.push('Just posted');

      const score = Object.entries(SIGNAL_WEIGHTS).reduce(
        (sum, [key, weight]) => sum + (signals[key] || 0) * weight,
        0
      );

      return { ...item, score, reasons };
    });

    const creatorCounts = new Map<string, number>();
    for (const item of ranked) {
      creatorCounts.set(item.creatorId, (creatorCounts.get(item.creatorId) || 0) + 1);
    }

    ranked = ranked.map(item => {
      const count = creatorCounts.get(item.creatorId) || 1;
      const penalty = Math.min((count - 1) * diversityFactor * 10, 30);
      if (penalty > 0) {
        item.score -= penalty;
        item.reasons.push('Diversity adjustment');
      }
      return item;
    });

    ranked.sort((a, b) => b.score - a.score);

    logger.perf('feed.ranking', Date.now() - startTime, { itemCount: items.length, useAI: !!options.useAI });
    return ranked.slice(0, limit);
  }
}

export const feedRankingEngine = new FeedRankingEngine();
