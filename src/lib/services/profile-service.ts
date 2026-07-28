/**
 * Profile service — server-side operations for user profiles.
 *
 * All operations require an authenticated admin client.
 * The user identity is derived from the session, NOT from client-provided IDs.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { calculateAge, isAdult } from "@/lib/validation/profile";
import type {
  ProfileInput,
  PreferencesInput,
  InterestSelectionInput,
} from "@/lib/validation/profile";

// ─── Profile ─────────────────────────────────────────────────────────────

export interface ProfileResult {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  dateOfBirth: string | null;
  age: number | null;
  gender: string | null;
  city: string | null;
  country: string | null;
  datingIntent: string | null;
  profileVisibility: string;
  isVerified: boolean;
  profileCompletionPct: number;
  photos: ProfilePhotoResult[];
  interests: InterestResult[];
  createdAt: string;
  updatedAt: string;
}

export interface ProfilePhotoResult {
  id: string;
  mediaId: string | null;
  telegramFileId: string | null;
  sortOrder: number;
  isPrimary: boolean;
  mediaUrl?: string | null;
}

export interface InterestResult {
  id: string;
  name: string;
  slug: string;
  category: string | null;
}

/**
 * Get the full profile for a user.
 */
export async function getProfile(userId: string): Promise<ProfileResult | null> {
  const adminClient = createAdminClient();

  // Get user + profile
  const { data: user, error: userError } = await adminClient
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();

  if (userError || !user) return null;

  const { data: profile } = await adminClient
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  // Get photos
  const { data: photos } = await adminClient
    .from("profile_photos")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  // Get interests with names
  const { data: profileInterests } = await adminClient
    .from("profile_interests")
    .select("interest_id")
    .eq("profile_id", profile?.id);

  let interests: InterestResult[] = [];
  if (profileInterests && profileInterests.length > 0) {
    const interestIds = profileInterests.map((pi) => pi.interest_id);
    const { data: interestData } = await adminClient
      .from("interests")
      .select("*")
      .in("id", interestIds)
      .eq("is_active", true);

    if (interestData) {
      interests = interestData.map((i) => ({
        id: i.id,
        name: i.name,
        slug: i.slug,
        category: i.category,
      }));
    }
  }

  const age = profile?.date_of_birth ? calculateAge(profile.date_of_birth) : null;

  return {
    id: profile?.id ?? "",
    userId: user.id,
    displayName: user.display_name,
    bio: profile?.bio ?? null,
    dateOfBirth: profile?.date_of_birth ?? null,
    age,
    gender: profile?.gender ?? null,
    city: profile?.city ?? null,
    country: profile?.country ?? null,
    datingIntent: profile?.dating_intent ?? null,
    profileVisibility: profile?.profile_visibility ?? "public",
    isVerified: profile?.is_verified ?? false,
    profileCompletionPct: profile?.profile_completion_pct ?? 0,
    photos: (photos ?? []).map((p) => ({
      id: p.id,
      mediaId: p.media_id,
      telegramFileId: p.telegram_file_id,
      sortOrder: p.sort_order,
      isPrimary: p.is_primary,
    })),
    interests,
    createdAt: profile?.created_at ?? user.created_at,
    updatedAt: profile?.updated_at ?? user.updated_at,
  };
}

/**
 * Create or update a user's profile.
 */
export async function upsertProfile(userId: string, data: ProfileInput): Promise<ProfileResult> {
  const adminClient = createAdminClient();

  // Validate age (18+ requirement)
  if (!isAdult(data.dateOfBirth)) {
    throw new AppError("VALIDATION_ERROR", "You must be at least 18 years old to use Vibe", {
      statusCode: 400,
    });
  }

  // Upsert the profile
  const { error: profileError } = await adminClient.from("profiles").upsert(
    {
      user_id: userId,
      bio: data.bio || null,
      date_of_birth: data.dateOfBirth,
      gender: data.gender,
      city: data.city,
      country: data.country,
      dating_intent: data.datingIntent,
    },
    { onConflict: "user_id" },
  );

  if (profileError) {
    throw new AppError("INTERNAL_ERROR", "Failed to save profile", {
      statusCode: 500,
      context: { error: profileError.message },
    });
  }

  // Update display name on users table
  const { error: userError } = await adminClient
    .from("users")
    .update({ display_name: data.displayName })
    .eq("id", userId);

  if (userError) {
    throw new AppError("INTERNAL_ERROR", "Failed to update display name", {
      statusCode: 500,
      context: { error: userError.message },
    });
  }

  return (await getProfile(userId))!;
}

/**
 * Update specific profile fields (partial update).
 */
