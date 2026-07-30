/**
 * Core application types for Vibe.
 *
 * These types define the shared data structures used across the application.
 * Database-specific types will be added when the schema is created.
 */

/** Generic pagination parameters */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/** Generic paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/** Standard API response wrapper */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/** Application error codes for consistent error handling */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "TELEGRAM_ERROR"
  | "THIRD_PARTY_ERROR"
  // Admin & Moderation specific error codes
  | "NOT_ADMIN"
  | "INSUFFICIENT_PERMISSION"
  | "REPORT_NOT_FOUND"
  | "TARGET_NOT_FOUND"
  | "INVALID_MODERATION_ACTION"
  | "ACTION_NOT_ALLOWED"
  | "ACCOUNT_ALREADY_BANNED"
  | "APPEAL_NOT_ALLOWED";

/** Supported gender options */
export type Gender = "male" | "female" | "non_binary" | "other" | "prefer_not_to_say";

/** Relationship goals for dating preferences */
export type RelationshipGoal =
  "friendship" | "casual_dating" | "serious_relationship" | "networking";
