/**
 * Chat Safety Service
 *
 * Provides contextual safety warnings for high-risk conversations,
 * harassment pattern detection, and message safety controls.
 *
 * Key features:
 *   - Chat Safety Warnings: Show contextual reminders when risky patterns detected
 *   - Harassment Detection: Pattern-based detection of unwanted behavior
 *   - Safe Message Limits: Configurable limits for new/unverified accounts
 *   - Message Requests: Privacy-controlled message intake
 *
 * Does NOT reveal internal detection logic to users.
 * All warnings are educational, not accusatory.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { getSafetyWarningText } from "./anti-scam.service";

// ─── Chat Safety Warnings ─────────────────────────────────────────────────

export type WarningType =
  | "payment_warning"
  | "investment_warning"
  | "password_sharing_warning"
  | "off_platform_warning"
  | "gift_scam_warning"
  | "emergency_scam_warning"
  | "phishing_warning"
  | "romance_scam_reminder"
  | "general_safety_reminder"
  | "impersonation_warning";

export interface SafetyWarning {
  id: string;
  conversationId?: string;
  matchId?: string;
  warningType: WarningType;
  title: string;
  body: string;
  severity: "info" | "caution" | "warning" | "critical";
  dismissed: boolean;
  safetyArticleSlug?: string;
  createdAt: string;
}

/**
 * Create a chat safety warning for a user.
 * Warnings are educational — they don't restrict the conversation.
 */
export async function createSafetyWarning(params: {
  userId: string;
  warningType: WarningType;
  conversationId?: string;
  matchId?: string;
  severity?: "info" | "caution" | "warning" | "critical";
}): Promise<string> {
  const warningText = getSafetyWarningText(params.warningType);
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("chat_safety_warnings")
    .insert({
      warned_user_id: params.userId,
      conversation_id: params.conversationId ?? null,
      match_id: params.matchId ?? null,
      warning_type: params.warningType,
      warning_title: warningText.title,
      warning_body: warningText.body,
      safety_article_slug: warningText.slug,
      severity: params.severity ?? "info",
      generated_by: "system",
    })
    .select("id")
    .single();

  if (error) {
    logger.error("Failed to create safety warning", {
      userId: params.userId,
      warningType: params.warningType,
      error: error.message,
    });
    throw new AppError("INTERNAL_ERROR", "Failed to create safety warning");
  }

  return data.id;
}

/**
 * Get active (non-dismissed) safety warnings for a user.
 */
export async function getUserSafetyWarnings(
  userId: string,
  includeDismissed = false,
): Promise<SafetyWarning[]> {
  const supabase = createServerClient();

  let query = supabase
    .from("chat_safety_warnings")
    .select("*")
    .eq("warned_user_id", userId)
    .order("created_at", { ascending: false });

  if (!includeDismissed) {
    query = query.eq("dismissed", false);
  }

  const { data, error } = await query;

  if (error) {
    logger.error("Failed to fetch safety warnings", { userId, error: error.message });
    return [];
  }

  return (data ?? []).map((w: any) => ({
    id: w.id,
    conversationId: w.conversation_id ?? undefined,
    matchId: w.match_id ?? undefined,
    warningType: w.warning_type as WarningType,
    title: w.warning_title,
    body: w.warning_body,
    severity: w.severity as SafetyWarning["severity"],
    dismissed: w.dismissed,
    safetyArticleSlug: w.safety_article_slug ?? undefined,
    createdAt: w.created_at,
  }));
}

/**
 * Dismiss a safety warning.
 */
