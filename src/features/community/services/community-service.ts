import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { AppError, notFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type {
  Community,
  CommunityMember,
  CommunityWithMembership,
  CreateCommunityInput,
} from "../types";

export async function getCommunities(): Promise<Community[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("communities")
    .select("*")
    .eq("is_active", true)
    .eq("visibility", "public")
    .order("member_count", { ascending: false })
    .limit(50);

  if (error) {
    logger.error("Failed to fetch communities", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to load communities", { statusCode: 500 });
  }

  return (data ?? []).map(mapCommunity);
}

export async function getCommunityById(id: string): Promise<Community | null> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("communities")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return mapCommunity(data);
}

export async function getCommunityWithMembership(id: string): Promise<CommunityWithMembership | null> {
  const adminClient = createAdminClient();

  const community = await getCommunityById(id);
  if (!community) return null;

  let isMember = false;
  let memberRole: CommunityMember["role"] | null = null;

  try {
    const user = await getCurrentUser();
    if (user) {
      const { data: member } = await adminClient
        .from("community_members")
        .select("role")
        .eq("community_id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (member) {
        isMember = true;
        memberRole = member.role;
      }
    }
  } catch {}

  return { ...community, isMember, memberRole };
}

export async function createCommunity(input: CreateCommunityInput): Promise<Community> {
  const adminClient = createAdminClient();
  const user = await getCurrentUser();

  const slug = input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const { data, error } = await adminClient
    .from("communities")
    .insert({
      name: input.name,
      slug,
      description: input.description ?? null,
      owner_id: user.id,
      visibility: input.visibility ?? "public",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AppError("VALIDATION_ERROR", "A community with this slug already exists", {
        statusCode: 409,
      });
    }
    logger.error("Failed to create community", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to create community", { statusCode: 500 });
  }

  await adminClient.from("community_members").insert({
    community_id: data.id,
    user_id: user.id,
    role: "admin",
  });

  return mapCommunity(data);
}

export async function updateCommunity(id: string, input: Record<string, unknown>): Promise<Community> {
  const adminClient = createAdminClient();
  await getCurrentUser();

  const { data, error } = await adminClient
    .from("communities")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    logger.error("Failed to update community", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to update community", { statusCode: 500 });
  }

  return mapCommunity(data);
}

export async function deleteCommunity(id: string): Promise<void> {
  const adminClient = createAdminClient();
  await getCurrentUser();

  const { error } = await adminClient
    .from("communities")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", id);

  if (error) {
    logger.error("Failed to delete community", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to delete community", { statusCode: 500 });
  }
}

export async function joinCommunity(communityId: string): Promise<CommunityMember> {
  const adminClient = createAdminClient();
  const user = await getCurrentUser();

  const { data: existing } = await adminClient
    .from("community_members")
    .select("*")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    throw new AppError("VALIDATION_ERROR", "Already a member of this community", {
      statusCode: 409,
    });
  }

  const { data, error } = await adminClient
    .from("community_members")
    .insert({ community_id: communityId, user_id: user.id })
    .select()
    .single();

  if (error) {
    logger.error("Failed to join community", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to join community", { statusCode: 500 });
  }

  try {
    await adminClient.rpc("increment_community_member_count", { community_id: communityId });
  } catch {}

  return { communityId: data.community_id, userId: data.user_id, role: data.role, joinedAt: data.joined_at };
}

export async function leaveCommunity(communityId: string): Promise<void> {
  const adminClient = createAdminClient();
  const user = await getCurrentUser();

  const { error } = await adminClient
    .from("community_members")
    .delete()
    .eq("community_id", communityId)
    .eq("user_id", user.id);

  if (error) {
    logger.error("Failed to leave community", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to leave community", { statusCode: 500 });
  }

  try {
    await adminClient.rpc("decrement_community_member_count", { community_id: communityId });
  } catch {}
}

export async function getCommunityMembers(
  communityId: string,
): Promise<(CommunityMember & { displayName: string; avatarUrl: string | null })[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("community_members")
    .select("*, users!inner(id, display_name, avatar_media_id)")
    .eq("community_id", communityId)
    .order("joined_at", { ascending: false });

  if (error) {
    logger.error("Failed to fetch community members", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to load members", { statusCode: 500 });
  }

  return (data ?? []).map((m: Record<string, unknown>) => ({
    communityId: m.community_id as string,
    userId: m.user_id as string,
    role: m.role as CommunityMember["role"],
    joinedAt: m.joined_at as string,
    displayName: (m.users as Record<string, unknown>)?.display_name as string || "Unknown",
    avatarUrl: (m.users as Record<string, unknown>)?.avatar_media_id as string | null,
  }));
}

export async function getMyCommunities(): Promise<CommunityWithMembership[]> {
  const adminClient = createAdminClient();
  const user = await getCurrentUser();

  const { data: memberships, error } = await adminClient
    .from("community_members")
    .select("community_id, role, communities!inner(*)")
    .eq("user_id", user.id);

  if (error) {
    logger.error("Failed to fetch my communities", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to load communities", { statusCode: 500 });
  }

  return (memberships ?? []).map((m: Record<string, unknown>) => {
    const c = m.communities as Record<string, unknown>;
    return {
      ...mapCommunity(c),
      isMember: true,
      memberRole: m.role as CommunityMember["role"],
    };
  });
}

export async function searchCommunities(query: string): Promise<Community[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("communities")
    .select("*")
    .eq("is_active", true)
    .eq("visibility", "public")
    .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
    .order("member_count", { ascending: false })
    .limit(10);

  if (error) {
    logger.error("Failed to search communities", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to search communities", { statusCode: 500 });
  }

  return (data ?? []).map(mapCommunity);
}

function mapCommunity(data: Record<string, unknown>): Community {
  return {
    id: data.id as string,
    name: data.name as string,
    slug: data.slug as string,
    description: data.description as string | null,
    ownerId: data.owner_id as string,
    avatarMediaId: data.avatar_media_id as string | null,
    visibility: data.visibility as "public" | "private",
    isActive: data.is_active as boolean,
    memberCount: data.member_count as number,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    deletedAt: data.deleted_at as string | null,
  };
}