export async function updateProfile(
  userId: string,
  data: Partial<ProfileInput>,
): Promise<ProfileResult> {
  const adminClient = createAdminClient();
  const updateData: Record<string, unknown> = {};

  if (data.bio !== undefined) updateData.bio = data.bio || null;
  if (data.dateOfBirth !== undefined) {
    if (!isAdult(data.dateOfBirth)) {
      throw new AppError("VALIDATION_ERROR", "You must be at least 18 years old", {
        statusCode: 400,
      });
    }
    updateData.date_of_birth = data.dateOfBirth;
  }
  if (data.gender !== undefined) updateData.gender = data.gender;
  if (data.city !== undefined) updateData.city = data.city;
  if (data.country !== undefined) updateData.country = data.country;
  if (data.datingIntent !== undefined) updateData.dating_intent = data.datingIntent;

  if (Object.keys(updateData).length > 0) {
    const { error } = await adminClient.from("profiles").update(updateData).eq("user_id", userId);

    if (error) {
      throw new AppError("INTERNAL_ERROR", "Failed to update profile", {
        statusCode: 500,
        context: { error: error.message },
      });
    }
  }

  if (data.displayName) {
    const { error } = await adminClient
      .from("users")
      .update({ display_name: data.displayName })
      .eq("id", userId);

    if (error) {
      throw new AppError("INTERNAL_ERROR", "Failed to update display name", {
        statusCode: 500,
        context: { error: error.message },
      });
    }
  }

  return (await getProfile(userId))!;
}

// ─── Preferences ─────────────────────────────────────────────────────────

/**
 * Get discovery preferences for a user.
 */
export async function getPreferences(userId: string) {
  const adminClient = createAdminClient();

  const { data } = await adminClient
    .from("profile_preferences")
    .select("*")
    .eq("user_id", userId)
    .single();

  return data
    ? {
        minAge: data.min_age,
        maxAge: data.max_age,
        preferredGenders: data.preferred_genders,
        maxDistanceKm: data.max_distance_km,
        datingIntent: data.dating_intent,
        discoveryEnabled: data.discovery_enabled,
        showInDiscovery: data.show_in_discovery,
      }
    : null;
}

/**
 * Create or update discovery preferences.
 */
export async function upsertPreferences(userId: string, data: PreferencesInput) {
  const adminClient = createAdminClient();

  const { error } = await adminClient.from("profile_preferences").upsert(
    {
      user_id: userId,
      min_age: data.minAge,
      max_age: data.maxAge,
      preferred_genders: data.preferredGenders ?? null,
      max_distance_km: data.maxDistanceKm,
      dating_intent: data.datingIntent ?? null,
      discovery_enabled: data.discoveryEnabled ?? true,
      show_in_discovery: data.showInDiscovery ?? true,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to save preferences", {
      statusCode: 500,
      context: { error: error.message },
    });
  }

  return getPreferences(userId);
}

// ─── Interests ───────────────────────────────────────────────────────────

/**
 * Get all available interests.
 */
export async function getAllInterests(): Promise<InterestResult[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("interests")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to load interests", {
      statusCode: 500,
      context: { error: error.message },
    });
  }

  return (data ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    slug: i.slug,
    category: i.category,
  }));
}

/**
 * Get the profile ID for a user.
 */
async function getProfileId(userId: string): Promise<string> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new AppError("NOT_FOUND", "Profile not found. Complete onboarding first.", {
      statusCode: 404,
    });
  }

  return data.id;
}

/**
 * Set interests for a user profile (replaces all existing).
 */
export async function setProfileInterests(
  userId: string,
  data: InterestSelectionInput,
): Promise<InterestResult[]> {
  const adminClient = createAdminClient();
  const profileId = await getProfileId(userId);

  // Delete existing interests
  const { error: deleteError } = await adminClient
    .from("profile_interests")
    .delete()
    .eq("profile_id", profileId);

  if (deleteError) {
    throw new AppError("INTERNAL_ERROR", "Failed to update interests", {
      statusCode: 500,
      context: { error: deleteError.message },
    });
  }

  // Insert new interests
  if (data.interestIds.length > 0) {
    const inserts = data.interestIds.map((interestId) => ({
      profile_id: profileId,
      interest_id: interestId,
    }));

    const { error: insertError } = await adminClient.from("profile_interests").insert(inserts);

    if (insertError) {
      throw new AppError("INTERNAL_ERROR", "Failed to save interests", {
        statusCode: 500,
        context: { error: insertError.message },
      });
    }
  }

  // Return the updated interests
  const profile = await getProfile(userId);
  return profile?.interests ?? [];
}

// ─── Profile Completion ──────────────────────────────────────────────────

/**
 * Calculate profile completion percentage from cached DB value.
 * Falls back to server-side calculation if needed.
 */
export async function getProfileCompletion(userId: string): Promise<number> {
  const adminClient = createAdminClient();

  const { data: profile } = await adminClient
    .from("profiles")
    .select("profile_completion_pct")
    .eq("user_id", userId)
    .single();

  return profile?.profile_completion_pct ?? 0;
}

// ─── Deactivation ────────────────────────────────────────────────────────

/**
 * Deactivate a user account (soft delete — sets is_active = false).
 */
export async function deactivateAccount(userId: string): Promise<void> {
  const adminClient = createAdminClient();

  const { error } = await adminClient.from("users").update({ is_active: false }).eq("id", userId);

  if (error) {
    throw new AppError("INTERNAL_ERROR", "Failed to deactivate account", {
      statusCode: 500,
      context: { error: error.message },
    });
  }
}
