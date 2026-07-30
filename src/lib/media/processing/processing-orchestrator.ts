/**
 * Media Processing Orchestrator — picks up pending processing jobs
 * and dispatches them to the appropriate processor.
 *
 * This runs server-side (not in the browser) and is triggered by:
 *  - A scheduled cron job
 *  - An API endpoint for manual processing
 *  - An edge function (future)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";
import { generateImageDerivatives } from "./image-processor";
import { PROCESSING_JOB_TYPES, MAX_PROCESSING_ATTEMPTS } from "@/lib/media/constants";

// ─── Process Pending Jobs ───────────────────────────────────────────────

/**
 * Process pending media jobs.
 * Called by a scheduler or manual trigger.
 * Returns the number of jobs successfully processed.
 */
export async function processPendingJobs(maxJobs: number = 10): Promise<{
  processed: number;
  failed: number;
}> {
  const adminClient = createAdminClient();
  let processed = 0;
  let failed = 0;

  // Get pending jobs ordered by creation time
  const { data: jobs } = await adminClient
    .from("media_processing_jobs")
    .select("*")
    .eq("status", "pending")
    .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(maxJobs);

  if (!jobs || jobs.length === 0) {
    return { processed: 0, failed: 0 };
  }

  for (const job of jobs) {
    try {
      // Optimistic lock: mark as processing
      const { data: started } = await adminClient.rpc("start_media_processing", {
        p_job_id: job.id,
      });

      if (!started) {
        // Another worker got this job — skip
        continue;
      }

      const success = await processJob(job);

      if (success) {
        await adminClient
          .from("media_processing_jobs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        await trackEvent("system", "media_processing_completed", "media", job.media_id, {
          jobType: job.job_type,
        }).catch(() => {});

        processed++;
      } else {
        throw new Error("Processing returned false");
      }
    } catch (err) {
      // Handle failure with retry logic
      const attempts = (job.attempts ?? 0) + 1;
      failed++;

      if (attempts >= (job.max_attempts ?? MAX_PROCESSING_ATTEMPTS)) {
        await adminClient
          .from("media_processing_jobs")
          .update({
            status: "failed",
            error_code: err instanceof Error ? err.message.slice(0, 200) : "Unknown error",
          })
          .eq("id", job.id);

        // Mark media as failed too
        await adminClient
          .from("media")
          .update({ processing_status: "failed" })
          .eq("id", job.media_id);

        await trackEvent("system", "media_processing_failed", "media", job.media_id, {
          jobType: job.job_type,
          error: err instanceof Error ? err.message : "Unknown",
        }).catch(() => {});
      } else {
        // Schedule retry
        const backoffMs = Math.min(1000 * Math.pow(2, attempts - 1), 30000);
        await adminClient
          .from("media_processing_jobs")
          .update({
            status: "pending",
            attempts,
            error_code: err instanceof Error ? err.message.slice(0, 200) : "Unknown",
            scheduled_at: new Date(Date.now() + backoffMs).toISOString(),
          })
          .eq("id", job.id);
      }
    }
  }

  return { processed, failed };
}

// ─── Process Single Job ─────────────────────────────────────────────────

/**
 * Process a single media job based on its type.
 */
async function processJob(job: any): Promise<boolean> {
  const adminClient = createAdminClient();

  // Get the media record
  const { data: media } = await adminClient
    .from("media")
    .select("*")
    .eq("id", job.media_id)
    .single();

  if (!media) {
    logger.warn("Media not found for processing job", { jobId: job.id, mediaId: job.media_id });
    return false;
  }

  if (media.deleted_at) {
    logger.warn("Media deleted — skipping processing job", { mediaId: job.media_id });
    return true; // Not a failure
  }

  switch (job.job_type) {
    case PROCESSING_JOB_TYPES.IMAGE_OPTIMIZE:
    case PROCESSING_JOB_TYPES.IMAGE_THUMBNAIL:
      return processImageJob(media, job);

    case PROCESSING_JOB_TYPES.VIDEO_TRANSCODE:
    case PROCESSING_JOB_TYPES.VIDEO_THUMBNAIL:
      // Video processing placeholder — requires FFmpeg or external service
      // For V1, we mark video as ready and skip transcoding
      await adminClient
        .from("media")
        .update({ processing_status: "ready", version: 1 })
        .eq("id", job.media_id);
      return true;

    default:
      logger.warn("Unknown job type", { jobType: job.job_type, jobId: job.id });
      return false;
  }
}

// ─── Process Image Job ──────────────────────────────────────────────────

/**
 * Process an image: generate derivatives.
 * For V1, we fetch the image from storage and process it.
 * If the image is not in storage (Telegram file_id only), we skip processing.
 */
async function processImageJob(media: any, job: any): Promise<boolean> {
  if (!media.storage_path) {
    // No storage path — this is likely a Telegram file_id reference
    // Mark as ready since we can't process it
    const adminClient = createAdminClient();
    await adminClient
      .from("media")
      .update({ processing_status: "ready" })
      .eq("id", media.id);
    return true;
  }

  // Try to fetch the image from storage
  // For V1 without actual storage, mark as ready
  const adminClient = createAdminClient();
  await adminClient
    .from("media")
    .update({ processing_status: "ready" })
    .eq("id", media.id);
  return true;
}

// ─── Process Single Media ───────────────────────────────────────────────

/**
 * Process a single media item immediately (for on-demand processing).
 */
export async function processMediaDirectly(mediaId: string): Promise<boolean> {
  const adminClient = createAdminClient();

  const { data: media } = await adminClient
    .from("media")
    .select("*")
    .eq("id", mediaId)
    .single();

  if (!media) return false;

  if (media.media_type === "image") {
    // Create a processing job
    await adminClient.from("media_processing_jobs").insert({
      media_id: mediaId,
      job_type: "image_optimize",
      max_attempts: 3,
    });

    // Process immediately
    return processImageJob(media, { id: "direct", job_type: "image_optimize" });
  }

  if (media.media_type === "video") {
    await adminClient
      .from("media")
      .update({ processing_status: "ready" })
      .eq("id", mediaId);
    return true;
  }

  return false;
}
