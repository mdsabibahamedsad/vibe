import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

interface ReportAnalysis {
  reportId: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  confidence: number;
  similarReports: string[];
  suggestedAction: string;
  reasoning: string;
}

interface ScamDetectionResult {
  isScam: boolean;
  confidence: number;
  scamType: 'romance' | 'giveaway' | 'financial' | 'phishing' | 'impersonation' | 'none';
  signals: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface SpamDetectionResult {
  isSpam: boolean;
  confidence: number;
  spamType: 'automated_message' | 'engagement_farm' | 'fake_follow' | 'fake_like' | 'comment_spam' | 'none';
  signals: string[];
}

interface FakeProfileResult {
  isFake: boolean;
  confidence: number;
  signals: string[];
  riskScore: number;
}

export class ModerationAIService {
  async analyzeReport(report: {
    id: string;
    type: string;
    content: string;
    reporterId: string;
    reportedUserId: string;
    createdAt: string;
  }): Promise<ReportAnalysis> {
    const similarReports = await this.findSimilarReports(report.reportedUserId, report.type);

    const priorityMap: Record<string, ReportAnalysis['priority']> = {
      harassment: 'high',
      hate_speech: 'high',
      violence: 'critical',
      self_harm: 'critical',
      illegal: 'critical',
      spam: 'low',
      misinformation: 'medium',
      copyright: 'medium',
      impersonation: 'high',
    };

    const category = this.categorizeReport(report.content);
    const priority = priorityMap[category] || 'medium';

    return {
      reportId: report.id,
      priority,
      category,
      confidence: 0.7,
      similarReports,
      suggestedAction: priority === 'critical' ? 'temporary_suspend' : priority === 'high' ? 'remove_content' : 'warn',
      reasoning: `Categorized as ${category} with ${priority} priority based on content analysis. ${similarReports.length > 0 ? `${similarReports.length} similar report(s) found.` : 'No similar reports.'}`,
    };
  }

  async detectScam(params: {
    messageContent?: string;
    profileBio?: string;
    senderAge?: number;
    accountAgeDays?: number;
    hasVerifiedPayment?: boolean;
    linkDomains?: string[];
  }): Promise<ScamDetectionResult> {
    const signals: string[] = [];
    let score = 0;

    if (params.messageContent) {
      const scamPatterns = [
        /\b(win|won|winner|prize|lucky|lottery)\b/i,
        /\b(invest|investment|guaranteed|profit|return)\b/i,
        /\b(urgent|immediately|limited time|act now)\b/i,
        /\b(bitcoin|crypto|wire|western union|money gram)\b/i,
        /\b(naked|sexy|hot|meet|date)\b.*\b(money|pay|send)\b/i,
        /\b(account|payment|verify)\b.*\b(click|link|login)\b/i,
      ];

      for (const pattern of scamPatterns) {
        if (pattern.test(params.messageContent)) {
          signals.push(`Scam pattern detected: ${pattern.source}`);
          score += 15;
        }
      }
    }

    if (params.linkDomains && params.linkDomains.length > 0) {
      const suspiciousDomains = params.linkDomains.filter(d =>
        !d.includes('.com') && !d.includes('.org') && d.includes('.') && d.length < 15
      );
      if (suspiciousDomains.length > 0) {
        signals.push(`Suspicious link domains: ${suspiciousDomains.join(', ')}`);
        score += 20;
      }
    }

    if (params.accountAgeDays !== undefined && params.accountAgeDays < 7) {
      score += 10;
      signals.push('Account less than 7 days old');
    }

    const isScam = score >= 40;
    const scamType = this.determineScamType(signals, params);

    return {
      isScam,
      confidence: Math.min(score / 100, 0.95),
      scamType,
      signals,
      severity: score >= 70 ? 'critical' : score >= 50 ? 'high' : score >= 30 ? 'medium' : 'low',
    };
  }

  async detectSpam(params: {
    messageContent?: string;
    senderId: string;
    recentMessageCount?: number;
    duplicateCount?: number;
    hasLinks?: boolean;
    messageFrequency?: number;
  }): Promise<SpamDetectionResult> {
    const signals: string[] = [];
    let score = 0;

    if (params.messageFrequency && params.messageFrequency > 10) {
      score += 25;
      signals.push(`High message frequency: ${params.messageFrequency}/min`);
    }

    if (params.duplicateCount && params.duplicateCount > 3) {
      score += 20;
      signals.push(`Duplicate messages: ${params.duplicateCount} copies`);
    }

    if (params.messageContent) {
      const spamPatterns = [
        /follow.*back/i, /like.*photo/i, /check.*profile/i,
        /buy.*follow/i, /promote.*channel/i, /subscribe.*youtube/i,
        /\b(free|cheap|discount)\b.*\b(click|link|now)\b/i,
        /(.)\1{5,}/,
      ];

      for (const pattern of spamPatterns) {
        if (pattern.test(params.messageContent)) {
          signals.push(`Spam pattern: ${pattern.source}`);
          score += 10;
        }
      }
    }

    const isSpam = score >= 30;

    return {
      isSpam,
      confidence: Math.min(score / 100, 0.9),
      spamType: isSpam ? this.determineSpamType(signals, params) : 'none',
      signals,
    };
  }

