/**
 * Zod validation schemas for profile data.
 *
 * Server-side schemas are authoritative.
 * Client-side schemas should match but the server always validates.
 */

import { z } from "zod";

// ─── Constants ───────────────────────────────────────────────────────────

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 50;
export const BIO_MAX = 500;
export const MIN_AGE = 18;
export const MAX_AGE = 100;
export const MAX_INTERESTS = 15;
export const MIN_INTERESTS = 1;
export const MAX_PHOTOS = 10;
export const MAX_VIDEO_DURATION_SECONDS = 60;
export const MAX_IMAGE_SIZE_MB = 10;
export const MAX_VIDEO_SIZE_MB = 50;
export const MAX_DISTANCE_KM = 500;
export const MIN_DISTANCE_KM = 1;

// ─── Gender enum (must match DB) ─────────────────────────────────────────
const genderValues = ["male", "female", "non_binary", "prefer_not_to_say"] as const;

// ─── Dating intent enum (must match DB) ──────────────────────────────────
const datingIntentValues = ["dating", "friendship", "chat", "relationship", "not_sure"] as const;

// ─── Allowed MIME types ──────────────────────────────────────────────────
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

// ─── Profile Schema ──────────────────────────────────────────────────────
export const profileSchema = z.object({
  displayName: z
    .string()
    .min(DISPLAY_NAME_MIN, `Display name must be at least ${DISPLAY_NAME_MIN} characters`)
    .max(DISPLAY_NAME_MAX, `Display name must be at most ${DISPLAY_NAME_MAX} characters`)
    .trim(),
  bio: z
    .string()
    .max(BIO_MAX, `Bio must be at most ${BIO_MAX} characters`)
    .trim()
    .optional()
    .or(z.literal("")),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be in YYYY-MM-DD format"),
  gender: z.enum(genderValues, {
    errorMap: () => ({ message: "Please select a valid gender" }),
  }),
  city: z
    .string()
    .min(1, "City is required")
    .max(100, "City must be at most 100 characters")
    .trim(),
  country: z
    .string()
    .min(1, "Country is required")
    .max(100, "Country must be at most 100 characters")
    .trim(),
  datingIntent: z.enum(datingIntentValues, {
    errorMap: () => ({ message: "Please select a valid dating/social intent" }),
  }),
});

export type ProfileInput = z.infer<typeof profileSchema>;

// ─── Profile Update Schema (partial) ─────────────────────────────────────
export const profileUpdateSchema = profileSchema.partial();

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

// ─── Discovery Preferences Schema ────────────────────────────────────────
export const preferencesSchema = z
  .object({
    minAge: z
      .number()
      .int()
      .min(MIN_AGE, `Minimum age must be at least ${MIN_AGE}`)
      .max(MAX_AGE, `Minimum age must be at most ${MAX_AGE}`),
    maxAge: z
      .number()
      .int()
      .min(MIN_AGE, `Maximum age must be at least ${MIN_AGE}`)
      .max(MAX_AGE, `Maximum age must be at most ${MAX_AGE}`),
    preferredGenders: z
      .array(z.enum(genderValues))
      .min(1, "Select at least one gender preference")
      .optional(),
    maxDistanceKm: z
      .number()
      .int()
      .min(MIN_DISTANCE_KM, `Distance must be at least ${MIN_DISTANCE_KM} km`)
      .max(MAX_DISTANCE_KM, `Distance must be at most ${MAX_DISTANCE_KM} km`),
    datingIntent: z.enum(datingIntentValues).optional(),
    discoveryEnabled: z.boolean().optional(),
    showInDiscovery: z.boolean().optional(),
  })
  .refine((data) => data.minAge <= data.maxAge, {
    message: "Minimum age must be less than or equal to maximum age",
    path: ["minAge"],
  });

export type PreferencesInput = z.infer<typeof preferencesSchema>;

// ─── Media Schema ────────────────────────────────────────────────────────
export const mediaUploadSchema = z.object({
  mediaType: z.enum(["image", "video"]),
  storageProvider: z.enum(["telegram", "supabase", "external_cdn"]),
  providerFileId: z.string().min(1, "File ID is required").optional(),
  storagePath: z.string().optional(),
  mimeType: z.string().min(1, "MIME type is required"),
  fileSize: z.number().int().positive("File size must be positive"),
  width: z.number().int().positive("Width must be positive").optional(),
  height: z.number().int().positive("Height must be positive").optional(),
  durationSeconds: z.number().positive().optional(),
});

export type MediaUploadInput = z.infer<typeof mediaUploadSchema>;

// ─── Media Reorder Schema ────────────────────────────────────────────────
export const mediaReorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        sortOrder: z.number().int().min(0),
      }),
    )
    .min(1, "At least one item is required"),
});

export type MediaReorderInput = z.infer<typeof mediaReorderSchema>;

// ─── Interest Selection Schema ───────────────────────────────────────────
export const interestSelectionSchema = z.object({
  interestIds: z
    .array(z.string().uuid())
    .min(MIN_INTERESTS, `Select at least ${MIN_INTERESTS} interest`)
    .max(MAX_INTERESTS, `You can select at most ${MAX_INTERESTS} interests`),
});

export type InterestSelectionInput = z.infer<typeof interestSelectionSchema>;

// ─── Age Verification ────────────────────────────────────────────────────
export function calculateAge(dateOfBirth: string): number {
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

export function isAdult(dateOfBirth: string): boolean {
  return calculateAge(dateOfBirth) >= MIN_AGE;
}
