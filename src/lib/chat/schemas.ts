import { z } from "zod";
import {
  MAX_MESSAGE_LENGTH,
  ALLOWED_MESSAGE_TYPES,
  MAX_CHAT_IMAGE_SIZE_BYTES,
  MAX_CHAT_VIDEO_SIZE_BYTES,
  MAX_CHAT_VIDEO_DURATION_SECONDS,
} from "./constants";

/**
 * Schema for sending a chat message.
 */
export const sendMessageSchema = z.object({
  matchId: z.string().uuid("Invalid match ID"),
  messageType: z.enum(ALLOWED_MESSAGE_TYPES, {
    errorMap: () => ({ message: "Message type must be text, image, or video" }),
  }),
  textContent: z
    .string()
    .max(MAX_MESSAGE_LENGTH, `Message must be under ${MAX_MESSAGE_LENGTH} characters`)
    .optional()
    .default(""),
  mediaId: z.string().uuid("Invalid media ID").optional(),
  replyToMessageId: z.string().uuid("Invalid reply target").optional(),
  clientMessageId: z.string().uuid("Invalid client message ID").optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/**
 * Schema for listing messages with cursor pagination.
 */
export const messageListSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export type MessageListInput = z.infer<typeof messageListSchema>;

/**
 * Schema for typing indicator.
 */
export const typingSchema = z.object({
  matchId: z.string().uuid("Invalid match ID"),
  isTyping: z.boolean(),
});

export type TypingInput = z.infer<typeof typingSchema>;

/**
 * Schema for marking chat as read.
 */
export const markChatReadSchema = z.object({
  lastReadMessageId: z.string().uuid("Invalid message ID").optional(),
});

export type MarkChatReadInput = z.infer<typeof markChatReadSchema>;

/**
 * Schema for uploading chat media.
 */
export const chatMediaUploadSchema = z.object({
  matchId: z.string().uuid("Invalid match ID"),
  mediaType: z.enum(["image", "video"], {
    errorMap: () => ({ message: "Media type must be image or video" }),
  }),
  mimeType: z.string().min(1, "MIME type is required"),
});

export type ChatMediaUploadInput = z.infer<typeof chatMediaUploadSchema>;

/**
 * Schema for message deletion.
 */
export const deleteMessageSchema = z.object({
  messageId: z.string().uuid("Invalid message ID"),
});

export type DeleteMessageInput = z.infer<typeof deleteMessageSchema>;

/**
 * Message type for API responses.
 */
export interface MessageResponse {
  id: string;
  matchId: string;
  senderId: string;
  messageType: "text" | "image" | "video" | "system";
  textContent: string | null;
  mediaId: string | null;
  replyToMessageId: string | null;
  replyPreview: {
    senderName: string;
    text: string;
  } | null;
  status: "sent" | "delivered" | "read";
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
  isOwn: boolean;
  sender: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface MessageListResponse {
  messages: MessageResponse[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SendMessageResponse {
  success: boolean;
  message: MessageResponse;
}

export interface ChatAccessResponse {
  allowed: boolean;
  conversationId: string | null;
  matchId: string;
  otherUser: {
    id: string;
    displayName: string;
    age: number | null;
    avatarUrl: string | null;
    city: string | null;
  } | null;
  reason?: string;
}
