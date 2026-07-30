# Data Retention Policy

## Retention Rules

| Data Category | Active Retention | Cleanup Mechanism | Legal Hold | Configurable |
|---------------|-----------------|-------------------|------------|--------------|
| **Messages** | 90 days | Hard delete after 90 days | Preserved if under legal hold | Via env var |
| **Stories** | 24-48 hours (expiry) | Soft-delete on expiry, hard-delete after 24h grace | N/A | No (product requirement) |
| **Story views** | 90 days | Hard delete | N/A | No |
| **Profile data** | Account lifetime | Anonymized on account deletion | Financial records exempt | Per user deletion |
| **Profile photos** | Account lifetime | Deleted on user action or account deletion | N/A | Per user |
| **Posts** | Account lifetime | Soft-delete on user delete, hard-delete 30d after | Preserved for moderation | Per user |
| **Post media** | Account lifetime + 30d after post delete | Soft-delete, then hard-delete | N/A | No |
| **Matches** | Account lifetime | Soft-deleted on unmatch | N/A | Per user |
| **Dating actions** | 90 days | Hard delete | N/A | No |
| **Recommendation impressions** | 30 days | Hard delete | N/A | No |
| **Notifications** | 90 days | Hard delete (`cleanup_old_notifications`) | N/A | Via retention config |
| **Analytics events** | 90 days | Hard delete, aggregated data preserved | N/A | Via env var |
| **Moderation actions** | 1 year | Hard delete after 1 year | Preserved for legal | Via env var |
| **Reports** | 1 year | Hard delete after 1 year | Preserved | Via env var |
| **Safety signals** | 90 days | Auto-expire | Preserved if escalated | Via env var |
| **Verification selfies** | 90 days after review | Hard delete | Preserved for fraud | Via env var |
| **Support tickets** | 1 year after closure | Hard delete | N/A | Via env var |
| **Admin audit logs** | 3 years | Hard delete | Preserved for compliance | Via env var |
| **Payment records** | 3 years (legal minimum) | Hard delete (not automated) | Preserved | No (legal requirement) |
| **Creator earnings** | 3 years | Hard delete (not automated) | Preserved | No (legal requirement) |
| **Subscription records** | 3 years | Hard delete | Preserved | No (legal requirement) |
| **Server logs** | 30 days | Log rotation | Preserved if under investigation | Via env var |

## Cleanup Jobs

| Job | Schedule | Table | Action |
|-----|----------|-------|--------|
| Story expiration | Every 5 minutes | `stories` | Mark expired, hide from queries |
| Orphaned media cleanup | Every hour | `media` | Soft-delete unattached media |
| Old notification cleanup | Daily | `notifications` | Delete > 90 days |
| Message retention cleanup | Daily | `messages` | Delete > 90 days (configurable) |
| Analytics event cleanup | Daily | `analytics_events` | Delete > 90 days |
| Safety signal auto-expire | Daily | `safety_signals` | Delete expired signals |
| Verification evidence cleanup | Daily | `verification-media` bucket | Delete evidence > 90 days after review |
| Full story hard delete | Daily | `stories`, story media | Delete expired > 24h ago |

## Legal Holds

When a legal hold is required:
1. Hold is applied at the user or content level
2. Flagged records are excluded from automated cleanup
3. Hold is tracked in a `legal_holds` table
4. Removed only when legal counsel confirms hold release

## Configuration

Retention periods are configurable via environment variables:

```
MESSAGE_RETENTION_DAYS=90
ANALYTICS_RETENTION_DAYS=90
NOTIFICATION_RETENTION_DAYS=90
REPORT_RETENTION_DAYS=365
AUDIT_LOG_RETENTION_DAYS=1095
SAFETY_SIGNAL_RETENTION_DAYS=90
VERIFICATION_EVIDENCE_RETENTION_DAYS=90
SUPPORT_TICKET_RETENTION_DAYS=365
```

## Deletion Behavior

- **Soft delete**: Records are marked as deleted but remain in database for recovery/reference
- **Hard delete**: Records are permanently removed from database
- **Anonymization**: Personal identifiers are removed, aggregate data preserved
- **Exempt records**: Financial/audit records are never automatically deleted

## Compliance Note

Financial and audit records have legal retention requirements that may exceed operational retention periods. These records are never automatically deleted and are subject to the `legal_holds` mechanism.
