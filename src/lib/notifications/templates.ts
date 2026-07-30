import { NOTIFICATION_TYPES } from "./constants";
import { translate } from "@/lib/i18n/engine";

export function getNotificationTitle(
  type: string,
  actorName?: string | null,
  locale?: string,
): string {
  const key = `notifications.types.${type}`;
  const translated = translate(key, { actor: actorName ?? "Someone" }, locale, "notifications");
  if (translated !== key) return translated;

  const template = titleTemplates[type];
  if (!template) return "New notification";
  return template.replace("{actor}", actorName ?? "Someone");
}

export function getNotificationBody(
  type: string,
  actorName?: string | null,
  metadata?: Record<string, unknown> | null,
  locale?: string,
): string {
  const key = `notifications.bodies.${type}`;
  const translated = translate(key, { actor: actorName ?? "Someone", ...(metadata as Record<string, string | number>) }, locale, "notifications");
  if (translated !== key) return translated;

  const template = bodyTemplates[type];
  if (!template) return "";
  let body = template.replace("{actor}", actorName ?? "Someone");
  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      body = body.replace(`{${key}}`, String(value ?? ""));
    }
  }
  return body;
}

export function getNotificationIcon(type: string): string {
  return icons[type] ?? "🔔";
}

const titleTemplates: Record<string, string> = {
  [NOTIFICATION_TYPES.NEW_MATCH]: "New Match! 🎉",
  [NOTIFICATION_TYPES.NEW_MESSAGE]: "New Message",
  [NOTIFICATION_TYPES.POST_LIKE]: "Post Liked",
  [NOTIFICATION_TYPES.POST_COMMENT]: "New Comment",
  [NOTIFICATION_TYPES.NEW_FOLLOWER]: "New Follower",
  [NOTIFICATION_TYPES.STORY_VIEW]: "Story Viewed",
  [NOTIFICATION_TYPES.STORY_REACTION]: "Story Reaction",
  [NOTIFICATION_TYPES.STORY_MENTION]: "Story Mention",
  [NOTIFICATION_TYPES.PROFILE_VISIT]: "Profile Visit",
  [NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED]: "Subscription Expired",
  [NOTIFICATION_TYPES.SUBSCRIPTION_RENEWED]: "Subscription Renewed",
  [NOTIFICATION_TYPES.REPORT_UPDATE]: "Report Update",
  [NOTIFICATION_TYPES.SYSTEM]: "System Update",
};

const bodyTemplates: Record<string, string> = {
  [NOTIFICATION_TYPES.NEW_MATCH]: "You matched with {actor}! Start chatting now.",
  [NOTIFICATION_TYPES.NEW_MESSAGE]: "{actor} sent you a message.",
  [NOTIFICATION_TYPES.POST_LIKE]: "{actor} liked your post.",
  [NOTIFICATION_TYPES.POST_COMMENT]: "{actor} commented on your post.",
  [NOTIFICATION_TYPES.NEW_FOLLOWER]: "{actor} started following you.",
  [NOTIFICATION_TYPES.STORY_VIEW]: "{actor} viewed your story.",
  [NOTIFICATION_TYPES.STORY_REACTION]: "{actor} reacted to your story.",
  [NOTIFICATION_TYPES.STORY_MENTION]: "{actor} mentioned you in their story.",
  [NOTIFICATION_TYPES.PROFILE_VISIT]: "{actor} visited your profile.",
  [NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED]: "Your subscription has expired. Renew to keep enjoying premium features.",
  [NOTIFICATION_TYPES.SUBSCRIPTION_RENEWED]: "Your subscription has been renewed.",
  [NOTIFICATION_TYPES.REPORT_UPDATE]: "Your report has been reviewed.",
  [NOTIFICATION_TYPES.SYSTEM]: "System update.",
};

const icons: Record<string, string> = {
  [NOTIFICATION_TYPES.NEW_MATCH]: "💕",
  [NOTIFICATION_TYPES.NEW_MESSAGE]: "💬",
  [NOTIFICATION_TYPES.POST_LIKE]: "❤️",
  [NOTIFICATION_TYPES.POST_COMMENT]: "💭",
  [NOTIFICATION_TYPES.NEW_FOLLOWER]: "👤",
  [NOTIFICATION_TYPES.STORY_VIEW]: "👁️",
  [NOTIFICATION_TYPES.STORY_REACTION]: "🔥",
  [NOTIFICATION_TYPES.STORY_MENTION]: "📸",
  [NOTIFICATION_TYPES.PROFILE_VISIT]: "👋",
  [NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED]: "⚠️",
  [NOTIFICATION_TYPES.SUBSCRIPTION_RENEWED]: "✅",
  [NOTIFICATION_TYPES.REPORT_UPDATE]: "📋",
  [NOTIFICATION_TYPES.SYSTEM]: "🔔",
};
