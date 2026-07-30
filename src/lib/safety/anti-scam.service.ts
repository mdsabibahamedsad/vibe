/**
 * Anti-Scam Service
 *
 * Detects patterns commonly associated with romance scams, financial fraud,
 * impersonation, and phishing. Uses behavioral signals carefully — never
 * automatically accuses users solely based on keyword matches.
 *
 * All detection results generate safety signals for review.
 * Human review remains available for serious enforcement decisions.
 *
 * Integrates with:
 *   - Moderation AI for classification
 *   - Trust profile for signal recording
 *   - Report system for escalation
 *   - Chat safety warnings for user education
 *   - Payment/fraud systems
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { recordSafetySignal } from "./trust-profile.service";

export type ScamCategory =
  | "romance_scam"
  | "financial_fraud"
  | "investment_scam"
  | "giveaway_scam"
  | "phishing"
  | "impersonation"
  | "account_recovery"
  | "loan_scam"
  | "gift_scam"
  | "emergency_scam"
  | "crypto_scam"
  | "none";

export interface ScamDetectionResult {
  isSuspicious: boolean;
  confidence: number;
  category: ScamCategory;
  signals: string[];
  severity: "low" | "medium" | "high" | "critical";
  shouldWarn: boolean;
  warningType?: string;
}

export interface LinkSafetyResult {
  isSuspicious: boolean;
  confidence: number;
  threatType: "phishing" | "malware" | "spam" | "scam" | "safe" | "unknown";
  domain: string;
  signals: string[];
}

// ─── Suspicious Domain Lists ──────────────────────────────────────────────

// Common known-safe domains (abbreviated — in production, use a allowlist API)
const SAFE_DOMAINS = new Set([
  "telegram.org",
  "t.me",
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "github.com",
  "google.com",
  "gmail.com",
]);

const SUSPICIOUS_TLDS = new Set([
  ".tk",
  ".ml",
  ".ga",
  ".cf",
  ".gq",
  ".xyz",
  ".top",
  ".club",
  ".work",
  ".date",
  ".men",
  ".loan",
  ".download",
  ".review",
  ".win",
  ".bid",
]);

// ─── Romance Scam Signals ─────────────────────────────────────────────────

const ROMANCE_SCAM_PATTERNS = [
  // Rapid emotional escalation
  /\b(soulmate|love at first sight|destiny|fate brought us|meant to be)\b/i,
  /\b(I love you|I need you|you are my everything)\b.*\b(first|just met|only known)\b/i,
  // Moving off-platform
  /\b(WhatsApp|telegram|signal|wechat|kik|snapchat)\b.*\b(add|message|chat|text|contact)\b/i,
  /\b(can't talk here|better on|more private|delete this app)\b/i,
  // Financial requests
  /\b(send me|need your help|money for|financial assistance|just need)\b.*\b(money|funds|dollars|euros|payment)\b/i,
  /\b(wire|western union|money gram|cash app|venmo|paypal)\b/i,
  // Investment/crypto
  /\b(invest|investment opportunity|guaranteed return|double your|risk free)\b/i,
  /\b(bitcoin|crypto|ethereum|btc|eth|mining)\b.*\b(invest|profit|return|send|deposit)\b/i,
  // Gift pressure
  /\b(gift card|iTunes card|google play|steam wallet)\b.*\b(send|buy|purchase)\b/i,
  /\b(send me a gift|buy me a|treat me|spoil me)\b/i,
  // Repeated financial emergencies
  /\b(emergency|hospital|medical bill|surgery|accident)\b.*\b(money|help|pay|funds|send)\b/i,
  /\b(my card was|my bank|i lost my wallet|i need help)\b.*\b(can you|please|money|send)\b/i,
  // Copy-paste detection — messages that are repeated verbatim
  // This is checked server-side by counting identical messages from sender
  // The regex here detects rapid repetition of the same short phrase
  /(.{10,100})\1{2,}/, // Captures a group of 10-100 chars repeated 3+ times
];

// ─── Financial Scam Patterns ──────────────────────────────────────────────

const FINANCIAL_SCAM_PATTERNS = [
  // Investment promises
  /\b(guaranteed profit|100% return|no risk investment|get rich quick|passive income)\b/i,
  /\b(sign up bonus|referral bonus|earn money fast|work from home|make money)\b.*\b(deposit|invest|pay|fee)\b/i,
  // Fake giveaways
  /\b(congratulations|you won|winner|you are the lucky|selected winner)\b/i,
  /\b(claim your prize|click to claim|enter code|limited offer|act now)\b/i,
  // Loan scams
  /\b(instant loan|no credit check|guaranteed approval|low interest loan|payday loan)\b/i,
  /\b(advance fee|processing fee|insurance fee|verification fee)\b.*\b(loan|credit|approval)\b/i,
  // Phishing
  /\b(verify account|confirm login|account suspended|security alert|unauthorized access)\b/i,
  /\b(click here|login now|update payment|verify identity|confirm details)\b.*\b(link|url|http)\b/i,
  // Account recovery
  /\b(send me your password|recovery code|verification code|login details|your pin)\b/i,
  /\b(I lost my account|can you help me recover|need your verification)\b/i,
];

// ─── Impersonation Signals ────────────────────────────────────────────────

const IMPERSONATION_SIGNALS = [
  /\b(official|admin|support|moderator|staff|team|owner)\b.*\b(account|profile|page)\b/i,
  /\b(verified|blue check|official badge)\b.*\b(give|send|pay|click|link)\b/i,
  /\b(I am (the )?(CEO|founder|owner|manager|director|representative))\b/i,
];

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Analyze message content for scam patterns.
 * Called server-side when processing messages.
 * Returns a detection result with signals and confidence.
 * Does NOT automatically restrict — generates signals for review.
 */
