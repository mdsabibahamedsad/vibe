# Vibe — Database Schema Reference

A table-by-table reference for the Vibe PostgreSQL schema.

---

## Table: `users`

Application-level user identity, linked to Telegram.

| Column            | Type        | Constraints                   | Description                |
| ----------------- | ----------- | ----------------------------- | -------------------------- |
| id                | uuid        | PK, default gen_random_uuid() | Application user ID        |
| telegram_user_id  | bigint      | NOT NULL, UNIQUE              | Stable Telegram user ID    |
| telegram_username | text        |                               | Current Telegram username  |
| display_name      | text        | NOT NULL                      | Display name               |
| first_name        | text        |                               | Telegram first name        |
| last_name         | text        |                               | Telegram last name         |
| avatar_media_id   | text        |                               | Reference to profile photo |
| role              | user_role   | NOT NULL, default 'user'      | Authorization role         |
| is_active         | boolean     | NOT NULL, default true        | Account active flag        |
| is_banned         | boolean     | NOT NULL, default false       | Account ban flag           |
| last_seen_at      | timestamptz |                               | Last activity timestamp    |
| created_at        | timestamptz | NOT NULL, default now()       |                            |
| updated_at        | timestamptz | NOT NULL, default now()       |                            |

**Indexes:** telegram_user_id, role, is_active (partial), is_banned (partial)
**RLS:** Users read own, moderators read all

---

## Table: `profiles`

Extended user profile data (1:1 with users).

| Column                 | Type               | Constraints                | Description                                        |
| ---------------------- | ------------------ | -------------------------- | -------------------------------------------------- |
| id                     | uuid               | PK                         |                                                    |
| user_id                | uuid               | NOT NULL, FK→users, UNIQUE | Owner                                              |
| bio                    | text               |                            | User biography                                     |
| date_of_birth          | date               |                            | Stored privately                                   |
| gender                 | gender             |                            | Enum: male/female/non_binary/prefer_not_to_say     |
| city                   | text               |                            | City location                                      |
| country                | text               |                            | Country location                                   |
| latitude               | numeric            | -90 to 90                  | Approximate location (RLS-restricted)              |
| longitude              | numeric            | -180 to 180                | Approximate location (RLS-restricted)              |
| dating_intent          | dating_intent      |                            | Enum: dating/friendship/chat/relationship/not_sure |
| profile_visibility     | profile_visibility | default 'public'           | Controls read access                               |
| online_visibility      | online_visibility  | default 'everyone'         | Controls online status                             |
| is_verified            | boolean            | NOT NULL, default false    | Verified profile                                   |
| verified_at            | timestamptz        |                            | When verified                                      |
| profile_completion_pct | smallint           | 0-100                      | Auto-calculated                                    |
| created_at             | timestamptz        |                            |                                                    |
| updated_at             | timestamptz        |                            |                                                    |

**Indexes:** gender, city, country, is_verified (partial)
**RLS:** Readable by visibility setting; owner can update

---

## Table: `profile_photos`

Ordered photos on user profiles.

| Column           | Type        | Constraints        | Description                        |
| ---------------- | ----------- | ------------------ | ---------------------------------- |
| id               | uuid        | PK                 |                                    |
| user_id          | uuid        | FK→users, NOT NULL | Photo owner                        |
| media_id         | uuid        | FK→media           | Reference to media record          |
| telegram_file_id | text        |                    | Direct Telegram file ID (fallback) |
| sort_order       | smallint    | default 0          | Display order                      |
| is_primary       | boolean     | default false      | Primary profile photo              |
| created_at       | timestamptz |                    |                                    |

**Indexes:** user_id, user_id+is_primary (partial)

---

## Table: `profile_preferences`

Discovery/dating filter preferences (1:1 with users).

| Column            | Type          | Constraints      | Description                |
| ----------------- | ------------- | ---------------- | -------------------------- |
| id                | uuid          | PK               |                            |
| user_id           | uuid          | FK→users, UNIQUE | Owner                      |
| min_age           | smallint      | >= 18            | Minimum age preference     |
| max_age           | smallint      | >= min_age       | Maximum age preference     |
| preferred_genders | gender[]      |                  | Array of preferred genders |
| max_distance_km   | integer       | >= 1             | Discovery radius           |
| dating_intent     | dating_intent |                  | Preferred intent           |
| discovery_enabled | boolean       | default true     | Enable discovery           |
| show_in_discovery | boolean       | default true     | Visible in discovery       |
| created_at        | timestamptz   |                  |                            |
| updated_at        | timestamptz   |                  |                            |

