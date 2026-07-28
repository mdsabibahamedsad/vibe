# Vibe — Database Architecture

## Overview

Vibe uses **Supabase PostgreSQL** as its primary database. All application data lives in Supabase, not Telegram's internal database.

The database is organized into **migration modules**, each representing a domain within the application.

---

## ER-Style Relationship Overview

```
users ──▶ profiles (1:1)
users ──▶ profile_photos (1:N)
users ──▶ profile_preferences (1:1)
profiles ──▶ profile_interests (N:N) ◀── interests
users ──▶ follows (N:N) ◀── users
users ──▶ posts (1:N)
posts ──▶ post_likes (N:N) ◀── users
posts ──▶ post_comments (1:N)
posts ──▶ post_reactions (N:N) ◀── users
posts ──▶ post_saves (N:N) ◀── users
posts ──▶ post_media (N:N) ◀── media
users ──▶ media (1:N)
users ──▶ stories (1:N)
stories ──▶ story_views (N:N) ◀── users
users ──▶ dating_actions (N:N) ◀── users
matches connects users (N:N, normalized single record)
users ──▶ blocks (N:N) ◀── users
conversations ──▶ conversation_members (N:N) ◀── users
conversations ──▶ messages (1:N)
messages ──▶ message_attachments (1:N) ◀── media
users ──▶ communities (1:N)
communities ──▶ community_members (N:N) ◀── users
users ──▶ notifications (1:N)
users ──▶ reports (as reporter/reported)
users ──▶ referral_codes (1:1)
users ──▶ referrals (as referrer/referred)
users ──▶ purchases (1:N)
users ──▶ subscriptions (1:N)
subscriptions ──▶ subscription_events (1:N)
admin users manage system_config, feature_flags
```

---

## Migration Modules

| #   | Migration                | Tables Created                                                                    | Purpose                           |
| --- | ------------------------ | --------------------------------------------------------------------------------- | --------------------------------- |
| 001 | `extensions`             | —                                                                                 | Enable pgcrypto, pg_trgm          |
| 002 | `enums`                  | —                                                                                 | All application enum types        |
| 003 | `identity_profiles`      | users, profiles, profile_photos, profile_preferences                              | Core identity & user profiles     |
| 004 | `interests`              | interests, profile_interests                                                      | Interest tagging system           |
| 005 | `social`                 | follows, posts, post_likes, post_comments, post_reactions, post_saves             | Social graph & engagement         |
| 006 | `media_stories`          | media, post_media, stories, story_views                                           | Media storage & stories           |
| 007 | `dating`                 | dating_actions, matches, blocks                                                   | Discovery, matching, blocking     |
| 008 | `messaging`              | conversations, conversation_members, messages, message_attachments, message_reads | Real-time chat foundation         |
| 009 | `communities`            | communities, community_members                                                    | Groups & communities              |
| 010 | `notifications`          | notifications                                                                     | In-app & push notifications       |
| 011 | `payments_subscriptions` | purchases, subscriptions, subscription_events                                     | Payments & premium                |
| 012 | `moderation_reports`     | reports                                                                           | Content moderation                |
| 013 | `referrals`              | referral_codes, referrals, referral_rewards                                       | Referral system                   |
| 014 | `admin`                  | system_config, feature_flags, admin_audit_log                                     | Admin foundation                  |
| 015 | `analytics`              | analytics_events                                                                  | Lightweight event tracking        |
| 016 | `indexes`                | — (indexes only)                                                                  | Supplementary performance indexes |
| 017 | `functions_triggers`     | — (functions only)                                                                | Security functions, triggers      |
| 018 | `rls`                    | — (policies only)                                                                 | Row Level Security on all tables  |
| 019 | `seed`                   | — (data only)                                                                     | Development seed data             |

---

## Total: 37 Tables (including join tables)

---

## Important Fields

### users

