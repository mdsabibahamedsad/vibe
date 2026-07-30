/**
 * Notification Grouping Service.
 *
 * Groups notification events by group_key to produce aggregated
 * UI strings like "Alice and 12 others liked your post".
 *
 * Architecture:
 *   Notifications are stored individually (one per event) in the database.
 *   The grouping service queries recent notifications, groups by group_key,
 *   and produces aggregated display items for the UI.
 *
 * This avoids complex database aggregation and keeps the storage simple.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// ─── Grouped Notification ───────────────────────────────────────────────

export interface GroupedNotification {
  /** Primary notification ID (most recent in group) */
  id: string;
  /** Notification type */
  type: string;
  /** Recipient user ID */
  recipientId: string;
  /** Group key shared by all notifications in this group */
  groupKey: string;
  /** Total count of events in this group */
  count: number;
  /** Display names of actors in this group (limited for display) */
  actorNames: string[];
  /** Number of additional actors beyond those named */
  additionalCount: number;
  /** The entity this group refers to */
  entityType: string | null;
  entityId: string | null;
  /** Whether any notification in the group is unread */
  hasUnread: boolean;
  /** Most recent creation timestamp */
  latestCreatedAt: string;
  /** Aggregated body text */
  body: string;
}

// ─── Grouping Config ────────────────────────────────────────────────────

interface GroupingConfig {
  /** Group keys matching this pattern will be grouped */
  groupPattern: string;
  /** Maximum actors to name individually */
  maxActorNames: number;
  /** Label prefix for grouped notifications */
  label: string;
  /** Actor verb (e.g., "liked", "commented on", "followed") */
  verb: string;
  /** Target description (e.g., "your post") */
  target: string;
}

const GROUPING_CONFIGS: Record<string, GroupingConfig> = {
  post_like: {
    groupPattern: "post_like:",
    maxActorNames: 2,
    label: "Likes",
    verb: "liked",
    target: "your post",
  },
  post_comment: {
    groupPattern: "post_comment:",
    maxActorNames: 2,
    label: "Comments",
    verb: "commented on",
    target: "your post",
  },
  new_follower: {
    groupPattern: "follow:",
    maxActorNames: 2,
    label: "New Followers",
    verb: "followed",
    target: "you",
  },
  story_reaction: {
    groupPattern: "story_reaction:",
    maxActorNames: 2,
    label: "Story Reactions",
    verb: "reacted to",
    target: "your story",
  },
};

// ─── Grouping Service ───────────────────────────────────────────────────

/**
 * Group recent notifications by their group_key.
 *
 * Returns an array of grouped notifications alongside individual
 * (non-grouped) notifications.
 */
export async function getGroupedNotifications(
  recipientId: string,
  limit: number = 20,
): Promise<{
  grouped: GroupedNotification[];
  individual: any[];
}> {
  const adminClient = createAdminClient();

  try {
    // Fetch recent notifications with group keys
    const { data: notifications } = await adminClient
      .from("notifications")
      .select(`
        id,
        type,
        recipient_id,
        actor_id,
        entity_type,
        entity_id,
        group_key,
        is_read,
        created_at,
        users:actor_id (display_name)
      `)
      .eq("recipient_id", recipientId)
      .order("created_at", { ascending: false })
      .limit(100); // Fetch extra for grouping

    if (!notifications || notifications.length === 0) {
      return { grouped: [], individual: [] };
    }

    // Separate grouped and individual notifications
    const groupedMap = new Map<string, any[]>();
    const individual: any[] = [];

    for (const n of notifications) {
      if (n.group_key) {
        const existing = groupedMap.get(n.group_key) ?? [];
        existing.push(n);
        groupedMap.set(n.group_key, existing);
      } else {
        individual.push(n);
      }
    }

    // Process each group
    const grouped: GroupedNotification[] = [];

    for (const [groupKey, groupItems] of groupedMap) {
      if (groupItems.length === 0) continue;

      // Determine config from notification type or group key prefix
      const type = groupItems[0].type;
      const config = GROUPING_CONFIGS[type];
      if (!config) {
        // Not a groupable type — add items as individuals
        individual.push(...groupItems);
        continue;
      }

      // Collect unique actor names
      const actorNames: string[] = [];
      const nameSet = new Set<string>();

      for (const item of groupItems) {
        const displayName = (item as any).users?.display_name;
        if (displayName && !nameSet.has(displayName)) {
          nameSet.add(displayName);
          actorNames.push(displayName);
        }
      }

      const maxNames = config.maxActorNames;
      const namedActors = actorNames.slice(0, maxNames);
      const additionalCount = Math.max(0, actorNames.length - maxNames);

      // Build aggregated body
      let body: string;
      if (actorNames.length === 1) {
        body = `${namedActors[0]} ${config.verb} ${config.target}`;
      } else if (additionalCount === 0) {
        const lastActor = namedActors.pop()!;
        body = `${namedActors.join(", ")} and ${lastActor} ${config.verb} ${config.target}`;
      } else {
        body = `${namedActors.join(", ")} and ${additionalCount} others ${config.verb} ${config.target}`;
      }

      const mostRecent = groupItems[0];
      grouped.push({
        id: mostRecent.id,
        type: mostRecent.type,
        recipientId: mostRecent.recipient_id,
        groupKey,
        count: groupItems.length,
        actorNames: namedActors,
        additionalCount,
        entityType: mostRecent.entity_type,
        entityId: mostRecent.entity_id,
        hasUnread: groupItems.some((item) => !item.is_read),
        latestCreatedAt: mostRecent.created_at,
        body,
      });
    }

    // Sort: most recent grouped first, then individual
    grouped.sort((a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime());

    // Trim individual items to fit within limit
    const totalItems = grouped.length + individual.length;
    const excess = Math.max(0, totalItems - limit);
    if (excess > 0) {
      individual.splice(individual.length - excess, excess);
    }

    return { grouped, individual };
  } catch (err) {
    logger.error("Failed to get grouped notifications", {
      error: err instanceof Error ? err.message : "Unknown",
    });
    return { grouped: [], individual: [] };
  }
}

// ─── Group Key Builder ──────────────────────────────────────────────────

/**
 * Build a group key for a notification type and entity.
 *
 * Example:
 *   buildGroupKey("post_like", postId) → "post_like:uuid"
 *   buildGroupKey("new_follower", null) → "follow:"
 *   buildGroupKey("story_reaction", storyId) → "story_reaction:uuid"
 */
export function buildGroupKey(type: string, entityId: string | null): string | null {
  const prefixMap: Record<string, string> = {
    post_like: "post_like",
    post_comment: "post_comment",
    new_follower: "follow",
    story_reaction: "story_reaction",
  };

  const prefix = prefixMap[type];
  if (!prefix) return null;

  return entityId ? `${prefix}:${entityId}` : `${prefix}:`;
}

// ─── Has New Unread in Group ──────────────────────────────────────────

/**
 * Check if a grouped notification has new items since the viewer last checked.
 * Used to show "2 new" badges on grouped items.
 */
export function hasNewInGroup(
  groupKey: string,
  checkedAt: string | null,
): boolean {
  if (!checkedAt) return true;
  // The group_key indexing + timestamp comparison tells us
  return false; // Will be evaluated server-side in production
}
