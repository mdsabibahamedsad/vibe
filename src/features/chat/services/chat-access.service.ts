/**
 * Chat Access Service — centralized authorization for match-based chat.
 *
 * Every chat operation must go through this service to verify:
 *  1. User is authenticated
 *  2. Match exists and is active
 *  3. User is a participant in the match
 *  4. Neither user has blocked the other
 *  5. Neither account is restricted
 *
 * Centralizes these checks so they're not duplicated across API routes.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, authorizationError, notFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ChatAccessResponse } from "@/lib/chat/schemas";

export interface ChatAccessInfo {
  allowed: boolean;
  conversationId: string | null;
  matchId: string;
  otherUserId: string;
  otherUser: {
    id: string;
    displayName: string;
    age: number | null;
    avatarUrl: string | null;
    city: string | null;
  } | null;
  reason?: string;
}

/**
 * Centralized chat access check.
 *
 * Verifies all conditions for accessing a match-based chat.
 * Used by API routes before any chat operation.
 */
export async function canAccessChat(
  currentUserId: string,
  matchId: string,
): Promise<ChatAccessInfo> {
  const adminClient = createAdminClient();

  // Verify match exists and is active
  const { data: match } = await adminClient
    .from("matches")
    .select("id, user_a_id, user_b_id, status")
    .eq("id", matchId)
    .single();

  if (!match) {
    return {
      allowed: false,
      conversationId: null,
      matchId,
      otherUserId: "",
      otherUser: null,
      reason: "Match not found",
    };
  }

  // User must be a participant
  if (match.user_a_id !== currentUserId && match.user_b_id !== currentUserId) {
    return {
      allowed: false,
      conversationId: null,
      matchId,
      otherUserId: "",
      otherUser: null,
      reason: "You are not a participant in this match",
    };
  }

  // Match must be active
  if (match.status !== "active") {
    return {
      allowed: false,
      conversationId: null,
      matchId,
      otherUserId: "",
      otherUser: null,
      reason: "This match is no longer active",
    };
  }

  const otherUserId =
    match.user_a_id === currentUserId ? match.user_b_id : match.user_a_id;

  // Check block relationship (mutual)
  const { count: blockCount } = await adminClient
    .from("blocks")
    .select("*", { count: "exact", head: true })
    .or(
      `and(blocker_id.eq.${currentUserId},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${currentUserId})`,
    );

  if ((blockCount ?? 0) > 0) {
    return {
      allowed: false,
      conversationId: null,
      matchId,
      otherUserId,
      otherUser: null,
      reason: "Chat is unavailable due to a block",
    };
  }

  // Check other user is not banned/deactivated
  const { data: otherUser } = await adminClient
    .from("users")
    .select("id, is_active, is_banned, display_name, avatar_media_id")
    .eq("id", otherUserId)
    .single();

  if (!otherUser || !otherUser.is_active || otherUser.is_banned) {
    return {
      allowed: false,
      conversationId: null,
      matchId,
      otherUserId,
      otherUser: null,
      reason: "This user is no longer available",
    };
  }

  // Get or create the conversation for this match
  const { data: conversationId } = await adminClient.rpc(
    "get_or_create_match_conversation",
    { p_match_id: matchId },
  );

  if (!conversationId) {
    logger.error("Failed to get/create conversation for match", { matchId });
    return {
      allowed: false,
      conversationId: null,
      matchId,
      otherUserId,
      otherUser: null,
      reason: "Failed to access chat",
    };
  }

  // Get other user's profile info (age, city)
  const { data: profile } = await adminClient
    .from("profiles")
    .select("date_of_birth, city")
    .eq("user_id", otherUserId)
    .single();

  // Calculate age from DOB
  let age: number | null = null;
  if (profile?.date_of_birth) {
    const dob = new Date(profile.date_of_birth);
    const today = new Date();
    age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
  }

  return {
    allowed: true,
    conversationId: conversationId as string,
    matchId,
    otherUserId,
    otherUser: {
      id: otherUserId,
      displayName: otherUser.display_name ?? "Unknown",
      age,
      avatarUrl: otherUser.avatar_media_id ?? null,
      city: profile?.city ?? null,
    },
  };
}

/**
 * Throws an AppError if the user cannot access the chat.
 * Returns the access info on success.
 */
export async function requireChatAccess(
  currentUserId: string,
  matchId: string,
): Promise<ChatAccessInfo> {
  const access = await canAccessChat(currentUserId, matchId);

  if (!access.allowed) {
    const message = access.reason ?? "You cannot access this chat";
    throw new AppError("AUTHORIZATION_ERROR", message, { statusCode: 403 });
  }

  return access;
}
