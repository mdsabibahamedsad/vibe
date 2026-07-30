# Vibe — Moderation & Safety System

## Overview

The Moderation & Safety System provides a comprehensive control center for managing content, users, reports, and appeals. It implements a role-based permission model with full audit logging.

### Architecture

```
Admin UI (Next.js Pages)
    ↓
Admin API Routes (server-side)
    ↓
Authorization Layer (permission.service)
    ↓
Moderation Services
    ↓
Supabase (database + RLS + triggers)
```

### Key Principles

1. **Server-side enforcement** — All security decisions are made server-side
2. **Least privilege** — Roles have minimum required permissions
3. **Full audit trail** — Every privileged action is recorded immutably
4. **Soft deletion** — Content is hidden, not destroyed, for audit/legal purposes
5. **Privacy by design** — Only necessary information is exposed to each role

---

## 1. Admin Roles

| Role | Description | Access Level |
|------|-------------|-------------|
| `super_admin` | Full system access, can manage other admins | All permissions |
| `admin` | Full moderation access, cannot manage roles | All except `admin.manage` |
| `moderator` | Can handle reports, moderate content, restrict users | Limited moderation |
| `support` | Can view reports and appeals, no moderation actions | Read-only |
| `user` | Regular user, no admin access | None |

---

## 2. Permissions Matrix

| Permission | super_admin | admin | moderator | support |
|------------|:-----------:|:-----:|:---------:|:-------:|
| `users.view` | ✅ | ✅ | ✅ | ✅ |
| `users.restrict` | ✅ | ✅ | ✅ | ❌ |
| `users.suspend` | ✅ | ✅ | ❌ | ❌ |
| `users.ban` | ✅ | ✅ | ❌ | ❌ |
| `content.view` | ✅ | ✅ | ✅ | ❌ |
| `content.remove` | ✅ | ✅ | ✅ | ❌ |
| `content.restore` | ✅ | ✅ | ✅ | ❌ |
| `reports.view` | ✅ | ✅ | ✅ | ✅ |
| `reports.resolve` | ✅ | ✅ | ✅ | ❌ |
| `reports.assign` | ✅ | ✅ | ✅ | ❌ |
| `appeals.view` | ✅ | ✅ | ✅ | ✅ |
| `appeals.resolve` | ✅ | ✅ | ❌ | ❌ |
| `analytics.view` | ✅ | ✅ | ❌ | ❌ |
| `audit.view` | ✅ | ✅ | ❌ | ❌ |
| `admin.manage` | ✅ | ❌ | ❌ | ❌ |
| `admin.notes` | ✅ | ✅ | ✅ | ❌ |

---

## 3. Reports

### Report Lifecycle

```
Created (pending)
    ↓
Assigned (reviewing)
    ↓
Reviewed → Resolved / Dismissed / Escalated
```

### Report Priorities

| Priority | Criteria | SLA Target |
|----------|----------|------------|
| `critical` | Minor safety, self-harm, illegal activity | < 1 hour |
| `high` | Violence, severe harassment | < 4 hours |
| `normal` | Spam, impersonation, nudity | < 24 hours |
| `low` | Minor violations | < 72 hours |

### Report Reasons

- `spam` — Unsolicited commercial content
- `harassment` — Targeted harassment or bullying
- `hate` — Hate speech or discrimination
- `sexual_content` — Inappropriate sexual content
- `violence` — Violent content or threats
- `scam` — Fraud or phishing attempts
- `impersonation` — Pretending to be someone else
- `minor_safety` — Content involving minors
- `self_harm` — Self-harm or suicide content
- `illegal_activity` — Illegal content or activity
- `privacy` — Privacy violations (doxing, etc.)
- `other` — Other violations

### Report Privacy

- Reporter identity is NEVER exposed to the reported user
- Moderators may see reporter identity for investigation
- Report details are only accessible to authorized moderators

---

## 4. User Moderation

### Account States

```
active → restricted → suspended → banned
   ↑         ↑            ↑          ↓
   └─────────┴────────────┴──────────┘
                 (unban/unsuspend)
```

### Warning System

- Warnings are issued for minor violations
- Multiple warnings may lead to escalation
- Warnings can be marked as resolved

### Restrictions (Fine-grained)

| Restriction | Effect |
|-------------|--------|
| `posting_disabled` | Cannot create new posts |
| `messaging_disabled` | Cannot send messages |
| `commenting_disabled` | Cannot comment on posts |
| `following_disabled` | Cannot follow users |
| `dating_disabled` | Cannot use dating discovery |

### Temporary Suspension

- Time-limited account restriction
- Auto-expires after configured duration
- Messaging disabled during suspension
- User is notified of suspension and duration

### Permanent Ban

- Complete account restriction
- All capabilities disabled
- Content hidden from public view
- User blocked from creating new sessions
- Ban records include moderator ID and reason

