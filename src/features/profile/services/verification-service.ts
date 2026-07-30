import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/get-current-user';

const VERIFICATION_CONFIG = {
  maxSelfieSizeMb: 10,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxRequestsPerDay: 3,
} as const;

export async function requestVerification(formData: FormData): Promise<{
  success: boolean;
  requestId?: string;
  error?: string;
}> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('verification_requests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', today.toISOString());

  if (count && count >= VERIFICATION_CONFIG.maxRequestsPerDay) {
    return { success: false, error: 'Too many verification requests. Please try again tomorrow.' };
  }

  const { data: existingPending } = await supabase
    .from('verification_requests')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingPending) {
    return { success: false, error: 'You already have a pending verification request.' };
  }

  const file = formData.get('selfie') as File;
  if (!file) return { success: false, error: 'No selfie provided' };

  const allowedMimeTypes: readonly string[] = VERIFICATION_CONFIG.allowedMimeTypes;
  if (!allowedMimeTypes.includes(file.type)) {
    return { success: false, error: 'Invalid file type. Accepted: JPEG, PNG, WebP' };
  }

  if (file.size > VERIFICATION_CONFIG.maxSelfieSizeMb * 1024 * 1024) {
    return { success: false, error: `File too large. Maximum ${VERIFICATION_CONFIG.maxSelfieSizeMb}MB` };
  }

  const ext = file.type.split('/')[1];
  const filePath = `${user.id}/selfie_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('verification-media')
    .upload(filePath, file);

  if (uploadError) return { success: false, error: 'Failed to upload selfie' };

  const { data: request, error } = await supabase
    .from('verification_requests')
    .insert({
      user_id: user.id,
      status: 'pending',
      selfie_url: filePath,
      notes: formData.get('notes') as string || undefined,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: 'Failed to create verification request' };

  return { success: true, requestId: request.id };
}

export async function getVerificationStatus(): Promise<{
  status?: string;
  rejectionReason?: string;
  requestedAt?: string;
  error?: string;
}> {
  const supabase = createServerClient();
  const user = await getCurrentUser();
  if (!user) return { error: 'Unauthorized' };

  const { data } = await supabase
    .from('verification_requests')
    .select('status, rejection_reason, requested_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { status: 'unverified' };

  return {
    status: data.status,
    rejectionReason: data.rejection_reason || undefined,
    requestedAt: data.requested_at || data.created_at,
  };
}

export async function listPendingVerifications(): Promise<{
  requests: any[];
  error?: string;
}> {
  const adminClient = createAdminClient();
  const user = await getCurrentUser();
  if (!user) return { requests: [], error: 'Unauthorized' };

  const { data: roleData } = await adminClient
    .from('admin_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['admin', 'super_admin'])
    .maybeSingle();

  if (!roleData) return { requests: [], error: 'Forbidden' };

  const { data, error } = await adminClient
    .from('verification_requests')
    .select(`
      id,
      user_id,
      status,
      selfie_url,
      notes,
      requested_at,
      created_at,
      user_profiles!inner(full_name, avatar_url)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) return { requests: [], error: 'Failed to load requests' };

  return { requests: data || [] };
}

export async function reviewVerificationRequest(data: {
  requestId: string;
  status: 'verified' | 'rejected';
  rejectionReason?: string;
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

  const { data: request } = await adminClient
    .from('verification_requests')
    .select('user_id, status')
    .eq('id', data.requestId)
    .single();

  if (!request) return { success: false, error: 'Request not found' };
  if (request.status !== 'pending') return { success: false, error: 'Request already reviewed' };

  const { error: updateError } = await adminClient
    .from('verification_requests')
    .update({
      status: data.status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: data.rejectionReason || null,
    })
    .eq('id', data.requestId);

  if (updateError) return { success: false, error: 'Failed to update request' };

  if (data.status === 'verified') {
    await adminClient
      .from('user_profiles')
      .update({ is_verified: true })
      .eq('user_id', request.user_id);

    await adminClient.from('notifications').insert({
      user_id: request.user_id,
      type: 'verification_approved',
      title: 'Verification Approved',
      body: 'Your identity verification has been approved! You now have a verified badge on your profile.',
      link: '/profile',
    });
  } else {
    await adminClient.from('notifications').insert({
      user_id: request.user_id,
      type: 'verification_rejected',
      title: 'Verification Update',
      body: `Your verification request was reviewed. Reason: ${data.rejectionReason || 'Not specified'}`,
      link: '/profile/verification',
    });
  }

  return { success: true };
}

export async function getSelfieSignedUrl(filePath: string): Promise<{ url?: string; error?: string }> {
  const adminClient = createAdminClient();
  const { data: urlData, error } = await adminClient.storage
    .from('verification-media')
    .createSignedUrl(filePath, 60 * 30);

  if (error) return { error: 'Failed to generate URL' };
  return { url: urlData.signedUrl };
}