export async function detectScamInMessage(params: {
  messageContent: string;
  senderId: string;
  recipientId?: string;
  accountAgeDays?: number;
  matchAgeDays?: number;
  isFirstMessage?: boolean;
  links?: string[];
  senderVerificationLevel?: string;
}): Promise<ScamDetectionResult> {
  const signals: string[] = [];
  let score = 0;
  const content = params.messageContent;

  // ─── Romance scam patterns ────────────────────────────────────────────

  for (const pattern of ROMANCE_SCAM_PATTERNS) {
    if (pattern.test(content)) {
      const match = content.match(pattern);
      signals.push(`Romance scam pattern: "${match?.[0]?.substring(0, 60) ?? pattern.source}"`);
      score += 15;
    }
  }

  // ─── Financial scam patterns ──────────────────────────────────────────

  for (const pattern of FINANCIAL_SCAM_PATTERNS) {
    if (pattern.test(content)) {
      const match = content.match(pattern);
      signals.push(`Financial scam pattern: "${match?.[0]?.substring(0, 60) ?? pattern.source}"`);
      score += 20;
    }
  }

  // ─── Impersonation signals ────────────────────────────────────────────

  for (const pattern of IMPERSONATION_SIGNALS) {
    if (pattern.test(content)) {
      const match = content.match(pattern);
      signals.push(`Impersonation signal: "${match?.[0]?.substring(0, 60) ?? pattern.source}"`);
      score += 20;
    }
  }

  // ─── Contextual signals ──────────────────────────────────────────────

  // New account + financial request
  if (params.accountAgeDays !== undefined && params.accountAgeDays < 7 && score > 20) {
    signals.push("New account (<7 days) with financial/romance signals");
    score += 15;
  }

  // First message + high score
  if (params.isFirstMessage && score > 20) {
    signals.push("First message contains high-risk patterns");
    score += 10;
  }

  // Very new match (less than 1 day) + scam patterns
  if (params.matchAgeDays !== undefined && params.matchAgeDays < 1 && score > 15) {
    signals.push("Match less than 1 day old with suspicious patterns");
    score += 10;
  }

  // Unverified user + financial request
  if (
    params.senderVerificationLevel === "unverified" &&
    score > 15
  ) {
    signals.push("Unverified user with suspicious patterns");
    score += 5;
  }

  // ─── Link analysis ────────────────────────────────────────────────────

  if (params.links && params.links.length > 0) {
    for (const link of params.links) {
      const linkResult = analyzeLinkSafety(link);
      if (linkResult.isSuspicious) {
        signals.push(`Suspicious link: ${linkResult.domain} (${linkResult.threatType})`);
        score += linkResult.threatType === "phishing" ? 25 : 15;
      }
    }
  }

  // ─── Determine category and severity ──────────────────────────────────

  const category = determineCategory(signals, score);
  const isSuspicious = score >= 30;
  const severity: ScamDetectionResult["severity"] =
    score >= 70 ? "critical" : score >= 50 ? "high" : score >= 30 ? "medium" : "low";

  // ─── Record signal if suspicious ──────────────────────────────────────

  if (isSuspicious) {
    try {
      await recordSafetySignal({
        userId: params.senderId,
        signalType: determineSignalType(category),
        source: "ai_analysis",
        confidence: Math.min(score / 100, 0.95),
        severity,
        metadata: {
          messagePreview: content.substring(0, 200),
          signalCount: signals.length,
          category,
          recipientId: params.recipientId,
        },
      });
    } catch (err) {
      logger.warn("Failed to record scam signal", { error: String(err) });
    }
  }

  // Determine if a warning should be shown to the recipient
  const shouldWarn = isSuspicious && (category !== "none");

  return {
    isSuspicious,
    confidence: Math.min(score / 100, 0.95),
    category,
    signals,
    severity,
    shouldWarn,
    warningType: shouldWarn ? getWarningType(category) : undefined,
  };
}

