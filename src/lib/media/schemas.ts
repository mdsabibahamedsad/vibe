/**
 * Media Pipeline schemas — Zod validation and TypeScript types.
 */

import { z } from "zod";
import { ALL_MEDIA_PURPOSES, DERIVATIVE_TYPES, ALLOWED_IMAGE_MIME_TYPES, ALLOWED_VIDEO_MIME_TYPES } from "./constants";

// ─── Enums ──────────────────────────────────────────────────────────────

export const derivativeTypeSchema = z.enum([
  DERIVATIVE_TYPES.THUMBNAIL,
  DERIVATIVE_TYPES.SMALL,
  DERIVATIVE_TYPES.MEDIUM,
  DERIVATIVE_TYPES.LARGE,
  DERIVATIVE_TYPES.POSTER,
  DERIVATIVE_TYPES.MOBILE,
  DERIVATIVE_TYPES.STANDARD,
]);

export const mediaPurposeSchema = z.enum(ALL_MEDIA_PURPOSES);

// ─── Upload Schema ──────────────────────────────────────────────────────

export const mediaUploadSchema = z.object({
  purpose: mediaPurposeSchema,
  mimeType: z.string().min(1, "MIME type is required"),
  fileSize: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().positive().optional(),
  storageProvider: z.enum(["telegram", "supabase", "external_cdn"]).default("telegram"),
  providerFileId: z.string().optional(),
  storagePath: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
});

export type MediaUploadInput = z.infer<typeof mediaUploadSchema>;

// ─── Media Access Schema ────────────────────────────────────────────────

export const mediaAccessSchema = z.object({
  mediaId: z.string().uuid(),
  derivative: derivativeTypeSchema.optional(),
});

export type MediaAccessInput = z.infer<typeof mediaAccessSchema>;

// ─── Response Types ─────────────────────────────────────────────────────

export interface MediaRecord {
  id: string;
  ownerId: string;
  mediaType: "image" | "video";
  storageProvider: string;
  providerFileId: string | null;
  storageKey: string | null;
  mimeType: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  thumbnailMediaId: string | null;
  processingStatus: string;
  visibility: string;
  moderationStatus: string;
  version: number;
  createdAt: string;
  deletedAt: string | null;
}

export interface MediaUploadResult {
  id: string;
  mediaType: string;
  mimeType: string;
  processingStatus: string;
  url: string;
  thumbnailUrl: string | null;
  derivatives: MediaDerivativeResult[];
}

export interface MediaDerivativeResult {
  type: string;
  url: string;
  width: number;
  height: number;
  sizeBytes: number | null;
}

export interface MediaAccessResult {
  url: string;
  derivative: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  expiresAt: string | null;
}

// ─── Processing Job Types ───────────────────────────────────────────────

export interface ProcessingJob {
  id: string;
  mediaId: string;
  jobType: string;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  maxAttempts: number;
  errorCode: string | null;
  createdAt: string;
}

// ─── Derivative Query ───────────────────────────────────────────────────

export const derivativeQuerySchema = z.object({
  mediaId: z.string().uuid(),
  types: z.array(derivativeTypeSchema).optional(),
});

export type DerivativeQueryInput = z.infer<typeof derivativeQuerySchema>;
