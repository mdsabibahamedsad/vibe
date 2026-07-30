# Threat Model

## Assets

| Asset | Confidentiality | Integrity | Availability | Description |
|-------|----------------|-----------|-------------|-------------|
| User identities | HIGH | HIGH | MEDIUM | Telegram user IDs, display names |
| Auth sessions | HIGH | HIGH | HIGH | JWT tokens, refresh tokens |
| Private messages | HIGH | HIGH | MEDIUM | Chat message content |
| Profile data | MEDIUM | HIGH | MEDIUM | Bio, photos, preferences |
| Dating preferences | HIGH | HIGH | LOW | Gender preference, intent, age range |
| Location data | HIGH | HIGH | LOW | Approximate location |
| Payment records | HIGH | CRITICAL | HIGH | Purchase history, Stars balance |
| Creator earnings | HIGH | CRITICAL | HIGH | Revenue, payout records |
| Verification evidence | HIGH | HIGH | LOW | Selfies, ID documents |
| Moderation evidence | HIGH | HIGH | LOW | Report details, review notes |
| Analytics data | LOW | MEDIUM | LOW | Aggregated usage metrics |
| Bot token | CRITICAL | CRITICAL | HIGH | Telegram Bot API token |
| Service role key | CRITICAL | CRITICAL | HIGH | Supabase admin access |

## Users

### Malicious User

| Threat | Attack Vector | Impact | Existing Control | Mitigation |
|--------|--------------|--------|-----------------|------------|
| Harassment | Repeated unwanted messages | Psychological harm, user churn | Block + report + moderation | Progressive restrictions, AI detection |
| Spam | Bulk messaging, duplicate content | Reduced feed quality | Rate limits, spam detection | Bulk message detection |
| Fake engagement | Bot follows, likes, comments | Reduced trust | Rate limits, pattern detection | Trust score reduction |
| Profile scraping | Bulk profile viewing | Privacy violation | Rate limits, pagination limits | Progressive restrictions |
| Content policy violation | Uploading prohibited content | Legal risk | Moderation pipeline, AI detection | Automated + human review |

### Fake Account / Bot

| Threat | Attack Vector | Impact | Existing Control | Mitigation |
|--------|--------------|--------|-----------------|------------|
| Mass account creation | Automated Telegram auth | Platform abuse | Rate limits per IP | Pattern detection |
| Romance scam | Emotional manipulation | Financial harm, trust erosion | Scam detection, safety warnings | Trust profile reduction |
| Phishing | Link sharing | Account compromise | Link safety analysis | Warning + block |
| Impersonation | Copying creator profiles | Reputation damage | Impersonation detection | Report + verification |

### Fraudster

| Threat | Attack Vector | Impact | Existing Control | Mitigation |
|--------|--------------|--------|-----------------|------------|
| Payment fraud | Stolen Stars, chargebacks | Revenue loss | Idempotency, webhook validation | Anomaly detection |
| Creator payout fraud | Fake engagement, refund abuse | Revenue loss | Server-authoritative records | Audit trail |
| Gift manipulation | Fake gifts, unauthorized refunds | Financial loss | Idempotency, server validation | Rate limiting |

## Attackers

### External Attacker

| Threat | Attack Vector | Impact | Existing Control | Mitigation |
|--------|--------------|--------|-----------------|------------|
| SQL injection | Malicious input to API | Data breach | Parameterized queries (Supabase builder) | Input validation |
| IDOR | Object ID substitution | Unauthorized data access | Resource ownership checks | All endpoints audited |
| Rate limit bypass | Distributed requests | Resource exhaustion | IP + user rate limiting | Abuse detection |
| Token theft | XSS, malicious extension | Account takeover | httpOnly cookies, CSP | Session revocation |
| CSRF | Cross-site request forgery | Unauthorized actions | Token-based auth, SameSite cookies | Origin validation |

### Compromised Account

| Threat | Attack Vector | Impact | Existing Control | Mitigation |
|--------|--------------|--------|-----------------|------------|
| Data access | Stolen session | Privacy breach | Session expiry | Suspicious login detection |
| Privilege escalation | Role manipulation | Admin access | Server-side role checks | Audit logging |
| Payment abuse | Stored payment methods | Financial loss | Server-authoritative records | Additional verification |
| Content destruction | Delete posts, media | Data loss | Soft-delete, versioning | Moderation restore |

### Malicious Insider (Admin)

| Threat | Attack Vector | Impact | Existing Control | Mitigation |
|--------|--------------|--------|-----------------|------------|
| Data exfiltration | Database access | Privacy breach | Audit logging, RBAC | Data access monitoring |
| Unauthorized privilege grant | Role modification | Security bypass | Super admin only | Audit trail, two-person rule |
| Payment manipulation | Manual adjustment | Financial loss | Audit trail, RBAC | Reconciliation |

## Infrastructure

### Database Compromise

| Threat | Attack Vector | Impact | Mitigation |
|--------|--------------|--------|------------|
| Data exfiltration | SQL injection, credential theft | Full data breach | RLS, least privilege, encryption |
| Data destruction | Malicious query, ransomware | Data loss | Backups (PITR), read replicas |
| Unauthorized schema change | Credential theft | System integrity | Migration review, RBAC |

### Storage Compromise

| Threat | Attack Vector | Impact | Mitigation |
|--------|--------------|--------|------------|
| Media exfiltration | Bucket policy misconfiguration | Privacy breach | Bucket policies, signed URLs, RLS |
| Malware upload | Unvalidated uploads | System compromise | MIME validation, size limits, scanning |

### Third-Party Dependency Compromise

| Threat | Attack Vector | Impact | Mitigation |
|--------|--------------|--------|------------|
| Supply chain attack | Compromised npm package | Code execution | Lockfile, dependency audit, CI/CD scanning |
| AI provider compromise | Model manipulation | Incorrect moderation | Human review, circuit breaker |

## Attack Surface Summary

| Surface | Exposure | Protections |
|---------|----------|-------------|
| Public API endpoints | 50+ routes | Auth, rate limiting, input validation |
| Admin API endpoints | 20+ routes | RBAC, audit logging, IP restriction |
| Supabase direct access | Blocked by RLS | RLS policies, no public tables |
| Storage buckets | 3 buckets | Bucket policies, signed URLs, MIME validation |
| Webhook endpoint | 1 endpoint | Secret token, idempotency |
| AI integrations | 2 integrations | Circuit breaker, no PII sent |
| Payments | 1 provider | Idempotency, webhook validation, server-authoritative |
