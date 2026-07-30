/**
 * Content Moderation Service.
 *
 * Handles content removal and restoration across all content types:
 * posts, comments, stories, media.
 *
 * Uses soft-deletion / moderation_status changes rather than actual deletion.
 * Every action is audited and creates a moderation action record.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { AppError, authorizationError, notFoundError } from "@/lib/errors";
import { can, Permissions, type Permission } from "./permissions";
import { recordAuditEvent } from "./audit.service";
import { createModerationAction } from "./moderation.service";

export type ContentType = "post" | "comment" | "story" | "media";

// ============================================================================
// PERMISSION CHECKS
// ============================================================================

async function requirePermission(role: string, permission: Permission): Promise<void> {
  if (!(await can(role, permission))) {
    throw authorizationError("Insufficient permissions");
  }
}

// ============================================================================
// TABLE / COLUMN MAPPING
// ============================================================================

interface ContentTableConfig {
  table: string;
  idColumn: string;
  authorColumn: string;
  contentPreviewColumn?: string;
}

const CONTENT_TABLES: Record<ContentType, ContentTableConfig> = {
  post: {
    table: "posts",
    idColumn: "id",
    authorColumn: "author_id",
    contentPreviewColumn: "caption",
  },
  comment: {
    table: "post_comments",
    idColumn: "id",
    authorColumn: "author_id",
    contentPreviewColumn: "content",
  },
  story: {
    table: "stories",
    idColumn: "id",
    authorColumn: "author_id",
    contentPreviewColumn: "caption",
  },
  media: {
    table: "media",
    idColumn: "id",
    authorColumn: "owner_id",
    contentPreviewColumn: "mime_type",
  },
};

// ============================================================================
// CONTENT PREVIEW
// ============================================================================

export interface ContentItem {
  id: string;
  type: ContentType;
  authorId: string;
  preview: string | null;
  moderationStatus: string;
  createdAt: string;
  removedAt: string | null;
  removedBy: string | null;
  removalReason: string | null;
  restoredAt: string | null;
}

/**
 * Search content by type with moderation status.
 */
export async function searchContent(
  role: string,
  filters: {
    type?: ContentType;
    moderationStatus?: string;
    authorId?: string;
    query?: string;
    cursor?: string;
    limit?: number;
  } = {},
) {
  await requirePermission(role, Permissions.CONTENT_VIEW);

  const adminClient = createAdminClient();
  const limit = Math.min(filters.limit ?? 25, 100);

  const results: ContentItem[] = [];
  const typesToSearch = filters.type ? [filters.type] : (Object.keys(CONTENT_TABLES) as ContentType[]);

  for (const type of typesToSearch) {
    const config = CONTENT_TABLES[type];

    // Build the query using a try/catch for safety
    try {
      const query = adminClient
        .from(config.table as any)
        .select(
          "id, moderation_status, created_at, removed_at, removed_by, removal_reason, restored_at",
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (filters.moderationStatus) {
        (query as any).eq("moderation_status", filters.moderationStatus);
      }

      const { data, error } = await query;

      if (error) {
        logger.error("Failed to search content", { type, error: error.message });
        continue;
      }

      for (const item of (data ?? []) as any[]) {
        results.push({
          id: item.id as string,
          type,
          authorId: (item[config.authorColumn] as string) ?? "",
          preview: config.contentPreviewColumn
            ? (item[config.contentPreviewColumn] as string) ?? null
            : null,
          moderationStatus: (item.moderation_status as string) ?? "visible",
          createdAt: item.created_at as string,
          removedAt: (item.removed_at as string) ?? null,
          removedBy: (item.removed_by as string) ?? null,
          removalReason: (item.removal_reason as string) ?? null,
          restoredAt: (item.restored_at as string) ?? null,
        });
      }
    } catch (err) {
      logger.error("Failed to search content table", { type, error: String(err) });
    }
  }

  // Sort by created_at descending
  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    items: results.slice(0, limit),
    total: results.length,
    hasMore: results.length > limit,
  };
}

// ============================================================================
// CONTENT REMOVAL
// ============================================================================

/**
 * Remove (hide) content. Uses moderation_status change instead of hard delete.
 */