---

## Table: `interests`

Available interest tags catalog.

| Column     | Type        | Constraints  | Description             |
| ---------- | ----------- | ------------ | ----------------------- |
| id         | uuid        | PK           |                         |
| name       | text        | NOT NULL     | Display name            |
| slug       | text        | UNIQUE       | URL-friendly identifier |
| category   | text        |              | Interest category       |
| is_active  | boolean     | default true | Available for use       |
| created_at | timestamptz |              |                         |

**Indexes:** slug, category, is_active (partial)

---

## Table: `profile_interests`

Many-to-many relationship between profiles and interests.

| Column      | Type        | Constraints      | Description |
| ----------- | ----------- | ---------------- | ----------- |
| profile_id  | uuid        | PK, FK→profiles  |             |
| interest_id | uuid        | PK, FK→interests |             |
| created_at  | timestamptz |                  |             |

**Indexes:** interest_id

---

## Table: `follows`

Social graph follow relationships.

| Column       | Type        | Constraints  | Description             |
| ------------ | ----------- | ------------ | ----------------------- |
| follower_id  | uuid        | PK, FK→users | The user who follows    |
| following_id | uuid        | PK, FK→users | The user being followed |
| created_at   | timestamptz |              |                         |

**Constraint:** follower_id != following_id
**Indexes:** following_id, created_at

---

## Table: `posts`

Social feed posts.

| Column           | Type            | Constraints      | Description          |
| ---------------- | --------------- | ---------------- | -------------------- |
| id               | uuid            | PK               |                      |
| author_id        | uuid            | FK→users         | Post author          |
| caption          | text            |                  | Post text content    |
| post_type        | post_type       | default 'text'   | Type of post         |
| visibility       | post_visibility | default 'public' | Who can see          |
| comments_enabled | boolean         | default true     |                      |
| like_count       | integer         | default 0        | Denormalized counter |
| comment_count    | integer         | default 0        | Denormalized counter |
| created_at       | timestamptz     |                  |                      |
| updated_at       | timestamptz     |                  |                      |
| deleted_at       | timestamptz     |                  | Soft delete          |

**Indexes:** author_id, created_at DESC, visibility, active (partial)

---

## Table: `post_likes`

Like/unlike engagement on posts.

| Column     | Type        | Constraints  | Description |
| ---------- | ----------- | ------------ | ----------- |
| post_id    | uuid        | PK, FK→posts |             |
| user_id    | uuid        | PK, FK→users |             |
| created_at | timestamptz |              |             |

**Indexes:** user_id

---

## Table: `post_comments`

Comments on posts with threading support.

| Column            | Type        | Constraints      | Description    |
| ----------------- | ----------- | ---------------- | -------------- |
| id                | uuid        | PK               |                |
| post_id           | uuid        | FK→posts         | Parent post    |
| author_id         | uuid        | FK→users         | Comment author |
| parent_comment_id | uuid        | FK→post_comments | Thread parent  |
| content           | text        | NOT NULL         | Comment text   |
| created_at        | timestamptz |                  |                |
| updated_at        | timestamptz |                  |                |
| deleted_at        | timestamptz |                  | Soft delete    |

**Indexes:** post_id+created_at, author_id, parent_comment_id (partial)

---

## Table: `post_reactions`

Rich reactions (like, love, haha, etc.).

| Column     | Type          | Constraints  | Description      |
| ---------- | ------------- | ------------ | ---------------- |
| post_id    | uuid          | PK, FK→posts |                  |
| user_id    | uuid          | PK, FK→users |                  |
| reaction   | reaction_type | NOT NULL     | Type of reaction |
| created_at | timestamptz   |              |                  |

**Constraint:** unique (post_id, user_id) for upsert

---

## Table: `post_saves`

Bookmark/save posts for later.

| Column     | Type        | Constraints  | Description |
| ---------- | ----------- | ------------ | ----------- |
| post_id    | uuid        | PK, FK→posts |             |
| user_id    | uuid        | PK, FK→users |             |
| created_at | timestamptz |              |             |

**Indexes:** user_id

---

## Table: `media`

Media file metadata (not the files themselves).

