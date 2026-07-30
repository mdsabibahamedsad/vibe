/**
 * Stories cleanup service.
 *
 * Manages the lifecycle of expired stories.
 *
 * Strategy:
 *   1. A database function `expire_stories()` marks active stories as expired
 *      when their expires_at has passed.
 *   2. This server-side function can be triggered by:
 *      - A cron job (e.g., Supabase cron, Vercel Cron Jobs)
 *      - A manual cleanup endpoint
 *      - An API middleware that checks on every request (lazy expiration)
 *   3. Cleanup does NOT delete the stories or their associated media.
 *      - Analytics/moderation metadata is preserved
 *      - The media record is preserved (may be referenced elsewhere)
 *      - Stories are simply hidden from public queries
 *
 * Future Enhancement:
 *   - Hard-delete expired stories older than 30 days
 *   - Archive expired stories to cold storage
 *   - Delete orphaned media records
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * Expire old stories by calling the database function.
 * Returns the number of stories expired.
 */
export async function expireStories(): Promise<number> {
  const adminClient = createAdminClient();

  try {
    const { data, error } = await adminClient.rpc("expire_stories");

    if (error) {
      logger.error("Failed to expire stories", { error: error.message });
      return 0;
    }

    const count = (data ?? 0) as number;

    if (count > 0) {
      logger.info(`Expired ${count} story(ies)`);
    }

    return count;
  } catch (err) {
    logger.error("Story expiration error", {
      error: err instanceof Error ? err.message : "Unknown",
    });
    return 0;
  }
}

/**
 * Clean up orphaned media records that are no longer referenced by any story
 * (where the media was created for a story that failed to publish).
 *
 * This is a best-effort cleanup to prevent media table bloat.
 * It only removes media records that have no story referencing them
 * AND have no post_media or profile_photos referencing them.
 */
export async function cleanupOrphanedStoryMedia(): Promise<number> {
  const adminClient = createAdminClient();

  try {
    // Find media records older than 24 hours that are not referenced by any
    // story, post_media, or profile_photos
    const { data: orphaned, error: findError } = await adminClient
      .from("media")
      .select("id")
      .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .is("deleted_at", null);

    if (findError || !orphaned) {
      logger.error("Failed to find orphaned media", {
        error: findError?.message,
      });
      return 0;
    }

    // Filter to only those not referenced by any story
    const orphanedIds: string[] = [];

    for (const media of orphaned) {
      const { count: storyCount } = await adminClient
        .from("stories")
        .select("*", { count: "exact", head: true })
        .eq("media_id", media.id);

      const { count: postCount } = await adminClient
        .from("post_media")
        .select("*", { count: "exact", head: true })
        .eq("media_id", media.id);

      const { count: photoCount } = await adminClient
        .from("profile_photos")
        .select("*", { count: "exact", head: true })
        .eq("media_id", media.id);

      if ((storyCount ?? 0) === 0 && (postCount ?? 0) === 0 && (photoCount ?? 0) === 0) {
        orphanedIds.push(media.id);
      }
    }

    if (orphanedIds.length === 0) return 0;

    // Soft delete orphaned media
    const { error: deleteError } = await adminClient
      .from("media")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", orphanedIds);

    if (deleteError) {
      logger.error("Failed to clean up orphaned media", {
        error: deleteError.message,
      });
      return 0;
    }

    logger.info(`Cleaned up ${orphanedIds.length} orphaned media record(s)`);

    return orphanedIds.length;
  } catch (err) {
    logger.error("Orphaned media cleanup error", {
      error: err instanceof Error ? err.message : "Unknown",
    });
    return 0;
  }
}

/**
 * Full cleanup: expire old stories + clean up orphaned media.
 * Returns { expired, cleaned } counts.
 */
export async function fullCleanup(): Promise<{ expired: number; cleaned: number }> {
  const [expired, cleaned] = await Promise.all([
    expireStories(),
    cleanupOrphanedStoryMedia(),
  ]);

  return { expired, cleaned };
}
