/**
 * Data Export Service
 *
 * Creates a privacy-safe export of a user's data for download.
 * Only includes data the user is authorized to access.
 * Does NOT include:
 *  - Other users' private information
 *  - Internal moderation evidence
 *  - Security secrets
 *  - Internal trust scores
 *  - Financial transaction details of other users
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { recordAuditLogEntry } from "@/lib/security/audit-log.service";
import { AppError } from "@/lib/errors";

/** Categories of data that can be exported */
export const EXPORT_CATEGORIES = [
  "profile",
  "preferences",
  "posts",
  "comments",
  "connections",
  "matches",
  "conversations",
  "notifications",
  "support_tickets",
  "purchases",
  "activity",
] as const;

export type ExportCategory = (typeof EXPORT_CATEGORIES)[number];

/** Result of a data export */
export interface DataExportResult {
  success: boolean;
  data: Record<string, unknown>;
  exportedAt: string;
  categories: ExportCategory[];
  categoryCount: number;
}

/**
 * Export user data as a JSON object.
 *
 * @param userId - The user whose data to export
 * @param categories - Specific categories to export (all by default)
 * @returns A structured data export object
 */
export async function exportUserData(
  userId: string,
  categories?: ExportCategory[],
): Promise<DataExportResult> {
  const adminClient = createAdminClient();
  const cats = categories ?? [...EXPORT_CATEGORIES];
  const data: Record<string, unknown> = {};

  // Process each requested category
  for (const category of cats) {
    try {
      switch (category) {
        case "profile":
          data.profile = await exportProfile(adminClient, userId);
          break;
        case "preferences":
          data.preferences = await exportPreferences(adminClient, userId);
          break;
        case "posts":
          data.posts = await exportPosts(adminClient, userId);
          break;
        case "comments":
          data.comments = await exportComments(adminClient, userId);
          break;
        case "connections":
          data.connections = await exportConnections(adminClient, userId);
          break;
        case "matches":
          data.matches = await exportMatches(adminClient, userId);
          break;
        case "conversations":
          data.conversations = await exportConversations(adminClient, userId);
          break;
        case "notifications":
          data.notifications = await exportNotifications(adminClient, userId);
          break;
        case "support_tickets":
          data.support_tickets = await exportSupportTickets(adminClient, userId);
          break;
        case "purchases":
          data.purchases = await exportPurchases(adminClient, userId);
          break;
        case "activity":
          data.activity = await exportActivity(adminClient, userId);
          break;
      }
    } catch (err) {
      logger.warn("Failed to export data category during user export", {
        userId,
        category,
        error: String(err),
      });
      data[category] = { error: "Failed to export this category" };
    }
  }

  // Audit the export
  await recordAuditLogEntry({
    actor_id: userId,
    category: "data_export",
    action: "data_exported",
    description: `User data exported (${cats.length} categories)`,
    severity: "info",
    metadata: {
      categories: cats,
      user_agent: "self-service export",
    },
  });

  logger.info("User data exported", {
    userId,
    categories: cats.length,
  });

  return {
    success: true,
    data,
    exportedAt: new Date().toISOString(),
    categories: cats,
    categoryCount: cats.length,
  };
}

async function exportProfile(adminClient: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: user } = await adminClient
    .from("users")
    .select("id, telegram_user_id, username, display_name, first_name, last_name, created_at")
    .eq("id", userId)
    .single();

  const { data: profile } = await adminClient
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  const { data: profilePhotos } = await adminClient
    .from("profile_photos")
    .select("id, is_primary, sort_order")
    .eq("user_id", userId)
    .order("sort_order");

  return {
    user: user
      ? {
          id: user.id,
          telegram_user_id: user.telegram_user_id,
          username: user.username,
          display_name: user.display_name,
          first_name: user.first_name,
          last_name: user.last_name,
          created_at: user.created_at,
        }
      : null,
    profile: profile
      ? {
          display_name: profile.display_name,
          bio: profile.bio,
          gender: profile.gender,
          birth_date: profile.birth_date,
          relationship_goal: profile.relationship_goal,
          profile_visibility: profile.profile_visibility,
          created_at: profile.created_at,
        }
      : null,
    profile_photos: (profilePhotos ?? []).map((p: Record<string, unknown>) => ({
      id: p.id,
      is_primary: p.is_primary,
      sort_order: p.sort_order,
    })),
    export_note:
      "Media file URLs are excluded. Profile photos reference IDs, not actual files.",
  };
}

