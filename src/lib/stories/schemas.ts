/**
 * Zod validation schemas for the Stories system.
 *
 * Server-side schemas are authoritative.
 * All endpoints validate input before processing.
 */

import { z } from "zod";
import {
  STORY_CAPTION_MAX_LENGTH,
  ALLOWED_STORY_IMAGE_TYPES,
  ALLOWED_STORY_VIDEO_TYPES,
} from "./constants";

// ─── Create Story Schema ────────────────────────────────────────────────

export const createStorySchema = z.object({
  mediaId: z.string().uuid("Invalid media ID"),
  caption: z
    .string()
    .max(STORY_CAPTION_MAX_LENGTH, `Caption must be at most ${STORY_CAPTION_MAX_LENGTH} characters`)
    .trim()
    .optional()
    .or(z.literal("")),
  visibility: z.enum(["public", "followers_only"]).default("followers_only"),
});

export type CreateStoryInput = z.infer<typeof createStorySchema>;

// ─── Story Media Schema ─────────────────────────────────────────────────

export const storyMediaUploadSchema = z.object({
  mediaType: z.enum(["image", "video"]),
  storageProvider: z.enum(["telegram", "supabase", "external_cdn"]),
  providerFileId: z.string().min(1, "File ID is required").optional(),
  storagePath: z.string().optional(),
  mimeType: z
    .string()
    .min(1, "MIME type is required")
    .refine(
      (type) =>
        [...ALLOWED_STORY_IMAGE_TYPES, ...ALLOWED_STORY_VIDEO_TYPES].includes(type as any),
      "Invalid MIME type for stories. Allowed: JPEG, PNG, WebP, MP4, MOV, WebM",
    ),
  fileSize: z.number().int().positive("File size must be positive"),
  width: z.number().int().positive("Width must be positive").optional(),
  height: z.number().int().positive("Height must be positive").optional(),
  durationSeconds: z.number().positive().optional(),
});

export type StoryMediaUploadInput = z.infer<typeof storyMediaUploadSchema>;

// ─── Story Reaction Schema ──────────────────────────────────────────────

export const storyReactionTypeValues = [
  "like",
  "love",
  "haha",
  "wow",
  "sad",
] as const;

export const storyReactionSchema = z.object({
  reaction: z.enum(storyReactionTypeValues, {
    errorMap: () => ({ message: "Invalid reaction type" }),
  }),
});

export type StoryReactionInput = z.infer<typeof storyReactionSchema>;

// ─── Story Cursor Schema ────────────────────────────────────────────────

export const storyCursorSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type StoryCursorInput = z.infer<typeof storyCursorSchema>;

// ─── Story Report Schema ────────────────────────────────────────────────

export const storyReportSchema = z.object({
  storyId: z.string().uuid("Invalid story ID"),
  reason: z.enum(
    [
      "spam",
      "harassment",
      "nudity",
      "hate_speech",
      "violence",
      "impersonation",
      "copyright",
      "other",
    ] as const,
  ),
  details: z
    .string()
    .max(1000, "Details must be at most 1000 characters")
    .optional(),
});

export type StoryReportInput = z.infer<typeof storyReportSchema>;