export async function dismissSafetyWarning(
  warningId: string,
  userId: string,
): Promise<void> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("chat_safety_warnings")
    .update({
      dismissed: true,
      dismissed_at: new Date().toISOString(),
    })
    .eq("id", warningId)
    .eq("warned_user_id", userId);

  if (error) {
    logger.error("Failed to dismiss safety warning", { warningId, error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to dismiss warning");
  }
}

// ─── Harassment Detection ────────────────────────────────────────────────

export interface HarassmentDetectionResult {
  isHarassment: boolean;
  confidence: number;
  signals: string[];
  severity: "low" | "medium" | "high" | "critical";
}

const HARASSMENT_PATTERNS = [
  // Insults
  /\b(you are (a )?(stupid|ugly|loser|idiot|moron|dumb|fat|pathetic|worthless))\b/i,
  /\b(fuck you|fk you|go to hell|kill yourself|shut up)\b/i,
  // Threats
  /\b(I will (find|hurt|kill|destroy|ruin|cancel|expose|leak))\b/i,
  /\b(you better watch out|you're dead|your (life|reputation) is over)\b/i,
  // Targeted harassment
  /(\b[a-z]+\b)\s{0,3}\1\s{0,3}\1\s{0,3}\1{2,}/i, // Repeated words in short span
  // Message flooding indicator
  /^(.{1,100})\n\1\n\1\n\1/m, // Same message repeated 4+ times
];

/**
 * Check a message for harassment patterns.
 * Returns detection signals for review — does NOT auto-restrict.
 */
export function detectHarassmentInMessage(messageContent: string): HarassmentDetectionResult {
  const signals: string[] = [];
  let score = 0;

  for (const pattern of HARASSMENT_PATTERNS) {
    if (pattern.test(messageContent)) {
      signals.push(`Harassment pattern detected`);
      score += 25;
    }
  }

  // Check for excessive capitalization (shouting)
  const capsRatio =
    messageContent.split("").filter((c) => c >= "A" && c <= "Z").length /
    Math.max(messageContent.replace(/[^A-Za-z]/g, "").length, 1);

  if (capsRatio > 0.7 && messageContent.length > 20) {
    signals.push("Excessive capitalization — possible aggressive tone");
    score += 10;
  }

  const isHarassment = score >= 30;

  return {
    isHarassment,
    confidence: Math.min(score / 100, 0.9),
    signals,
    severity: score >= 70 ? "critical" : score >= 50 ? "high" : score >= 30 ? "medium" : "low",
  };
}

/**
 * Check if a user has exceeded harassment thresholds.
 * Used for progressive controls (warning → rate limit → restriction).
 */
export async function checkHarassmentLevel(userId: string): Promise<{
  level: "normal" | "elevated" | "high" | "critical";
  shouldRestrict: boolean;
}> {
  const adminClient = createAdminClient();

  // Count recent harassment signals
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { count: harassmentSignals } = await adminClient
    .from("safety_signals")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("signal_type", ["harassment_pattern"])
    .gte("created_at", sevenDaysAgo);

  const { count: reportsAgainst } = await adminClient
    .from("reports")
    .select("*", { count: "exact", head: true })
    .eq("reported_user_id", userId)
    .eq("reason", "harassment")
    .gte("created_at", sevenDaysAgo);

  const totalSignals = (harassmentSignals ?? 0) + (reportsAgainst ?? 0);

  if (totalSignals >= 5) {
    return { level: "critical", shouldRestrict: true };
  }
  if (totalSignals >= 3) {
    return { level: "high", shouldRestrict: true };
  }
  if (totalSignals >= 1) {
    return { level: "elevated", shouldRestrict: false };
  }

  return { level: "normal", shouldRestrict: false };
}

// ─── Message Request Settings ─────────────────────────────────────────────

export interface MessageRequestSettings {
  whoCanMessage: "everyone" | "followers" | "matches_only" | "nobody";
  requirePrompt: boolean;
  autoDeclineDays: number;
  allowNewAccounts: boolean;
}

const DEFAULT_MESSAGE_SETTINGS: MessageRequestSettings = {
  whoCanMessage: "everyone",
  requirePrompt: true,
  autoDeclineDays: 7,
  allowNewAccounts: false,
};

/**
 * Get message request settings for a user.
 * Returns defaults if not yet configured.
 */
export async function getMessageRequestSettings(
  userId: string,
): Promise<MessageRequestSettings> {
  const supabase = createServerClient();

  const { data } = await supabase
    .from("message_request_settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!data) return DEFAULT_MESSAGE_SETTINGS;

  return {
    whoCanMessage: data.who_can_message,
    requirePrompt: data.require_prompt,
    autoDeclineDays: data.auto_decline_days,
    allowNewAccounts: data.allow_new_accounts,
  };
}

/**
 * Update message request settings.
 */
export async function updateMessageRequestSettings(
  userId: string,
  settings: Partial<MessageRequestSettings>,
): Promise<void> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("message_request_settings")
    .upsert(
      {
        user_id: userId,
        who_can_message: settings.whoCanMessage ?? DEFAULT_MESSAGE_SETTINGS.whoCanMessage,
        require_prompt: settings.requirePrompt ?? DEFAULT_MESSAGE_SETTINGS.requirePrompt,
        auto_decline_days: settings.autoDeclineDays ?? DEFAULT_MESSAGE_SETTINGS.autoDeclineDays,
        allow_new_accounts: settings.allowNewAccounts ?? DEFAULT_MESSAGE_SETTINGS.allowNewAccounts,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    logger.error("Failed to update message request settings", {
      userId,
      error: error.message,
    });
    throw new AppError("INTERNAL_ERROR", "Failed to update message settings");
  }
}

// ─── Safe Message Limits ──────────────────────────────────────────────────

export interface MessageLimitCheck {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
}

const MESSAGE_LIMITS = {
  // New accounts (first 24 hours)
  NEW_ACCOUNT_MAX_MESSAGES: 20,
  NEW_ACCOUNT_MAX_CONVERSATIONS: 5,
  // Unverified accounts
  UNVERIFIED_MAX_MESSAGES_PER_HOUR: 30,
  UNVERIFIED_MAX_CONVERSATIONS_PER_DAY: 10,
  // Normal accounts
  NORMAL_MAX_MESSAGES_PER_HOUR: 100,
  NORMAL_MAX_CONVERSATIONS_PER_DAY: 50,
  // Bulk detection threshold
  BULK_IDENTICAL_MESSAGE_LIMIT: 5,
  BULK_WINDOW_MINUTES: 10,
};

/**
 * Check if a user is within safe message limits.
 * Returns whether the message can be sent.
 */
export async function checkMessageLimit(
  userId: string,
  conversationId?: string,
): Promise<MessageLimitCheck> {
  const adminClient = createAdminClient();

  // Get user account info
  const { data: user } = await adminClient
    .from("users")
    .select("created_at")
    .eq("id", userId)
    .single();

  if (!user) return { allowed: false, reason: "User not found" };

  const accountAgeMs = Date.now() - new Date(user.created_at).getTime();
  const accountAgeHours = accountAgeMs / (1000 * 60 * 60);
  const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);

  // Check if user has a message restriction
  const { data: restriction } = await adminClient
    .from("user_restrictions")
    .select("id")
    .eq("user_id", userId)
    .eq("restriction_type", "messaging_disabled")
    .eq("is_active", true)
    .maybeSingle();

  if (restriction) {
    return { allowed: false, reason: "Your messaging has been restricted" };
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Check message count in last hour
  const { count: recentMessages } = await adminClient
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("sender_id", userId)
    .gte("created_at", oneHourAgo);

  const maxPerHour =
    accountAgeDays < 1
      ? MESSAGE_LIMITS.NEW_ACCOUNT_MAX_MESSAGES
      : MESSAGE_LIMITS.NORMAL_MAX_MESSAGES_PER_HOUR;

  if ((recentMessages ?? 0) >= maxPerHour) {
    return {
      allowed: false,
      reason: "You've reached the message limit. Please wait before sending more messages.",
      retryAfterSeconds: 3600,
    };
  }

  // Check conversations today
  const { count: conversationsToday } = await adminClient
    .from("messages")
    .select("conversation_id", { count: "exact", head: true })
    .eq("sender_id", userId)
    .gte("created_at", todayStart.toISOString());

  const maxConversationsPerDay =
    accountAgeDays < 1
      ? MESSAGE_LIMITS.NEW_ACCOUNT_MAX_CONVERSATIONS
      : MESSAGE_LIMITS.NORMAL_MAX_CONVERSATIONS_PER_DAY;

  if ((conversationsToday ?? 0) >= maxConversationsPerDay) {
    return {
      allowed: false,
      reason: "You've reached the daily conversation limit.",
      retryAfterSeconds: undefined,
    };
  }

  return { allowed: true };
}

// ─── Bulk Message Detection ───────────────────────────────────────────────

export interface BulkMessageCheckResult {
  isBulk: boolean;
  identicalCount: number;
  signals: string[];
}

/**
 * Check if a message is part of bulk/copy-paste messaging.
 * Used to detect spam campaigns.
 */
export async function detectBulkMessaging(
  senderId: string,
  messageContent: string,
): Promise<BulkMessageCheckResult> {
  const adminClient = createAdminClient();
  const signals: string[] = [];

  const recentWindow = new Date(Date.now() - MESSAGE_LIMITS.BULK_WINDOW_MINUTES * 60 * 1000).toISOString();

  // Count identical messages in recent window
  const { count: identicalCount } = await adminClient
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("sender_id", senderId)
    .eq("content", messageContent)
    .gte("created_at", recentWindow);

  if ((identicalCount ?? 0) >= MESSAGE_LIMITS.BULK_IDENTICAL_MESSAGE_LIMIT) {
    signals.push(`Sent ${identicalCount} identical messages in ${MESSAGE_LIMITS.BULK_WINDOW_MINUTES} minutes`);
  }

  const isBulk = (identicalCount ?? 0) >= MESSAGE_LIMITS.BULK_IDENTICAL_MESSAGE_LIMIT;

  return {
    isBulk,
    identicalCount: identicalCount ?? 0,
    signals,
  };
}
