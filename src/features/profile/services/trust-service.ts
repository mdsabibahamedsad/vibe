import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/get-current-user';

const TRUST_CONFIG = {
  maxFlagsBeforeAutoRestrict: 3,
  minAccountAgeDaysForTrusted: 30,
  minReputationForTrusted: 60,
} as const;

export async function getOwnTrustLevel(): Promise<{
  trustLevel?: string;
  reputation?: number;
  error?: string;
}> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const [trustResult, repResult] = await Promise.all([
    supabase.from('user_trust_levels').select('trust_level').eq('user_id', user.id).maybeSingle(),
    supabase.from('reputation_scores').select('overall_score').eq('user_id', user.id).maybeSingle(),
  ]);

  return {
    trustLevel: trustResult.data?.trust_level || 'new',
    reputation: repResult.data?.overall_score || 50,
  };
}

export async function getUserReputation(userId: string): Promise<{
  score?: number;
  breakdown?: any;
  error?: string;
}> {
  const adminClient = createAdminClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: roleData } = await adminClient
    .from('admin_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['admin', 'super_admin'])
    .maybeSingle();

  if (!roleData) return { error: 'Forbidden' };

  const { data, error } = await adminClient
    .from('reputation_scores')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) return { error: 'Failed to load reputation' };

  return {
    score: data.overall_score,
    breakdown: {
      matchSuccess: data.match_success_score,
      reportPenalty: data.report_penalty,
      spamDetection: data.spam_detection_score,
      completionBonus: data.completion_bonus,
      engagement: data.engagement_score,
      accountAgeDays: data.account_age_days,
    },
  };
}

export async function recalculateTrustLevel(userId: string): Promise<{
  trustLevel?: string;
  error?: string;
}> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc('determine_trust_level', {
    p_user_id: userId,
  });

  if (error) return { error: 'Failed to recalculate trust level' };

  await supabase
    .from('user_trust_levels')
    .upsert({
      user_id: userId,
      trust_level: data,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  return { trustLevel: data };
}

export async function getTrustLevelForUser(userId: string): Promise<{
  trustLevel?: string;
  reason?: string;
  expiresAt?: string;
  error?: string;
}> {
  const adminClient = createAdminClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: roleData } = await adminClient
    .from('admin_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['admin', 'super_admin'])
    .maybeSingle();

  if (!roleData) return { error: 'Forbidden' };

  const { data, error } = await adminClient
    .from('user_trust_levels')
    .select('trust_level, reason, expires_at')
    .eq('user_id', userId)
    .single();

  if (error) return { error: 'Failed to load trust level' };

  return {
    trustLevel: data.trust_level,
    reason: data.reason || undefined,
    expiresAt: data.expires_at || undefined,
  };
}

export async function setTrustLevel(data: {
  userId: string;
  trustLevel: string;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  const adminClient = createAdminClient();
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: roleData } = await adminClient
    .from('admin_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['admin', 'super_admin'])
    .maybeSingle();

  if (!roleData) return { success: false, error: 'Forbidden' };

  const validLevels = ['new', 'trusted', 'highly_trusted', 'restricted'];
  if (!validLevels.includes(data.trustLevel)) {
    return { success: false, error: 'Invalid trust level' };
  }

  const expiresAt = data.trustLevel === 'restricted'
    ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { error } = await adminClient
    .from('user_trust_levels')
    .upsert({
      user_id: data.userId,
      trust_level: data.trustLevel,
      reason: data.reason || null,
      assigned_by: user.id,
      assigned_at: new Date().toISOString(),
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) return { success: false, error: 'Failed to set trust level' };
  return { success: true };
}

export async function flagSuspiciousActivity(data: {
  userId: string;
  flagType: string;
  confidence: number;
  details?: Record<string, any>;
}): Promise<{ success: boolean; error?: string }> {
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from('fake_account_flags')
    .insert({
      user_id: data.userId,
      flag_type: data.flagType,
      confidence: data.confidence,
      details: data.details || {},
      is_active: true,
    });

  if (error) return { success: false, error: 'Failed to create flag' };

  const { count } = await adminClient
    .from('fake_account_flags')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', data.userId)
    .eq('is_active', true);

  if (count && count >= TRUST_CONFIG.maxFlagsBeforeAutoRestrict) {
    await adminClient
      .from('user_trust_levels')
      .upsert({
        user_id: data.userId,
        trust_level: 'restricted',
        reason: `Auto-restricted: ${count} active suspicious flags`,
        assigned_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
  }

  return { success: true };
}

export async function isUserRestricted(userId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { data } = await supabase
    .from('user_trust_levels')
    .select('trust_level, expires_at')
    .eq('user_id', userId)
    .single();

  if (!data) return false;

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return false;
  }

  return data.trust_level === 'restricted';
}