| Column             | Type                    | Constraints        | Description           |
| ------------------ | ----------------------- | ------------------ | --------------------- |
| id                 | uuid                    | PK                 |                       |
| owner_id           | uuid                    | FK→users           | Uploader              |
| media_type         | media_type              | NOT NULL           | image/video/audio     |
| storage_provider   | storage_provider        | default 'telegram' | Where file is stored  |
| provider_file_id   | text                    |                    | Telegram file_id      |
| storage_path       | text                    |                    | Supabase Storage path |
| mime_type          | text                    |                    |                       |
| file_size          | integer                 |                    | Bytes                 |
| width              | integer                 |                    | Pixels                |
| height             | integer                 |                    | Pixels                |
| duration_seconds   | numeric                 |                    | For video/audio       |
| thumbnail_media_id | uuid                    | FK→media           | Thumbnail reference   |
| processing_status  | media_processing_status | default 'pending'  |                       |
| created_at         | timestamptz             |                    |                       |
| deleted_at         | timestamptz             |                    | Soft delete           |

**Indexes:** owner_id, storage_provider, processing_status (partial)

---

## Table: `post_media`

Many-to-many between posts and media.

| Column     | Type     | Constraints  | Description   |
| ---------- | -------- | ------------ | ------------- |
| post_id    | uuid     | PK, FK→posts |               |
| media_id   | uuid     | PK, FK→media |               |
| sort_order | smallint | default 0    | Display order |

---

## Table: `stories`

Ephemeral content expiring after 24 hours.

| Column     | Type             | Constraints              | Description |
| ---------- | ---------------- | ------------------------ | ----------- |
| id         | uuid             | PK                       |             |
| author_id  | uuid             | FK→users                 |             |
| media_id   | uuid             | FK→media                 |             |
| caption    | text             |                          |             |
| visibility | story_visibility | default 'followers_only' |             |
| created_at | timestamptz      |                          |             |
| expires_at | timestamptz      | default now()+24h        |             |
| deleted_at | timestamptz      |                          | Soft delete |

**Indexes:** author_id, expires_at, active (partial)

---

## Table: `story_views`

Track who viewed stories.

| Column    | Type        | Constraints    | Description |
| --------- | ----------- | -------------- | ----------- |
| story_id  | uuid        | PK, FK→stories |             |
| viewer_id | uuid        | PK, FK→users   |             |
| viewed_at | timestamptz |                |             |

---

## Table: `dating_actions`

Swipe/like/pass/super_like actions.

| Column     | Type               | Constraints | Description              |
| ---------- | ------------------ | ----------- | ------------------------ |
| id         | uuid               | PK          |                          |
| actor_id   | uuid               | FK→users    | Who performed the action |
| target_id  | uuid               | FK→users    | Who received the action  |
| action     | dating_action_type | NOT NULL    |                          |
| created_at | timestamptz        |             |                          |

**Constraint:** actor_id != target_id, unique (actor_id, target_id)
**Indexes:** actor_id+created_at, target_id+action, target_id+action (partial) for likes

---

## Table: `matches`

Mutual match records (one per pair).

| Column       | Type         | Constraints      | Description |
| ------------ | ------------ | ---------------- | ----------- |
| id           | uuid         | PK               |             |
| user_a_id    | uuid         | FK→users         | Lower UUID  |
| user_b_id    | uuid         | FK→users         | Higher UUID |
| status       | match_status | default 'active' |             |
| matched_at   | timestamptz  |                  |             |
| unmatched_at | timestamptz  |                  |             |
| created_at   | timestamptz  |                  |             |
| updated_at   | timestamptz  |                  |             |

**Constraint:** user_a_id < user_b_id, unique pair

---

## Table: `blocks`

User blocking system.

| Column     | Type         | Constraints      | Description |
| ---------- | ------------ | ---------------- | ----------- |
| blocker_id | uuid         | PK, FK→users     |             |
| blocked_id | uuid         | PK, FK→users     |             |
| source     | block_source | default 'manual' |             |
| created_at | timestamptz  |                  |             |

---

## Table: `conversations`

Chat conversation metadata.

| Column     | Type        | Constraints   | Description  |
| ---------- | ----------- | ------------- | ------------ |
| id         | uuid        | PK            |              |
| is_group   | boolean     | default false |              |
| title      | text        |               | Null for 1:1 |
| created_by | uuid        | FK→users      |              |
| created_at | timestamptz |               |              |
| updated_at | timestamptz |               |              |