  async detectFakeProfile(params: {
    userId: string;
    fullName?: string;
    bio?: string;
    avatarUrl?: string;
    accountAgeDays: number;
    followerCount: number;
    followingCount: number;
    postCount: number;
    hasVerifiedBadge: boolean;
    reportCount: number;
    recentActivityCount: number;
  }): Promise<FakeProfileResult> {
    const signals: string[] = [];
    let score = 0;

    if (!params.bio || params.bio.length < 10) {
      score += 10;
      signals.push('Bio is empty or too short');
    }
    if (!params.fullName || params.fullName.length < 3) {
      score += 10;
      signals.push('Name is missing or too short');
    }
    if (!params.avatarUrl) {
      score += 10;
      signals.push('No avatar');
    }

    if (params.followerCount > 0 && params.followingCount > 0) {
      const ratio = params.followingCount / params.followerCount;
      if (ratio > 20) {
        score += 15;
        signals.push(`Suspicious follow/follower ratio: ${ratio.toFixed(1)}`);
      }
      if (ratio < 0.01 && params.followerCount > 100) {
        score += 15;
        signals.push('Suspiciously low following ratio — possible bot');
      }
    }

    if (params.accountAgeDays < 7 && params.recentActivityCount > 50) {
      score += 15;
      signals.push('New account with unusually high activity');
    }

    if (params.postCount === 0 && params.followingCount > 50) {
      score += 10;
      signals.push('No posts but following many users');
    }

    if (params.reportCount > 3) {
      score += 15;
      signals.push(`${params.reportCount} reports from other users`);
    }

    if (params.accountAgeDays < 1) {
      score += 5;
      signals.push('Account created less than 24 hours ago');
    }

    return {
      isFake: score >= 40,
      confidence: Math.min(score / 100, 0.95),
      signals,
      riskScore: Math.min(score, 100),
    };
  }

  private categorizeReport(content: string): string {
    const lower = content.toLowerCase();
    if (/(spam|scam|fake|bot)/i.test(lower)) return 'spam';
    if (/(hate|racist|sexist|discriminat)/i.test(lower)) return 'hate_speech';
    if (/(harass|bully|threat|intimidat)/i.test(lower)) return 'harassment';
    if (/(violen|attack|harm|kill|assault)/i.test(lower)) return 'violence';
    if (/(suicide|self.?harm|kill myself)/i.test(lower)) return 'self_harm';
    if (/(illegal|drug|weapon)/i.test(lower)) return 'illegal';
    if (/(copyright|infring|stolen)/i.test(lower)) return 'copyright';
    if (/(fake|impersonat|pretend)/i.test(lower)) return 'impersonation';
    if (/(misinform|false|lie|untrue)/i.test(lower)) return 'misinformation';
    return 'other';
  }

  private async findSimilarReports(reportedUserId: string, type: string): Promise<string[]> {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('moderation_reports')
      .select('id')
      .eq('reported_user_id', reportedUserId)
      .eq('type', type)
      .gte('created_at', new Date(Date.now() - 24 * 3600000).toISOString())
      .limit(10);

    return (data || []).map(d => d.id);
  }

  private determineScamType(signals: string[], params: any): ScamDetectionResult['scamType'] {
    if (signals.some(s => s.includes('romance') || s.includes('date') || s.includes('meet'))) return 'romance';
    if (signals.some(s => s.includes('win') || s.includes('prize') || s.includes('lottery'))) return 'giveaway';
    if (signals.some(s => s.includes('invest') || s.includes('crypto') || s.includes('money'))) return 'financial';
    if (signals.some(s => s.includes('click') || s.includes('login') || s.includes('verify'))) return 'phishing';
    return 'impersonation';
  }

  private determineSpamType(signals: string[], params: any): SpamDetectionResult['spamType'] {
    if (signals.some(s => s.includes('frequency'))) return 'automated_message';
    if (signals.some(s => s.includes('duplicate'))) return 'comment_spam';
    if (params.hasLinks) return 'automated_message';
    return 'comment_spam';
  }
}

export const moderationAI = new ModerationAIService();