// ─── Link Safety ──────────────────────────────────────────────────────────

/**
 * Analyze a URL for safety signals.
 * Never fetches URLs from privileged networks (SSRF protection).
 */
export function analyzeLinkSafety(url: string): LinkSafetyResult {
  const signals: string[] = [];

  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.toLowerCase();
    const tld = "." + domain.split(".").pop();

    // Check safe domains
    if (SAFE_DOMAINS.has(domain) || SAFE_DOMAINS.has(domain.replace(/^www\./, ""))) {
      return {
        isSuspicious: false,
        confidence: 0,
        threatType: "safe",
        domain,
        signals: [],
      };
    }

    // Check suspicious TLDs
    if (SUSPICIOUS_TLDS.has(tld)) {
      signals.push(`Suspicious TLD: ${tld}`);
    }

    // Check for IP address instead of domain
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain)) {
      signals.push("IP address used instead of domain name");
    }

    // Check for misleading subdomains
    const subdomainParts = domain.split(".");
    if (subdomainParts.length > 3) {
      signals.push("Excessive subdomain nesting — possible phishing");
    }

    // Check for common phishing keywords in subdomain/path
    const phishingKeywords = [
      "login",
      "signin",
      "verify",
      "secure",
      "account",
      "update",
      "confirm",
      "authenticate",
      "security",
      "password-reset",
      "recover",
      "wallet",
      "paypal",
      "appleid",
      "banking",
    ];

    const fullUrl = url.toLowerCase();
    for (const keyword of phishingKeywords) {
      if (fullUrl.includes(keyword)) {
        signals.push(`Phishing keyword in URL: "${keyword}"`);
      }
    }

    // Check for unusual port
    if (parsed.port && !["80", "443"].includes(parsed.port)) {
      signals.push(`Unusual port: ${parsed.port}`);
    }

    // Check for URL shorteners (often used to hide destination)
    const shorteners = [
      "bit.ly",
      "tinyurl.com",
      "tiny.cc",
      "goo.gl",
      "t.co",
      "ow.ly",
      "is.gd",
      "buff.ly",
      "rebrand.ly",
      "shorturl.at",
      "cutt.ly",
    ];

    if (shorteners.includes(domain) || shorteners.some((s) => domain.endsWith("." + s))) {
      signals.push("URL shortener — destination hidden");
    }

    // Determine if suspicious
    const score = signals.length * 20;
    const isSuspicious = score >= 30;

    let threatType: LinkSafetyResult["threatType"] = "unknown";
    if (isSuspicious) {
      if (signals.some((s) => s.includes("phishing"))) threatType = "phishing";
      else if (signals.some((s) => s.includes("shortener"))) threatType = "spam";
      else threatType = "scam";
    } else {
      threatType = "safe";
    }

    return {
      isSuspicious,
      confidence: Math.min(score / 100, 0.9),
      threatType,
      domain,
      signals,
    };
  } catch {
    // Invalid URL
    return {
      isSuspicious: false,
      confidence: 0,
      threatType: "unknown",
      domain: url,
      signals: ["Invalid URL format"],
    };
  }
}

// ─── Duplicate Profile Detection ──────────────────────────────────────────

export interface DuplicateProfileSignal {
  userId: string;
  similarUserId: string;
  similarityScore: number;
  matchingFields: string[];
}

/**
 * Check for potential duplicate/similar profiles.
 * Compares key fields like bio, name, avatar.
 */
