/**
 * Zod validation schemas for the social feed system.
 *
 * Server-side schemas are authoritative.
 * All endpoints validate input before processing.
 */

import { z } from "zod";

// ─── Constants ───────────────────────────────────────────────────────────

export const POST_CAPTION_MAX = 2000;
export const POST_MAX_IMAGES = 10;
export const POST_MAX_VIDEOS = 1;
export const COMMENT_MAX_LENGTH = 1000;

// ─── Post Creation Schema ────────────────────────────────────────────────

export const createPostSchema = z.object({
  caption: z
    .string()
    .max(POST_CAPTION_MAX, `Caption must be at most ${POST_CAPTION_MAX} characters`)
    .trim()
    .optional()
    .or(z.literal("")),
  postType: z.enum(["text", "image", "video"]),
  visibility: z.enum(["public", "followers_only", "private"]).default("public"),
  commentsEnabled: z.boolean().default(true),
  mediaIds: z
    .array(z.string().uuid())
    .max(POST_MAX_IMAGES + POST_MAX_VIDEOS)
    .optional()
    .default([]),
  /** For video posts, the thumbnail media ID */
  thumbnailMediaId: z.string().uuid().optional(),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;

// ─── Post Update Schema ──────────────────────────────────────────────────

export const updatePostSchema = z.object({
  caption: z
    .string()
    .max(POST_CAPTION_MAX, `Caption must be at most ${POST_CAPTION_MAX} characters`)
    .trim()
    .optional(),
  visibility: z.enum(["public", "followers_only", "private"]).optional(),
  commentsEnabled: z.boolean().optional(),
});

export type UpdatePostInput = z.infer<typeof updatePostSchema>;

// ─── Comment Schema ──────────────────────────────────────────────────────

export const createCommentSchema = z.object({
  content: z
    .string()
    .min(1, "Comment cannot be empty")
    .max(COMMENT_MAX_LENGTH, `Comment must be at most ${COMMENT_MAX_LENGTH} characters`)
    .trim(),
  parentCommentId: z.string().uuid("Invalid parent comment ID").optional(),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

// ─── Feed Cursor Schema ──────────────────────────────────────────────────

export const feedCursorSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type FeedCursorInput = z.infer<typeof feedCursorSchema>;

// ─── Follow Schema ───────────────────────────────────────────────────────

export const followSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
});

export type FollowInput = z.infer<typeof followSchema>;

// ─── Report Schema ───────────────────────────────────────────────────────

export const reportReasonValues = [
  "spam",
  "harassment",
  "nudity",
  "hate_speech",
  "violence",
  "impersonation",
  "copyright",
  "other",
] as const;

export const createReportSchema = z
  .object({
    reason: z.enum(reportReasonValues),
    details: z.string().max(1000, "Details must be at most 1000 characters").optional(),
    reportedUserId: z.string().uuid().optional(),
    reportedPostId: z.string().uuid().optional(),
    reportedMessageId: z.string().uuid().optional(),
  })
  .refine((data) => data.reportedUserId || data.reportedPostId || data.reportedMessageId, {
    message: "Must specify at least one reported entity",
  });

export type CreateReportInput = z.infer<typeof createReportSchema>;

// ─── Paginated Response Schema (types) ───────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