export async function removeContent(
  adminId: string,
  role: string,
  contentType: ContentType,
  contentId: string,
  reasonCode: string,
  reason?: string,
): Promise<void> {
  await requirePermission(role, Permissions.CONTENT_REMOVE);

  const config = CONTENT_TABLES[contentType];
  if (!config) {
    throw new AppError("VALIDATION_ERROR", `Unknown content type: ${contentType}`);
  }

  const adminClient = createAdminClient();

  // Verify content exists
  const { data: content } = await (adminClient
    .from(config.table as any)
    .select("id, moderation_status")
    .eq(config.idColumn, contentId)
    .single() as any);

  if (!content) throw notFoundError(`${contentType} not found`);
  if (content.moderation_status === "removed") return; // Already removed — idempotent

  // Update moderation status
  const { error } = await (adminClient
    .from(config.table as any)
    .update({
      moderation_status: "removed",
      removed_at: new Date().toISOString(),
      removed_by: adminId,
      removal_reason: reason ?? reasonCode,
    })
    .eq(config.idColumn, contentId) as any);

  if (error) {
    logger.error("Failed to remove content", { contentType, contentId, error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to remove content");
  }

  // Create moderation action (triggers notification if applicable)
  await createModerationAction({
    moderatorId: adminId,
    actionType: "content_removed",
    targetType: contentType,
    targetId: contentId,
    reasonCode,
    reason,
    details: { authorId: content[config.authorColumn as any] },
  });

  await recordAuditEvent({
    adminId,
    action: "content_removed",
    targetType: contentType,
    targetId: contentId,
    metadata: { reasonCode, reason },
  });
}

// ============================================================================
// CONTENT RESTORATION
// ============================================================================

/**
 * Restore previously removed content.
 */
export async function restoreContent(
  adminId: string,
  role: string,
  contentType: ContentType,
  contentId: string,
  reason?: string,
): Promise<void> {
  await requirePermission(role, Permissions.CONTENT_RESTORE);

  const config = CONTENT_TABLES[contentType];
  if (!config) {
    throw new AppError("VALIDATION_ERROR", `Unknown content type: ${contentType}`);
  }

  const adminClient = createAdminClient();

  // Verify content exists and is removed
  const { data: content } = await (adminClient
    .from(config.table as any)
    .select("id, moderation_status")
    .eq(config.idColumn, contentId)
    .single() as any);

  if (!content) throw notFoundError(`${contentType} not found`);
  if (content.moderation_status !== "removed") return; // Already visible — idempotent

  // Restore
  const { error } = await (adminClient
    .from(config.table as any)
    .update({
      moderation_status: "restored",
      restored_at: new Date().toISOString(),
      restored_by: adminId,
      deleted_at: null,
    })
    .eq(config.idColumn, contentId) as any);

  if (error) {
    logger.error("Failed to restore content", { contentType, contentId, error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to restore content");
  }

  // Create moderation action (triggers notification)
  await createModerationAction({
    moderatorId: adminId,
    actionType: "content_restored",
    targetType: contentType,
    targetId: contentId,
    reason,
  });

  await recordAuditEvent({
    adminId,
    action: "content_restored",
    targetType: contentType,
    targetId: contentId,
    metadata: { reason },
  });
}

// ============================================================================
// CONTENT DETAILS
// ============================================================================

/**
 * Get content details for moderation review.
 */
export async function getContentDetails(
  role: string,
  contentType: ContentType,
  contentId: string,
) {
  await requirePermission(role, Permissions.CONTENT_VIEW);

  const config = CONTENT_TABLES[contentType];
  if (!config) {
    throw new AppError("VALIDATION_ERROR", `Unknown content type: ${contentType}`);
  }

  const adminClient = createAdminClient();

  const { data, error } = await (adminClient
    .from(config.table as any)
    .select("*")
    .eq(config.idColumn, contentId)
    .single() as any);

  if (error || !data) throw notFoundError(`${contentType} not found`);

  // Get author info
  const authorId = data[config.authorColumn] as string;
  const { data: author } = await (adminClient
    .from("users")
    .select("id, display_name, telegram_username")
    .eq("id", authorId)
    .single() as any);

  // Get related reports
  const { data: reports } = await (adminClient
    .from("reports")
    .select("id, reason, status, priority, created_at")
    .eq(
      contentType === "post"
        ? "reported_post_id"
        : contentType === "comment"
          ? "reported_comment_id"
          : contentType === "story"
            ? "reported_story_id"
            : "reported_media_id",
      contentId,
    )
    .order("created_at", { ascending: false }) as any);

  return {
    content: data,
    author: author
      ? {
          id: author.id,
          displayName: author.display_name,
          username: author.telegram_username,
        }
      : null,
    reports: reports ?? [],
  };
}