---

## Table: `conversation_members`

Participants in conversations.

| Column          | Type        | Constraints          | Description                 |
| --------------- | ----------- | -------------------- | --------------------------- |
| conversation_id | uuid        | PK, FK→conversations |                             |
| user_id         | uuid        | PK, FK→users         |                             |
| joined_at       | timestamptz |                      |                             |
| last_read_at    | timestamptz |                      | Last message read timestamp |
| is_active       | boolean     | default true         |                             |

---

## Table: `messages`

Individual messages within conversations.

| Column          | Type        | Constraints      | Description      |
| --------------- | ----------- | ---------------- | ---------------- |
| id              | uuid        | PK               |                  |
| conversation_id | uuid        | FK→conversations |                  |
| sender_id       | uuid        | FK→users         |                  |
| content         | text        |                  | Message body     |
| reply_to_id     | uuid        | FK→messages      | Thread reference |
| created_at      | timestamptz |                  |                  |
| edited_at       | timestamptz |                  |                  |
| deleted_at      | timestamptz |                  | Soft delete      |

---

## Table: `message_attachments`

Media/files attached to messages.

| Column     | Type        | Constraints | Description |
| ---------- | ----------- | ----------- | ----------- |
| id         | uuid        | PK          |             |
| message_id | uuid        | FK→messages |             |
| media_id   | uuid        | FK→media    |             |
| created_at | timestamptz |             |             |

---

## Table: `message_reads`

Per-message read receipts.

| Column     | Type        | Constraints     | Description |
| ---------- | ----------- | --------------- | ----------- |
| message_id | uuid        | PK, FK→messages |             |
| user_id    | uuid        | PK, FK→users    |             |
| read_at    | timestamptz |                 |             |

---

## Table: `communities`

Interest-based groups.

| Column          | Type                 | Constraints      | Description |
| --------------- | -------------------- | ---------------- | ----------- |
| id              | uuid                 | PK               |             |
| name            | text                 | NOT NULL         |             |
| slug            | text                 | UNIQUE           |             |
| description     | text                 |                  |             |
| owner_id        | uuid                 | FK→users         |             |
| avatar_media_id | text                 |                  |             |
| visibility      | community_visibility | default 'public' |             |
| is_active       | boolean              | default true     |             |
| member_count    | integer              | default 0        |             |
| created_at      | timestamptz          |                  |             |
| updated_at      | timestamptz          |                  |             |
| deleted_at      | timestamptz          |                  |             |

---

## Table: `community_members`

Many-to-many community membership.

| Column       | Type        | Constraints        | Description |
| ------------ | ----------- | ------------------ | ----------- |
| community_id | uuid        | PK, FK→communities |             |
| user_id      | uuid        | PK, FK→users       |             |
| role         | user_role   | default 'user'     |             |
| joined_at    | timestamptz |                    |             |

---

## Table: `notifications`

In-app and push notification records.

| Column       | Type                 | Constraints      | Description                     |
| ------------ | -------------------- | ---------------- | ------------------------------- |
| id           | uuid                 | PK               |                                 |
| recipient_id | uuid                 | FK→users         |                                 |
| type         | notification_type    | NOT NULL         |                                 |
| actor_id     | uuid                 | FK→users         | Who triggered the notification  |
| entity_type  | text                 |                  | Entity type (post, match, etc.) |
| entity_id    | text                 |                  | Entity UUID                     |
| title        | text                 |                  |                                 |
| body         | text                 |                  |                                 |
| metadata     | jsonb                | default '{}'     |                                 |
| channel      | notification_channel | default 'in_app' |                                 |
| is_read      | boolean              | default false    |                                 |
| read_at      | timestamptz          |                  |                                 |
| created_at   | timestamptz          |                  |                                 |

---

## Table: `purchases`

Purchase records for virtual goods.

| Column                  | Type                  | Constraints              | Description               |
| ----------------------- | --------------------- | ------------------------ | ------------------------- |
| id                      | uuid                  | PK                       |                           |
| user_id                 | uuid                  | FK→users                 |                           |
| product_type            | product_type          | NOT NULL                 |                           |
| provider                | subscription_provider | default 'telegram_stars' |                           |
| provider_transaction_id | text                  |                          |                           |
| amount                  | integer               |                          | In smallest currency unit |
| currency                | text                  | default 'XTR'            |                           |
| status                  | purchase_status       | default 'pending'        |                           |
| metadata                | jsonb                 | default '{}'             |                           |
| created_at              | timestamptz           |                          |                           |
| updated_at              | timestamptz           |                          |                           |

