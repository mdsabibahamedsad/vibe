import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { EnrichedProfile, VerificationStatus, TrustLevel } from '../types';

const PROFILE_CONFIG = {
  bioMaxLength: 500,
  maxPhotos: 9,
  maxPhotoSizeMb: 10,
  minAge: 18,
  maxAge: 120,
  usernameMinLength: 3,
  usernameMaxLength: 30,
  usernamePattern: /^[a-zA-Z0-9_]+$/,
} as const;

const RESERVED_USERNAMES = [
  'admin', 'vibe', 'support', 'moderator', 'official', 'system',
  'help', 'staff', 'security', 'team', 'ceo', 'founder', 'null',
  'undefined', 'api', 'test',
];

function sanitizeText(text: string): string {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

function validateUsername(username: string): string | null {
  if (username.length < PROFILE_CONFIG.usernameMinLength) {
    return `Username must be at least ${PROFILE_CONFIG.usernameMinLength} characters`;
  }
  if (username.length > PROFILE_CONFIG.usernameMaxLength) {
    return `Username must be at most ${PROFILE_CONFIG.usernameMaxLength} characters`;
  }
  if (!PROFILE_CONFIG.usernamePattern.test(username)) {
    return 'Username can only contain letters, numbers, and underscores';
  }
  if (RESERVED_USERNAMES.includes(username.toLowerCase())) {
    return 'This username is reserved';
  }
  return null;
}

export async function getEnrichedProfile(userId: string): Promise<{ profile: EnrichedProfile | null; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { profile: null, error: 'Unauthorized' };

  const { data: blocked } = await supabase
    .from('blocks')
    .select('id')
    .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${userId}),and(blocker_id.eq.${userId},blocked_id.eq.${user.id})`)
    .maybeSingle();

  if (blocked) {
    return { profile: null, error: 'Profile not available' };
  }

  const { data: userData } = await supabase
    .from('user_profiles')
    .select(`
      *,
      dating_profiles (*),
      user_interests (*),
      verification_requests (status),
      privacy_settings (*)
    `)
    .eq('user_id', userId)
    .single();

  if (!userData) return { profile: null, error: 'User not found' };

  const dating = userData.dating_profiles;
  const interests = userData.user_interests || [];
  const verification = userData.verification_requests;
  const privacy = userData.privacy_settings;

  const isOwnProfile = user.id === userId;

  return {
    profile: {
      userId: userData.user_id,
      fullName: userData.full_name || 'Unknown',
      avatarUrl: userData.avatar_url || undefined,
      username: userData.username || undefined,
      dateOfBirth: isOwnProfile || privacy?.show_age ? userData.date_of_birth : undefined,
      gender: isOwnProfile || privacy?.show_gender ? userData.gender : undefined,
      age: isOwnProfile || privacy?.show_age ? calculateAge(userData.date_of_birth) : undefined,
      bio: dating?.bio || undefined,
      occupation: dating?.occupation || undefined,
      education: dating?.education || undefined,
      heightCm: dating?.height_cm || undefined,
      languages: dating?.languages || [],
      interests: interests.map((i: any) => i.interest),
      photos: dating?.photos || [],
      completionScore: await calculateCompletionScore(userId),
      isVerified: verification?.status === 'verified',
      verificationStatus: verification?.status || 'unverified',
      isPremium: userData.subscription_tier && userData.subscription_tier !== 'free',
      isOnline: isOwnProfile || privacy?.show_online_status ? userData.is_online : undefined,
      lastSeen: isOwnProfile || privacy?.show_last_seen ? userData.last_seen_at : undefined,
      distanceKm: undefined,
    },
  };
}

async function calculateCompletionScore(userId: string): Promise<number> {
  const supabase = createServerClient();
  const { data } = await supabase
    .rpc('calculate_profile_completeness', { p_user_id: userId });
  return data || 0;
}

function calculateAge(dateOfBirth?: string): number | undefined {
  if (!dateOfBirth) return undefined;
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export async function setUsername(username: string): Promise<{ success: boolean; error?: string }> {
  const validationError = validateUsername(username);
  if (validationError) return { success: false, error: validationError };

  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: existing } = await supabase
    .from('usernames')
    .select('user_id')
    .eq('username', username.toLowerCase())
    .neq('user_id', user.id)
    .maybeSingle();

  if (existing) return { success: false, error: 'Username is already taken' };

  const { error } = await supabase.from('usernames').upsert({
    user_id: user.id,
    username: username.toLowerCase(),
  }, { onConflict: 'user_id' });

  if (error) return { success: false, error: 'Failed to set username' };
  return { success: true };
}

export async function updatePrivacySettings(settings: {
  showAge?: boolean;
  showDistance?: boolean;
  showOnlineStatus?: boolean;
  showLastSeen?: boolean;
  showRelationshipGoal?: boolean;
  showLifestyle?: boolean;
  discoveryEnabled?: boolean;
  incognitoMode?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.from('privacy_settings').upsert({
    user_id: user.id,
    ...settings,
  }, { onConflict: 'user_id' });

  if (error) return { success: false, error: 'Failed to update privacy settings' };
  return { success: true };
}
