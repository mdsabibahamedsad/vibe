# Privacy & Security Incident Response

> **IMPORTANT**: This document describes technical incident response procedures. Legal notification requirements (e.g., GDPR 72-hour breach notification, CCPA notification) must be reviewed by qualified legal counsel. This document does NOT constitute legal advice.

---

## 1. Incident Classification

| Severity | Definition | Examples | Response Time |
|----------|-----------|----------|---------------|
| **P1 - Critical** | Confirmed data breach, unauthorized access to production data, compromised credentials | Database exfiltration, storage breach, auth system compromise | Immediate (< 15 minutes) |
| **P2 - High** | Suspected data exposure, single-account compromise, payment abuse | Single user account takeover, suspected payment fraud, exposed internal document | < 1 hour |
| **P3 - Medium** | Minor data exposure, configuration error, non-sensitive data access | Internal tool misconfiguration, log exposure without PII, rate-limit bypass | < 4 hours |
| **P4 - Low** | Policy violation, minor privacy issue | Incorrect analytics tracking, missing consent option, documentation gap | < 1 week |

## 2. Incident Response Team

### Core Team Roles

| Role | Responsibility | Primary | Backup |
|------|---------------|---------|--------|
| **Incident Commander** | Overall coordination, decisions, stakeholder communication | CTO/Head of Engineering | Lead Engineer |
| **Security Lead** | Technical investigation, containment, evidence preservation | Security Engineer | Senior Developer |
| **Communications Lead** | Internal/external notifications, status updates | Product Manager | CTO |
| **Legal Liaison** | Legal obligations, regulator notifications, documentation | Legal Counsel (external) | CTO |

### Responsibilities

- **Incident Commander**: Declares severity, assigns roles, drives timeline, decides on user notification, declares resolution
- **Security Lead**: Determines attack vector, preserves evidence, implements containment, assesses data access
- **Communications Lead**: Updates status page, drafts user notifications (reviewed by Legal), coordinates with platform partners (Telegram)
- **Legal Liaison**: Determines legal notification requirements, reviews communications, maintains evidence chain for legal proceedings

## 3. Detection Sources

| Source | Description | Escalation Path |
|--------|-------------|-----------------|
| Automated alerts | Security monitoring alerts (see docs/observability.md) | PagerDuty/Slack → On-call engineer |
| User reports | User-reported suspicious activity, data access concerns | Support ticket → Security team |
| Anomaly detection | Unusual API patterns, data access spikes | Automated → Security team |
| Platform notification | Telegram security notification, Supabase security alert | Immediate → CTO |
| Manual discovery | Code review finding, penetration test result, audit finding | Security team |

## 4. Response Procedures

### 4.1 Detection & Triage