| Field              | Type          | Purpose                           |
| ------------------ | ------------- | --------------------------------- |
| `id`               | uuid PK       | Application-level user identifier |
| `telegram_user_id` | bigint UNIQUE | Stable Telegram identity          |
| `role`             | user_role     | Authorization level               |
| `is_banned`        | boolean       | Account ban status                |

### profiles

| Field                | Type          | Purpose                                             |
| -------------------- | ------------- | --------------------------------------------------- |
| `user_id`            | uuid FK→users | Links to identity                                   |
| `date_of_birth`      | date          | Stored privately; age calculated server-side        |
| `latitude/longitude` | numeric       | Approximate location for discovery (RLS-restricted) |
| `profile_visibility` | enum          | Controls who can see the profile                    |

### posts

| Field        | Type            | Purpose                               |
| ------------ | --------------- | ------------------------------------- |
| `visibility` | post_visibility | 'public', 'followers_only', 'private' |
| `deleted_at` | timestamptz     | Soft delete for moderation retention  |

### messages

| Field         | Type             | Purpose                          |
| ------------- | ---------------- | -------------------------------- |
| `deleted_at`  | timestamptz      | Soft delete for "unsend" feature |
| `reply_to_id` | uuid FK→messages | Threading support                |

### matches

| Field                   | Type          | Purpose                                 |
| ----------------------- | ------------- | --------------------------------------- |
| `user_a_id / user_b_id` | uuid FK→users | Normalized pair (user_a_id < user_b_id) |
| `status`                | match_status  | 'active', 'unmatched', 'blocked'        |

---

## Media Strategy

Media storage is modular — the database supports multiple providers:

| Provider       | Use Case                              |
| -------------- | ------------------------------------- |
| `telegram`     | Phase 1 — Telegram file_id references |
| `supabase`     | Phase 2 — Supabase Storage CDN        |
| `external_cdn` | Future — Custom CDN                   |

The `media` table has `storage_provider` and `provider_file_id`/`storage_path` columns to abstract the storage backend.

---

## RLS Strategy

- **RLS is enabled on ALL 37 tables** — no table is publicly writable
- Default policy: **DENY ALL**
- Policies grant access based on `auth.uid()` (from Supabase Auth)
- **Admin/Moderator** privileges granted via `public.is_admin()` / `public.is_moderator()` functions
- **Never** trust client-provided user IDs for authorization
- Blocking is enforced at the database level through intersection checks
- Sensitive tables (purchases, subscriptions, reports) have restricted read/write policies

Key RLS principles:

1. Users read/update only their own resources
2. Public content (posts, profiles) is readable according to visibility settings
3. Match/conversation access is limited to participants
4. Admin operations require `is_admin()` or `is_moderator()` server-side verification
5. Reports are visible to the reporter and moderators only

---

## Privacy Boundaries

The following data is NEVER publicly readable by default:

- Exact location coordinates (latitude/longitude) — RLS-restricted
- Date of birth — stored privately, age calculated server-side
- Dating action history (who passed/liked whom)
- Notification preferences
- Report content and moderation notes
- Payment and subscription records
- Admin audit logs
- Feature flags and system configuration

---

## Scalability Notes

1. **Indexes are designed for expected query patterns** — composite indexes for feed, chat list, discovery
2. **Denormalized counters** on `posts` (like_count, comment_count) to avoid COUNT queries
3. **Soft deletes** on user-generated content for moderation retention
4. **Analytics table** is a lightweight event store — plan to migrate high-volume events to a dedicated pipeline (ClickHouse, BigQuery, etc.)
5. **Location-based queries** will require PostGIS extension at scale
6. **Fan-out-on-write** for feeds should be evaluated when follower counts grow
7. **Materialized views** may be needed for discovery queue performance at scale

---

## Trigger Strategy

Triggers are limited to:

- `updated_at` — Automatic timestamp updates on all tables with this column
- `post_likes` count — Denormalized counter updates
- `post_comments` count — Denormalized counter updates
- `profile_completion` — Auto-calculated on profile changes

Complex business logic (match creation, notifications, payments) is handled in application services, not database triggers.