---

## 5. Content Moderation

### Content States

```
visible → under_review → removed → restored
```

### Supported Content Types

- Posts (`posts`)
- Comments (`post_comments`)
- Stories (`stories`)
- Media (`media`)

### Moderation Actions

- **Remove:** Sets `moderation_status = 'removed'`, content hidden from public
- **Restore:** Sets `moderation_status = 'restored'`, content becomes visible again
- Removal records include moderator ID, reason, and timestamp

### Enforcement Points

| Feature | Enforcement |
|---------|-------------|
| Feed | RLS filters removed content |
| Search | RLS excludes removed content |
| Stories | RLS excludes removed stories |
| Chat | Server-side `can_user_message()` check |
| Discovery | Server-side `can_user_date()` check |
| Posts | Server-side `can_user_post()` check |
| Media | RLS + server-side checks |

---

## 6. Appeals

### Appeal Lifecycle

```
Created (pending) → In Review (in_review) → Approved / Denied
```

### Appeal Rules

- One appeal per moderation action per 24-hour cooldown
- Appeals are reviewed by authorized moderators/admins
- Approved appeals automatically reverse the original action
- Denied appeals record the reason for denial

### Appeal Outcomes

| Outcome | Effect |
|---------|--------|
| `approved` | Original action reversed (unban, unsuspend, restore content) |
| `denied` | Original action upheld, denial reason recorded |

---

## 7. Audit Logs

### Audit Events

| Event | When Triggered |
|-------|---------------|
| `admin_login` | Admin authenticates |
| `role_changed` | Admin role is modified |
| `permission_changed` | Role permissions updated |
| `report_viewed` | Report detail accessed |
| `report_assigned` | Report assigned to moderator |
| `content_removed` | Content removed |
| `content_restored` | Content restored |
| `user_warned` | Warning issued |
| `user_restricted` | Restriction applied |
| `user_suspended` | Account suspended |
| `user_banned` | Account banned |
| `user_unbanned` | Account unbanned |
| `appeal_reviewed` | Appeal decision made |

### Audit Log Immutability

- Audit logs cannot be edited or deleted through the admin UI
- Log entries are created atomically with the parent action
- Metadata excludes sensitive personal data

---

## 8. Review Locks

Review locks prevent duplicate processing:

- 30-minute lock duration
- Auto-expire lock cleanup
- Conflict notification if another moderator is reviewing
- Locks released on report resolution

---

## 9. Safety Signals

The system supports automated safety flags:

| Signal Type | Description |
|-------------|-------------|
| `rapid_follows` | Unusual follow velocity |
| `rapid_messages` | Unusual message velocity |
| `spam_content` | Repeated identical content |
| `duplicate_content` | Exact content duplication |

Signals are reviewable by moderators and can be dismissed.

---

## 10. Notifications Integration

Moderation actions generate user notifications:

| Action | Notification |
|--------|-------------|
| Warning | "You have received a warning" |
| Restriction | "Some account features have been restricted" |
| Suspension | "Your account has been temporarily suspended" |
| Ban | "Your account has been banned" |
| Unban | "Your account has been restored" |
| Content restored | "Your content has been restored" |
| Appeal approved | "Your appeal has been approved" |
| Appeal denied | "Your appeal has been reviewed" |

Notifications use neutral, policy-based language and never reveal moderator identities.

---

## 11. Retention Policies

| Data Type | Retention | Notes |
|-----------|-----------|-------|
| Reports | Indefinite (for audit) | Include resolved/dismissed |
| Moderation actions | Indefinite | Permanent audit trail |
| Audit logs | Indefinite | Immutable history |
| Appeals | Indefinite | Include decisions |
| Internal notes | Per product policy | Review periodically |

---

## 12. Security Model

### RLS Policies

- All new tables have RLS enabled
- Moderators can read relevant moderation data
- Users can read only their own data (warnings, restrictions, appeals)
- Super admins have full access to permission tables

### Authorization Checks

1. **API Route:** Extracts user from Bearer token
2. **Role Check:** Verifies user has admin-level role
3. **Permission Check:** Verifies specific permission for the operation
4. **Service Layer:** Performs business logic with Supabase admin client
5. **Audit:** Records the action in the audit log

### Rate Limiting

Admin operations are rate-limited:

| Operation | Limit |
|-----------|-------|
| Bulk actions | 10 per minute |
| Role changes | 5 per minute |
| User bans | 10 per minute |
| Content deletions | 30 per minute |

---

## 13. Failure Recovery

| Failure Mode | Recovery |
|-------------|----------|
| Database error | Logged, user shown error with retry option |
| Permission check failure | 403 response, logged |
| Concurrent action conflict | 409 response with explanation |
| Notification failure | Logged, does not block action |
| Audit log failure | Logged, does not block parent action |