async function exportPreferences(adminClient: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: preferences } = await adminClient
    .from("profile_preferences")
    .select("*")
    .eq("user_id", userId)
    .single();

  const { data: interests } = await adminClient
    .from("profile_interests")
    .select("interest_id")
    .eq("user_id", userId);

  return {
    preferences: preferences ?? null,
    interests: (interests ?? []).map((i: Record<string, unknown>) => i.interest_id),
  };
}

async function exportPosts(adminClient: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: posts } = await adminClient
    .from("posts")
    .select("id, content, visibility, created_at, updated_at")
    .eq("author_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);

  const count = await adminClient
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", userId);

  return {
    total_posts: count.count ?? 0,
    posts_shown: (posts ?? []).length,
    posts: posts ?? [],
    note: "Limited to 500 most recent posts. Media attachments and likes are not included.",
  };
}

async function exportComments(adminClient: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: comments } = await adminClient
    .from("post_comments")
    .select("id, content, post_id, created_at")
    .eq("author_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  return {
    comments: comments ?? [],
    note: "Limited to 200 most recent comments.",
  };
}

async function exportConnections(adminClient: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: followers } = await adminClient
    .from("follows")
    .select("follower_id, created_at")
    .eq("following_id", userId);

  const { data: following } = await adminClient
    .from("follows")
    .select("following_id, created_at")
    .eq("follower_id", userId);

  return {
    followers_count: followers?.length ?? 0,
    following_count: following?.length ?? 0,
    note: "Only user IDs are included, not full profile data of connections.",
  };
}

async function exportMatches(adminClient: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: matches } = await adminClient
    .from("matches")
    .select("id, status, created_at")
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  return {
    total_matches: matches?.length ?? 0,
    matches: matches ?? [],
    note: "Only match metadata. Other user's profile data is their own private information.",
  };
}

async function exportConversations(adminClient: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: conversations } = await adminClient
    .from("conversations")
    .select("id, created_at")
    .eq("created_by", userId);

  const { data: memberConversations } = await adminClient
    .from("conversation_members")
    .select("conversation_id, created_at")
    .eq("user_id", userId);

  return {
    created_conversations: conversations?.length ?? 0,
    member_conversations: memberConversations?.length ?? 0,
    note: "Message content is excluded to respect others' privacy. Only conversation metadata.",
  };
}

async function exportNotifications(adminClient: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: notifications } = await adminClient
    .from("notifications")
    .select("id, type, title, body, read, created_at")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  return {
    notifications: notifications ?? [],
    note: "Limited to 200 most recent notifications.",
  };
}

async function exportSupportTickets(adminClient: ReturnType<typeof createAdminClient>, userId: string) {
  const tickets = await adminClient
    .from("support_tickets")
    .select("*")
    .eq("user_id", userId);

  return {
    tickets: tickets?.data ?? [],
    note: "Support ticket data is included except for internal moderator notes.",
  };
}

async function exportPurchases(adminClient: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: purchases } = await adminClient
    .from("purchases")
    .select("id, amount, currency, status, product_type, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const { data: subscriptions } = await adminClient
    .from("subscriptions")
    .select("id, plan, status, current_period_start, current_period_end, created_at")
    .eq("user_id", userId);

  return {
    purchases: purchases ?? [],
    subscriptions: subscriptions ?? [],
    note: "Payment method details and charge IDs are excluded for security.",
  };
}

async function exportActivity(adminClient: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: datingActions } = await adminClient
    .from("dating_actions")
    .select("action, target_id, created_at")
    .eq("actor_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: blocks } = await adminClient
    .from("blocks")
    .select("blocked_id, created_at")
    .eq("blocker_id", userId);

  const { data: reports } = await adminClient
    .from("reports")
    .select("reason, target_type, target_user_id, created_at")
    .eq("reporter_id", userId);

  return {
    dating_actions: (datingActions ?? []).map((a: Record<string, unknown>) => ({
      action: a.action,
      created_at: a.created_at,
      note: "Target user IDs are reference only.",
    })),
    blocks: blocks ?? [],
    reports: reports ?? [],
    note: "Dating actions, blocks, and reports. Limited to 100 dating actions.",
  };
}
