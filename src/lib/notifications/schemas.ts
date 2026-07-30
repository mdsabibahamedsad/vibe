import { z } from "zod";
import { NOTIFICATION_PAGE_SIZE } from "./constants";

// ─── API Response Types ─────────────────────────────────────────────────

export interface NotificationActor {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  actor: NotificationActor | null;
  entityType: string | null;
  entityId: string | null;
  groupKey: string | null;
  title: string | null;
  body: string | null;
  readAt: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface UnreadCountResponse {
  total: number;
  messages: number;
  dating: number;
  social: number;
  system: number;
}

export interface NotificationPreferences {
  inAppEnabled: boolean;
  matchNotifications: boolean;
  messageNotifications: boolean;
  followNotifications: boolean;
  postNotifications: boolean;
  storyNotifications: boolean;
  systemNotifications: boolean;
  telegramEnabled: boolean;
  telegramActivated: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string;
}

// ─── Zod Schemas ────────────────────────────────────────────────────────

export const notificationListSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(NOTIFICATION_PAGE_SIZE),
  category: z.enum(["all", "messages", "dating", "social", "system"]).optional(),
});

export type NotificationListInput = z.infer<typeof notificationListSchema>;

export const markReadSchema = z.object({
  notificationId: z.string().uuid("Invalid notification ID"),
});

export const notificationPreferencesSchema = z.object({
  inAppEnabled: z.boolean().optional(),
  matchNotifications: z.boolean().optional(),
  messageNotifications: z.boolean().optional(),
  followNotifications: z.boolean().optional(),
  postNotifications: z.boolean().optional(),
  storyNotifications: z.boolean().optional(),
  systemNotifications: z.boolean().optional(),
  telegramEnabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().optional(),
  quietHoursEnd: z.string().optional(),
  timezone: z.string().optional(),
});

export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;
