# Vibe — Admin Control Center

## Overview

The Admin Control Center is a comprehensive internal dashboard for managing Vibe's moderation, safety, and administrative operations. It is fully separated from the public user-facing UI and requires specific roles to access.

### Route

```
/admin — Admin dashboard (all admin roles)
```

### Features

| Section | Description | Required Role |
|---------|-------------|---------------|
| Overview | Dashboard with aggregate metrics | moderator+ |
| Reports | Report queue management | moderator+ |
| Users | User search + moderation actions | moderator+ |
| Content | Content moderation (posts, comments, stories, media) | moderator+ |
| Appeals | Appeal review and resolution | admin+ |
| Audit Log | Immutable admin action history | admin+ |
| Admins | Role and permission management | super_admin |

---

## 1. Architecture

```
Admin UI (Next.js Pages) — Client components with permission-aware navigation
    ↓
Admin API Routes — Server-side route handlers with authorization
    ↓
Authorization Layer — Permission checks via permissions.ts
    ↓
Moderation Services — Business logic (report, restriction, content, appeal, audit)
    ↓
Supabase — Database with RLS, triggers, security definer functions
```

### Security Design

1. **Server-side authorization**: Every API route verifies the user's session and permissions
2. **Never trust the client**: The admin frontend is assumed to be potentially compromised
3. **Least privilege**: Permissions are granular and role-specific
4. **Audit trail**: Every privileged operation creates an immutable audit record
5. **No direct DB access**: All mutations go through service functions with proper auth

---

## 2. API Endpoints

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/dashboard` | Aggregate moderation metrics |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/reports` | List reports (paginated, filtered) |
| POST | `/api/admin/reports` | Assign/resolve/escalate reports |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | Search users or get moderation details |
| POST | `/api/admin/users` | Warn/restrict/suspend/ban/unban users |

### Content
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/content` | Search or get content details |
| POST | `/api/admin/content` | Remove or restore content |

### Appeals
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/appeals` | List appeals with details |
| POST | `/api/admin/appeals` | Approve or deny appeals |

### Audit
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/audit` | List audit log entries |

### Roles
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/roles` | List roles and admin users |
| POST | `/api/admin/roles` | Assign roles or update permissions |

---

## 3. Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `AUTHENTICATION_ERROR` | 401 | Missing or invalid session |
| `AUTHORIZATION_ERROR` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid input |
| `CONFLICT` | 409 | Concurrent action (review lock) |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## 4. Admin UI Pages

### Dashboard (`/admin`)
- Aggregate metrics: new users, open reports, critical reports, banned/suspended users
- Quick action links to reports, appeals, content, and admin management

### Reports (`/admin/reports`)
- Filterable report queue (status, priority)
- Quick resolve/dismiss actions
- Infinite scroll pagination
- Priority indicators (critical/high/normal/low)

### Users (`/admin/users`)
- Search by name, username, Telegram ID, or UUID
- User detail panel with status, warnings, restrictions, moderation history
- Action buttons: warn, restrict, suspend/unsuspend, ban/unban
- Permission-aware action availability

### Content (`/admin/content`)
- Filter by content type (post/comment/story/media) and moderation status
- Remove and restore actions
- Content preview

### Appeals (`/admin/appeals`)
- Appeal list with status filter
- Detail panel showing appeal reason, user info, original action, history
- Approve/deny actions with optional note

### Audit Log (`/admin/audit`)
- Filterable by action type and target type
- Cursor-based pagination
- Immutable record display

### Admins (`/admin/admins`)
- List of admin staff with roles (super_admin only)
- Role assignment dropdown
- Permission matrix display

---

## 5. Database Migrations

### Migration 028 — Admin + Moderation + Safety System

| New Table | Purpose |
|-----------|---------|
| `moderation_actions` | Action history (warnings, bans, content removal, etc.) |
| `user_warnings` | Warning records |
| `user_restrictions` | Fine-grained capability restrictions |
| `appeals` | User appeals against moderation actions |
| `moderation_cases` | Grouped moderation workflow |
| `moderation_case_items` | Links reports to cases |
| `admin_notes` | Private moderator notes |
| `review_locks` | Prevent duplicate processing |
| `safety_flags` | Automated safety signal detection |
| `admin_permissions` | Role-to-permission mapping |

| Extended Table | Additions |
|----------------|-----------|
| `reports` | Priority, assignment, escalation, story/media/comment targets |
| `users` | Account status, suspension, ban info |
| `posts` | Moderation status, removal/restore tracking |
| `post_comments` | Moderation status, removal/restore tracking |
| `stories` | Moderation status, removal/restore tracking |
| `media` | Moderation status, removal/restore tracking |
| `admin_audit_log` | Action type, metadata |

---

## 6. RLS Policies

All new tables have RLS enabled with the following pattern:

- **Moderators+**: SELECT on moderation data (reports, actions, warnings, restrictions, cases, flags)
- **Admins+**: All operations on permission tables
- **Users**: SELECT only their own warnings, restrictions, and appeals
- **Super admins**: All operations on admin_permissions

Existing table RLS was updated:
- Posts/comments/stories/media: Only visible content returned to normal users
- Media: Moderators can view all media regardless of visibility

---

## 7. Security Considerations

### Authentication
- Admin sessions use the same JWT-based auth as normal users
- Session timeout follows project auth architecture (configurable)

### Authorization
- Server-side permission check on every API call
- Frontend permission checks are for UX only — never the security boundary

### CSRF Protection
- All privileged actions require a valid auth session
- Admin API follows existing auth architecture (Bearer token)

### Input Validation
- All admin inputs validated server-side with Zod schemas
- IDs validated as UUID format
- Pagination bounded (max 100 items)

### IDOR Protection
- Each API route checks that the authenticated user has the required permission
- Target IDs are validated, but authorization is for the action, not the specific resource

---

## 8. Notification Integration

Moderation actions trigger user notifications via database triggers:

| Action | Notification |
|--------|-------------|
| Warning | "You have received a warning." |
| Restriction | "Some account features have been restricted." |
| Suspension | "Your account has been temporarily suspended." |
| Ban | "Your account has been banned." |
| Unban | "Your account has been restored." |
| Content restore | "Your content has been restored." |
| Appeal approved | "Your appeal has been approved." |
| Appeal denied | "Your appeal has been reviewed." |

All notifications use neutral, policy-based language and never reveal moderator identities.

---

## 9. Integration Guide

### With Recommendation Engine
- Banned/suspended users are excluded from recommendation candidates
- `can_user_date()` is checked server-side before returning dating candidates

### With Chat
- `can_user_message()` is checked server-side before allowing message sends
- Banned users' messages are rejected

### With Feed
- RLS filters out content with `moderation_status = 'removed'`
- Removed posts/comments disappear immediately

### With Search
- Banned users do not appear in search results
- RLS on users table filters banned users

### With Stories
- RLS filters out stories with `moderation_status = 'removed'`
- Story visibility checks include moderation status