1. **Acknowledge**: Respond to alert within severity response time
2. **Classify**: Determine severity using classification table
3. **Declare**: Create incident channel in Slack (#incident-<id>)
4. **Assemble**: Notify response team members
5. **Document**: Start incident timeline document

### 4.2 Containment

| Scenario | Immediate Actions | Evidence Preservation |
|----------|-------------------|----------------------|
| **Active breach** | - Revoke compromised credentials - Restrict network access - Suspend affected accounts | - Preserve logs before blocking - Snapshot system state - Record all actions with timestamps |
| **Data exposure** | - Remove exposed data - Fix access control - Verify no copies persist | - Document what was exposed - Preserve access logs - Capture configuration state |
| **Account takeover** | - Revoke session tokens - Force password reset - Notify affected user | - Preserve session logs - Record attacker IP/timestamps - Document data accessed |
| **Payment compromise** | - Suspend payment processing - Review recent transactions - Notify Telegram | - Preserve transaction logs - Document financial impact - Capture webhook payloads |

### 4.3 Investigation

1. **Determine scope**: What data was accessed? How many users affected? How long was the exposure?
2. **Identify root cause**: Technical vulnerability, configuration error, compromised credential, third-party failure
3. **Document attack vector**: How did the incident occur? What controls failed?
4. **Assess impact**: Data types exposed, financial impact, reputational impact, regulatory exposure

### 4.4 Eradication & Recovery

1. **Fix root cause**: Patch vulnerability, rotate credentials, update configuration
2. **Verify fix**: Test that the vulnerability is resolved
3. **Restore services**: Safely bring affected systems back online
4. **Monitor**: Increased monitoring for 72 hours post-recovery
5. **User notification**: Notify affected users (if required by severity and legal review)

### 4.5 Notification Workflow

> **All user notifications must be reviewed by legal counsel before sending.**

| Severity | User Notification | Regulator Notification | Platform Notification |
|----------|------------------|----------------------|----------------------|
| P1 - Critical | Within 72 hours (or as required by applicable law) | As required by applicable law | Within 24 hours |
| P2 - High | Within 7 days | If legally required | If contractually required |
| P3 - Medium | If privacy impact confirmed | If legally required | At discretion |
| P4 - Low | Not required | Not required | Not required |

**Notification Template:**
```
Subject: Security Notice Regarding Your Vibe Account

We are writing to inform you about [brief description of incident].
Your account [was/was not] affected.

What happened: [brief technical description]
What we did: [actions taken to resolve]
What you should do: [user actions if any]
Questions: Contact support@vibe.app

We apologize for any concern this may cause.
```

## 5. Evidence Preservation

### Digital Evidence

| Evidence Type | Preservation Method | Retention |
|---------------|-------------------|-----------|
| Application logs | Export to secure storage (S3/Blob with restricted access) | 1 year |
| Database snapshots | Point-in-time recovery snapshot | Until investigation complete |
| Network logs | Cloud provider logs (Vercel, Supabase) | Provider retention |
| Access logs | Supabase audit logs, Vercel access logs | 90 days |
| Communication records | Slack incident channel export | 1 year |

### Chain of Custody

- All evidence must be preserved in original format
- Document who accessed evidence and when
- Use secure, access-controlled storage for evidence
- Maintain chronological record of all investigative actions

## 6. Postmortem Process

Required for all P1 and P2 incidents within 72 hours of resolution.

### Postmortem Template

```markdown
# Privacy Incident Postmortem

## Incident Summary
- **Date**: YYYY-MM-DD
- **Severity**: P1/P2/P3
- **Duration**: X hours Y minutes
- **Detected via**: [Alert, report, manual discovery]
- **Affected users**: [Number/percentage]

## Timeline
| Time (UTC) | Event |
|------------|-------|
| HH:MM | Detection |
| HH:MM | Triage initiated |
| HH:MM | Containment started |
| HH:MM | Containment verified |
| HH:MM | Resolution |
| HH:MM | User notification (if applicable) |

## Root Cause Analysis
- **Primary cause**: [Technical explanation]
- **Contributing factors**: [What enabled the incident]
- **Control failures**: [Which controls failed]

## Data Access Assessment
- **Data types accessed**: [List of data categories]
- **Number of records**: [Approximate count]
- **Duration of exposure**: [How long data was accessible]

## Action Items
| # | Action | Owner | Due Date | Status |
|---|--------|-------|----------|--------|
| 1 | [Action] | [Owner] | [Date] | [Open/Closed] |

## Prevention
- [ ] Control improvement 1
- [ ] Control improvement 2
- [ ] Monitoring improvement 1
- [ ] Process improvement 1

## Lessons Learned
- [What went well]
- [What could be improved]
- [Process changes needed]
```

## 7. Communication Plan

### Internal Communication

| Channel | Purpose | Audience |
|---------|---------|----------|
| #incidents | Initial alert and ongoing updates | Engineering team |
| #incident-<id> | Detailed technical discussion | Response team |
| Emergency meeting | Critical decisions | Response team + leadership |

### External Communication

| Recipient | Timing | Method | Content |
|-----------|--------|--------|---------|
| Affected users | Per severity | Email/in-app notification | Incident description, actions taken, recommended actions |
| Telegram | Per agreement | Developer channel | Security incident notification per platform requirements |
| Regulators | Per applicable law | Formal notification | As required by applicable privacy law |
| Public | If warranted | Status page | General description without security details |
| Press | If warranted | Prepared statement | Coordinated with communications team |

## 8. Regular Testing

- **Quarterly**: Tabletop exercise simulating a data breach
- **Bi-annual**: Full incident response drill with all team members
- **Annual**: Third-party incident response audit

## 9. Related Documentation

- `docs/incident-response.md` — General incident response procedures (non-privacy)
- `docs/disaster-recovery.md` — Service recovery procedures
- `docs/security.md` — Security architecture and controls
- `docs/privacy.md` — Privacy architecture and data inventory
- `docs/compliance-readiness.md` — Compliance framework mapping
