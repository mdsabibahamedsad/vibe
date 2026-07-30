/**
 * Deep-link utility for shareable post/entity references.
 *
 * Format:
 *   https://t.me/<BOT_USERNAME>/<APP_NAME>?startapp=<entity_type>_<entity_id>
 *
 * This creates stable references that can later support Telegram deep links
 * without hard-coding bot configuration.
 */

import { logger } from "@/lib/logger";

export type DeepLinkEntity = "post" | "profile" | "community" | "story" | "match" | "chat" | "notifications";

/**
 * Create a shareable deep-link identifier for an entity.
 */
export function createDeepLink(entityType: DeepLinkEntity, entityId: string): string {
  return `${entityType}_${entityId}`;
}

/**
 * Parse a deep-link startapp parameter into entity type and ID.
 */
export function parseDeepLink(
  startapp: string,
): { entityType: DeepLinkEntity; entityId: string } | null {
  const parts = startapp.split("_");
  const entityType = parts[0] as DeepLinkEntity;
  const entityId = parts.slice(1).join("_");

  const validTypes = [
    "post", "profile", "community", "story",
    "match", "chat", "notifications",
  ];

  if (!validTypes.includes(entityType) || !entityId) {
    return null;
  }

  return { entityType, entityId };
}

/**
 * Build the full Telegram Mini App deep link URL.
 * Uses NEXT_PUBLIC_TELEGRAM_BOT_USERNAME from environment.
 *
 * Example:
 *   https://t.me/vibe_app_bot/vibe?startapp=post_abc123
 */
export function buildTelegramDeepLink(entityType: DeepLinkEntity, entityId: string): string {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "vibe_app_bot";
  const appName = process.env.NEXT_PUBLIC_TELEGRAM_APP_NAME || "vibe";

  const startapp = createDeepLink(entityType, entityId);

  return `https://t.me/${botUsername}/${appName}?startapp=${startapp}`;
}

/**
 * Share a deep link via the Telegram WebApp API.
 * Falls back to copying to clipboard if Telegram API is unavailable.
 */
export function shareDeepLink(entityType: DeepLinkEntity, entityId: string): void {
  const link = buildTelegramDeepLink(entityType, entityId);

  try {
    // Try Telegram WebApp share
    if (typeof window !== "undefined" && (window as any).Telegram?.WebApp) {
      (window as any).Telegram.WebApp.switchInlineQuery(
        link,
        ["users", "groups", "channels"].includes(
          (window as any).Telegram.WebApp.initDataUnsafe?.chat?.type ?? "",
        )
          ? ["selected"]
          : undefined,
      );
      return;
    }
  } catch (err) {
    logger.debug("Telegram share not available, falling back to clipboard copy");
  }

  // Fallback: copy to clipboard
  if (typeof navigator !== "undefined") {
    navigator.clipboard.writeText(link).catch(() => {
      // Clipboard unavailable
    });
  }
}

/**
 * Resolve a deep-link route to a local app navigation path.
 * Returns null if the route cannot be resolved.
 */
export function resolveDeepLinkRoute(
  entityType: DeepLinkEntity,
  entityId: string,
): string | null {
  switch (entityType) {
    case "post":
      return `/feed?postId=${entityId}`;
    case "profile":
      return `/profile/${entityId}`;
    case "story":
      return `/stories?storyId=${entityId}`;
    case "match":
      return `/matches/${entityId}`;
    case "chat":
      return `/chat/${entityId}`;
    case "notifications":
      return "/notifications";
    case "community":
      return `/communities/${entityId}`;
    default:
      return null;
  }
}