---

## Table: `subscriptions`

Premium subscription records.

| Column                   | Type                  | Constraints              | Description |
| ------------------------ | --------------------- | ------------------------ | ----------- |
| id                       | uuid                  | PK                       |             |
| user_id                  | uuid                  | FK→users                 |             |
| plan                     | text                  | NOT NULL                 |             |
| status                   | subscription_status   | default 'active'         |             |
| provider                 | subscription_provider | default 'telegram_stars' |             |
| provider_subscription_id | text                  |                          |             |
| purchase_id              | uuid                  | FK→purchases             |             |
| starts_at                | timestamptz           |                          |             |
| expires_at               | timestamptz           |                          |             |
| cancelled_at             | timestamptz           |                          |             |
| created_at               | timestamptz           |                          |             |
| updated_at               | timestamptz           |                          |             |

---

## Table: `subscription_events`

Audit trail for subscription changes.

| Column          | Type                | Constraints      | Description |
| --------------- | ------------------- | ---------------- | ----------- |
| id              | uuid                | PK               |             |
| subscription_id | uuid                | FK→subscriptions |             |
| event_type      | text                | NOT NULL         |             |
| old_status      | subscription_status |                  |             |
| new_status      | subscription_status | NOT NULL         |             |
| metadata        | jsonb               | default '{}'     |             |
| created_at      | timestamptz         |                  |             |

---

## Table: `reports`

User/content reports for moderation.

| Column              | Type          | Constraints       | Description |
| ------------------- | ------------- | ----------------- | ----------- |
| id                  | uuid          | PK                |             |
| reporter_id         | uuid          | FK→users          |             |
| reported_user_id    | uuid          | FK→users          | Nullable    |
| reported_post_id    | uuid          | FK→posts          | Nullable    |
| reported_message_id | uuid          | FK→messages       | Nullable    |
| reason              | report_reason | NOT NULL          |             |
| details             | text          |                   |             |
| status              | report_status | default 'pending' |             |
| reviewed_by         | uuid          | FK→users          | Nullable    |
| reviewed_at         | timestamptz   |                   |             |
| created_at          | timestamptz   |                   |             |

---

## Table: `referral_codes`

Unique referral codes per user.

| Column      | Type        | Constraints      | Description         |
| ----------- | ----------- | ---------------- | ------------------- |
| id          | uuid        | PK               |                     |
| user_id     | uuid        | FK→users, UNIQUE |                     |
| code        | text        | UNIQUE           | Short referral code |
| usage_count | integer     | default 0        |                     |
| is_active   | boolean     | default true     |                     |
| created_at  | timestamptz |                  |                     |

---

## Table: `referrals`

Successful referral records.

| Column           | Type        | Constraints       | Description |
| ---------------- | ----------- | ----------------- | ----------- |
| id               | uuid        | PK                |             |
| referrer_id      | uuid        | FK→users          |             |
| referred_user_id | uuid        | FK→users, UNIQUE  |             |
| referral_code_id | uuid        | FK→referral_codes |             |
| source           | text        |                   |             |
| created_at       | timestamptz |                   |             |

---

## Table: `referral_rewards`

Rewards earned through referrals.

| Column      | Type                   | Constraints       | Description |
| ----------- | ---------------------- | ----------------- | ----------- |
| id          | uuid                   | PK                |             |
| referral_id | uuid                   | FK→referrals      |             |
| reward_type | text                   | NOT NULL          |             |
| amount      | integer                | default 1         |             |
| status      | referral_reward_status | default 'pending' |             |
| awarded_at  | timestamptz            |                   |             |
| created_at  | timestamptz            |                   |             |

---

## Table: `system_config`

Key-value configuration store (admin only).

| Column      | Type        | Constraints | Description |
| ----------- | ----------- | ----------- | ----------- |
| key         | text        | PK          |             |
| value       | jsonb       | NOT NULL    |             |
| description | text        |             |             |
| updated_by  | uuid        | FK→users    |             |
| created_at  | timestamptz |             |             |
| updated_at  | timestamptz |             |             |

---

## Table: `feature_flags`

Feature toggle management (admin only).

