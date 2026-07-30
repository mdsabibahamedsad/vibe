/**
 * Legal Document & Policy Acceptance Service
 *
 * Manages versioned legal documents and tracks user acceptance.
 *
 * Features:
 *  - Versioned documents (ToS, Privacy Policy, Community Guidelines, etc.)
 *  - User acceptance tracking with timestamps
 *  - Material change detection (new version = re-acceptance required)
 *  - Admin document management API
 *
 * Integration:
 *   Call `requireDocumentAcceptance()` in critical flows (auth, payments).
 *   Call `acceptDocument()` when user accepts a new version.
 *
 * Usage:
 *   import { requireDocumentAcceptance, acceptDocument } from "@/lib/security/legal-documents";
 *
 *   // Check acceptance before allowing access
 *   const status = await requireDocumentAcceptance(userId, "terms_of_service");
 *   if (status.needsAcceptance) {
 *     // Show acceptance UI to user
 *   }
 *
 *   // Record acceptance
 *   await acceptDocument(userId, "terms_of_service", "1.0.0");
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export type DocumentType = "terms_of_service" | "privacy_policy" | "community_guidelines" | "creator_terms" | "safety_policy";

export const DOCUMENT_TYPES: DocumentType[] = [
  "terms_of_service",
  "privacy_policy",
  "community_guidelines",
  "creator_terms",
  "safety_policy",
];

export interface LegalDocument {
  id: string;
  documentType: DocumentType;
  version: string;
  title: string;
  content: string;
  isPublished: boolean;
  publishedAt: string | null;
  effectiveAt: string | null;
  createdAt: string;
}

export interface DocumentAcceptance {
  id: string;
  userId: string;
  documentType: DocumentType;
  documentVersion: string;
  acceptedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AcceptanceStatus {
  needsAcceptance: boolean;
  /** The latest published version */
  latestVersion: string | null;
  /** The version the user has accepted (if any) */
  acceptedVersion: string | null;
  /** The document requiring acceptance */
  documentType: DocumentType;
}

// ============================================================================
// USER-FACING API
// ============================================================================

/**
 * Check if a user needs to accept a document.
 *
 * Returns true if:
 *  - The user has never accepted this document type
 *  - The user accepted an older version and the document has been updated
 */
export async function requireDocumentAcceptance(
  userId: string,
  documentType: DocumentType,
): Promise<AcceptanceStatus> {
  const adminClient = createAdminClient();

  // Get latest published version
  const { data: latestDoc } = await adminClient
    .from("legal_documents")
    .select("version")
    .eq("document_type", documentType)
    .eq("is_published", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestDoc) {
    // No published document exists — no acceptance needed
    return {
      needsAcceptance: false,
      latestVersion: null,
      acceptedVersion: null,
      documentType,
    };
  }

  // Get user's last acceptance
  const { data: acceptance } = await adminClient
    .from("user_consents")
    .select("document_version, accepted_at")
    .eq("user_id", userId)
    .eq("document_type", documentType)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!acceptance) {
    // Never accepted — needs acceptance
    return {
      needsAcceptance: true,
      latestVersion: latestDoc.version,
      acceptedVersion: null,
      documentType,
    };
  }

  // Check if accepted version matches latest
  const needsAcceptance = acceptance.document_version !== latestDoc.version;

  return {
    needsAcceptance,
    latestVersion: latestDoc.version,
    acceptedVersion: acceptance.document_version,
    documentType,
  };
}

/**
 * Record that a user has accepted a document.
 */
export async function acceptDocument(
  userId: string,
  documentType: DocumentType,
  version: string,
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
  },
): Promise<boolean> {
  const adminClient = createAdminClient();

  const { error } = await adminClient.from("user_consents").insert({
    user_id: userId,
    document_type: documentType,
    document_version: version,
    accepted_at: new Date().toISOString(),
    ip_address: metadata?.ipAddress ?? null,
    user_agent: metadata?.userAgent ?? null,
  });

  if (error) {
    logger.error("Failed to record document acceptance", {
      userId,
      documentType,
      version,
      error: error.message,
    });
    return false;
  }

  logger.info("Document acceptance recorded", {
    userId,
    documentType,
    version,
  });

  return true;
}

/**
 * Check ALL required documents for a user.
 * Returns a list of documents needing acceptance.
 */
export async function checkAllDocumentAcceptances(
  userId: string,
): Promise<AcceptanceStatus[]> {
  const results: AcceptanceStatus[] = [];

  for (const docType of DOCUMENT_TYPES) {
    const status = await requireDocumentAcceptance(userId, docType);
    results.push(status);
  }

  return results;
}

// ============================================================================
// ADMIN API
// ============================================================================

/**
 * Publish a new version of a legal document.
 */
export async function publishDocument(params: {
  documentType: DocumentType;
  version: string;
  title: string;
  content: string;
  effectiveAt?: string;
}): Promise<boolean> {
  const adminClient = createAdminClient();

  const { error } = await adminClient.from("legal_documents").insert({
    document_type: params.documentType,
    version: params.version,
    title: params.title,
    content: params.content,
    is_published: true,
    published_at: new Date().toISOString(),
    effective_at: params.effectiveAt ?? new Date().toISOString(),
  });

  if (error) {
    logger.error("Failed to publish document", {
      documentType: params.documentType,
      version: params.version,
      error: error.message,
    });
    return false;
  }

  logger.info("Legal document published", {
    documentType: params.documentType,
    version: params.version,
  });

  return true;
}

/**
 * Get the latest published version of a document.
 */
export async function getLatestDocument(
  documentType: DocumentType,
): Promise<LegalDocument | null> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("legal_documents")
    .select("*")
    .eq("document_type", documentType)
    .eq("is_published", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    documentType: data.document_type,
    version: data.version,
    title: data.title,
    content: data.content,
    isPublished: data.is_published,
    publishedAt: data.published_at,
    effectiveAt: data.effective_at,
    createdAt: data.created_at,
  };
}

/**
 * Get acceptance statistics for a document type.
 */
export async function getDocumentAcceptanceStats(
  documentType: DocumentType,
  version: string,
): Promise<{ total: number; acceptedCount: number; acceptanceRate: number } | null> {
  const adminClient = createAdminClient();

  const { data: acceptanceData, error } = await adminClient
    .from("user_consents")
    .select("id", { count: "exact", head: true })
    .eq("document_type", documentType)
    .eq("document_version", version);

  if (error) return null;

  const { count: userCount } = await adminClient
    .from("users")
    .select("id", { count: "exact", head: true });

  const acceptedCount = acceptanceData?.length ?? 0;
  const totalUsers = userCount ?? 0;

  return {
    total: totalUsers,
    acceptedCount,
    acceptanceRate: totalUsers > 0 ? acceptedCount / totalUsers : 0,
  };
}