export async function detectDuplicateProfiles(userId: string): Promise<DuplicateProfileSignal[]> {
  const adminClient = createAdminClient();
  const results: DuplicateProfileSignal[] = [];

  // Get current user's profile
  const { data: userProfile } = await adminClient
    .from("profiles")
    .select("bio, user_id")
    .eq("user_id", userId)
    .single();

  if (!userProfile?.bio) return [];

  // Find profiles with similar bios
  const bioHash = simpleHash(userProfile.bio);
  const { data: similarProfiles } = await adminClient
    .from("profiles")
    .select("user_id, bio")
    .neq("user_id", userId)
    .limit(20); // Limit to prevent heavy queries

  if (!similarProfiles) return [];

  for (const other of similarProfiles) {
    if (!other.bio) continue;

    const otherHash = simpleHash(other.bio);
    const similarity = computeSimilarity(userProfile.bio, other.bio);

    if (similarity > 0.7) {
      results.push({
        userId,
        similarUserId: other.user_id,
        similarityScore: similarity,
        matchingFields: similarity > 0.9 ? ["bio"] : [],
      });
    }
  }

  return results;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function determineCategory(signals: string[], score: number): ScamCategory {
  const signalStr = signals.join(" ").toLowerCase();

  if (signalStr.includes("romance")) return "romance_scam";
  if (signalStr.includes("financial") || signalStr.includes("money")) return "financial_fraud";
  if (signalStr.includes("invest") || signalStr.includes("crypto")) return "investment_scam";
  if (signalStr.includes("giveaway") || signalStr.includes("prize")) return "giveaway_scam";
  if (signalStr.includes("phishing")) return "phishing";
  if (signalStr.includes("impersonation")) return "impersonation";
  if (signalStr.includes("recovery")) return "account_recovery";
  if (signalStr.includes("loan")) return "loan_scam";
  if (signalStr.includes("gift")) return "gift_scam";

  if (score >= 50) return "financial_fraud";
  if (score >= 30) return "romance_scam";
  return "none";
}

function determineSignalType(category: ScamCategory): string {
  switch (category) {
    case "romance_scam":
      return "romance_scam_pattern";
    case "financial_fraud":
    case "investment_scam":
    case "crypto_scam":
    case "loan_scam":
    case "gift_scam":
    case "emergency_scam":
      return "financial_scam_pattern";
    case "phishing":
      return "phishing_link";
    case "impersonation":
      return "impersonation";
    case "giveaway_scam":
    case "account_recovery":
      return "suspicious_message";
    default:
      return "suspicious_message";
  }
}

function getWarningType(category: ScamCategory): string {
  switch (category) {
    case "romance_scam":
      return "romance_scam_reminder";
    case "financial_fraud":
    case "investment_scam":
    case "crypto_scam":
      return "investment_warning";
    case "phishing":
      return "phishing_warning";
    case "impersonation":
      return "impersonation_warning";
    case "giveaway_scam":
    case "gift_scam":
      return "gift_scam_warning";
    case "emergency_scam":
      return "emergency_scam_warning";
    case "account_recovery":
      return "password_sharing_warning";
    default:
      return "general_safety_reminder";
  }
}

function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(16);
}

function computeSimilarity(a: string, b: string): number {
  const aWords = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const bWords = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

  if (aWords.size === 0 || bWords.size === 0) return 0;

  let intersection = 0;
  for (const word of aWords) {
    if (bWords.has(word)) intersection++;
  }

  const union = aWords.size + bWords.size - intersection;
  return intersection / union;
}

/**
 * Get appropriate safety warning text for a scam category.
 * These are the user-facing messages shown in chat safety warnings.
 */
export function getSafetyWarningText(
  warningType: string,
): { title: string; body: string; slug: string } {
  const warnings: Record<string, { title: string; body: string; slug: string }> = {
    payment_warning: {
      title: "💰 Protect Your Money",
      body: "Never send money to someone you've only met online. Be especially cautious of requests for financial help, travel expenses, or emergency funds from people you haven't verified in person.",
      slug: "financial-safety",
    },
    investment_warning: {
      title: "📈 Be Cautious of Investment Offers",
      body: "Investment opportunities that promise guaranteed returns are often scams. Never invest money based on advice from someone you met online, no matter how trustworthy they seem.",
      slug: "scam-awareness",
    },
    password_sharing_warning: {
      title: "🔐 Keep Your Account Secure",
      body: "Never share your password, login code, or verification code with anyone — even if they claim to need help recovering their account. Vibe will never ask for your password.",
      slug: "account-security",
    },
    off_platform_warning: {
      title: "👋 Stay on Vibe",
      body: "Be cautious when someone wants to move your conversation to another app. Scammers often try to move off-platform where there are fewer safety protections.",
      slug: "dating-safety",
    },
    gift_scam_warning: {
      title: "🎁 Beware of Gift Requests",
      body: "Requests for gift cards, digital gifts, or money for gifts are common scam tactics. Never purchase gift cards for someone you haven't met in person.",
      slug: "scam-awareness",
    },
    emergency_scam_warning: {
      title: "🚨 Verify Emergency Claims",
      body: "Urgent requests for money due to a medical emergency, accident, or legal trouble are a common scam tactic. Verify the situation through trusted channels before sending money.",
      slug: "financial-safety",
    },
    phishing_warning: {
      title: "🎣 Be Careful with Links",
      body: "Suspicious links can steal your login information or install harmful software. Only click on links from people you trust, and always check the website address carefully.",
      slug: "account-security",
    },
    romance_scam_reminder: {
      title: "❤️ Take Things Slowly",
      body: "It's exciting to meet someone new! But be cautious if someone rapidly declares strong feelings or makes grand promises. Real connections develop over time.",
      slug: "dating-safety",
    },
    general_safety_reminder: {
      title: "🛡️ Safety First",
      body: "Your safety is important. Report any suspicious behavior, block users who make you uncomfortable, and never share personal information you're not ready to share.",
      slug: "safety-center",
    },
  };

  return warnings[warningType] ?? warnings.general_safety_reminder;
}