| Column      | Type        | Constraints   | Description     |
| ----------- | ----------- | ------------- | --------------- |
| key         | text        | PK            |                 |
| enabled     | boolean     | default false |                 |
| description | text        |               |                 |
| rules       | jsonb       |               | Targeting rules |
| updated_by  | uuid        | FK→users      |                 |
| created_at  | timestamptz |               |                 |
| updated_at  | timestamptz |               |                 |

---

## Table: `admin_audit_log`

Audit trail for admin actions.

| Column      | Type        | Constraints  | Description |
| ----------- | ----------- | ------------ | ----------- |
| id          | uuid        | PK           |             |
| admin_id    | uuid        | FK→users     |             |
| action      | text        | NOT NULL     |             |
| entity_type | text        |              |             |
| entity_id   | text        |              |             |
| details     | jsonb       | default '{}' |             |
| ip_address  | inet        |              |             |
| created_at  | timestamptz |              |             |

---

## Table: `recommendation_impressions`

Tracks recommendation exposure for feedback loop and ranking improvement.

| Column            | Type        | Constraints        | Description                           |
| ----------------- | ----------- | ------------------ | ------------------------------------- |
| id                | uuid        | PK                 |                                       |
| viewer_id         | uuid        | FK→users           | Who received the recommendation       |
| candidate_id      | uuid        | FK→users           | Who was recommended                   |
| mode              | text        |                    | social | dating                     |
| request_id        | text        |                    | Opaque request grouping ID            |
| ranking_version   | text        |                    | Which ranking config was used          |
| position          | integer     |                    | Display position (0-indexed)          |
| score_bucket      | text        |                    | high / medium / low                   |
| interaction_type  | text        |                    | like / pass / follow / view / match   |
| interacted_at     | timestamptz |                    | When user interacted                   |
| created_at        | timestamptz |                    |                                       |

**Indexes:** viewer_id, candidate_id, viewer_id+candidate_id, request_id
**RLS:** Viewers can SELECT own impressions; no INSERT/UPDATE/DELETE from client

---

## Table: `analytics_events`

Lightweight event tracking.

| Column      | Type        | Constraints  | Description |
| ----------- | ----------- | ------------ | ----------- |
| id          | uuid        | PK           |             |
| user_id     | uuid        | FK→users     | Nullable    |
| event_name  | text        | NOT NULL     |             |
| entity_type | text        |              |             |
| entity_id   | text        |              |             |
| properties  | jsonb       | default '{}' |             |
| created_at  | timestamptz |              |             |

---

## Enum Types Reference

| Enum                    | Values                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| gender                  | male, female, non_binary, prefer_not_to_say                                                                                                  |
| dating_intent           | dating, friendship, chat, relationship, not_sure                                                                                             |
| post_type               | text, image, video, poll                                                                                                                     |
| media_type              | image, video, audio                                                                                                                          |
| media_processing_status | pending, processing, ready, failed                                                                                                           |
| storage_provider        | telegram, supabase, external_cdn                                                                                                             |
| reaction_type           | like, love, haha, wow, sad, angry                                                                                                            |
| dating_action_type      | like, pass, super_like                                                                                                                       |
| match_status            | active, unmatched, blocked                                                                                                                   |
| report_status           | pending, reviewing, resolved, dismissed                                                                                                      |
| report_reason           | spam, harassment, nudity, hate_speech, violence, impersonation, copyright, other                                                             |
| block_source            | manual, auto_moderation                                                                                                                      |
| subscription_status     | active, cancelled, expired, paused                                                                                                           |
| subscription_provider   | telegram_stars, app_store, play_store                                                                                                        |
| product_type            | premium_subscription, boost, super_like, gift, spotlight                                                                                     |
| purchase_status         | pending, completed, failed, refunded, cancelled                                                                                              |
| user_role               | user, moderator, admin, super_admin                                                                                                          |
| notification_type       | new_match, new_message, post_like, post_comment, new_follower, story_view, subscription_expired, subscription_renewed, report_update, system |
| post_visibility         | public, followers_only, private                                                                                                              |
| story_visibility        | public, followers_only                                                                                                                       |
| profile_visibility      | public, matches_only, private                                                                                                                |
| online_visibility       | everyone, matches_only, nobody                                                                                                               |
| community_visibility    | public, private                                                                                                                              |
| notification_channel    | in_app, push, email                                                                                                                          |
| referral_reward_status  | pending, awarded, expired                                                                                                                    |
