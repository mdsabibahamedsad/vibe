# Privacy Architecture

## Data Inventory

### User Identity

| Data | Purpose | Source | Storage | Access | Retention |
|------|---------|--------|---------|--------|-----------|
| Telegram User ID | Authentication, identity | Telegram initData | `users.telegram_user_id` | User, Admin | Account lifetime |
| Display name | Profile display | Telegram initData, user update | `users.display_name` | Public | Account lifetime |
| Username | @mention reference | Telegram initData | `users.telegram_username` | Public | Account lifetime |
| First/Last name | Profile | Telegram initData | `users.first_name`, `users.last_name` | User, Admin | Account lifetime |

### Profile Data

| Data | Purpose | Source | Storage | Access | Retention |
|------|---------|--------|---------|--------|-----------|
| Bio | Self-description | User input | `profiles.bio` | Public | Account lifetime |
| Date of birth | Age verification | User input | `profiles.date_of_birth` | User + age only publicly | Account lifetime |
| Gender | Profile, matching | User selection | `profiles.gender` | Configurable visibility | Account lifetime |
| Photos | Profile display | User upload | Storage bucket + `profile_photos` | Public | Until deleted |
| City | Discovery | User input, location | `profiles.city` | Configurable visibility | Account lifetime |
| Interests | Matching, recommendations | User selection | `profile_interests` | Public | Account lifetime |

### Dating Preferences (Sensitive)

| Data | Purpose | Storage | Access | Retention |
|------|---------|---------|--------|-----------|
| Age preference | Matching | `profile_preferences.min/max_age` | User only | Account lifetime |
| Gender preference | Matching | `profile_preferences.preferred_genders` | User only | Account lifetime |
| Dating intent | Matching | `profiles.dating_intent` | Configurable | Account lifetime |
| Location (lat/lng) | Distance-based matching | `profiles.latitude/longitude` | Never exposed to others | Account lifetime |
| Discovery preference | Discovery eligibility | `profile_preferences.discovery_enabled` | User only | Account lifetime |

### Messages (Private)

| Data | Purpose | Storage | Access | Retention |
|------|---------|---------|--------|-----------|
| Message content | Communication | `messages.content` | Conversation participants only | 90 days or per policy |
| Message metadata | Chat functionality | `messages.*` | Conversation participants | 90 days |
| Read receipts | Chat UX | `message_reads` | Conversation participants | 90 days |

### Media (Private)

| Data | Purpose | Storage | Access | Retention |
|------|---------|---------|--------|-----------|
| Profile photos | Profile display | Supabase Storage (public) | Public | Until deleted |
| Post media | Content sharing | Supabase Storage (public) | Public | Until deleted or 30d after post delete |
| Story media | Stories | Supabase Storage (public) | Followers/Public | 24-48 hours |
| Message attachments | Chat | Supabase Storage (private) | Conversation participants | 90 days |
| Verification selfies | Identity verification | Supabase Storage (admin-only) | Moderators only | 90 days after review |

### Payments & Financial (Sensitive)

| Data | Purpose | Storage | Access | Retention |
|------|---------|---------|--------|-----------|
| Purchase records | Transaction history | `purchases` | User, Admin | 3 years (financial records) |
| Subscription history | Premium access | `subscriptions` | User, Admin | 3 years |
| Payout records | Creator earnings | Creator earnings tables | Creator, Admin | 3 years |
| Telegram payment info | Payment processing | Provider-managed | Provider only | Per Telegram policy |

### Verification & Trust (Internal)

| Data | Purpose | Storage | Access | Retention |
|------|---------|---------|--------|-----------|
| Verification requests | Identity verification | `verification_requests` | User, Moderators | 90 days |
| Trust profile | Safety scoring | `trust_profiles` | Moderators only | 90 days after account deletion |
| Safety signals | Abuse detection | `safety_signals` | Moderators only | 90 days |
| Internal trust tier | Scoring | `trust_profiles.internal_trust_tier` | Never exposed | 90 days after deletion |

### Support & Moderation

| Data | Purpose | Storage | Access | Retention |
|------|---------|---------|--------|-----------|
| Support tickets | User assistance | `support_tickets` | User, Support staff | 1 year after closure |
| Reports | Content moderation | `reports` | Reporter, Moderators | 1 year |
| Moderation actions | Enforcement history | `moderation_actions` | Moderators only | 1 year |
| Appeals | Moderation review | `appeals` | User, Moderators | 1 year |

### Analytics (Aggregated)

| Data | Purpose | Storage | Access | Retention |
|------|---------|---------|--------|-----------|
| Event logs | Product analytics | `analytics_events` | Admin only | 90 days |
| Dashboard metrics | Business metrics | `safety_metrics`, `mv_daily_engagement` | Admin only | 3 years |

## Data Classification

| Classification | Definition | Examples | Access Control | Logging |
|---------------|-----------|----------|---------------|---------|
| **Public** | Intended for public visibility | Display name, bio, photos, public interests | No auth required | Standard |
| **Internal** | Not public but low sensitivity | Analytics aggregates, feature flags | Admin/Internal | Standard |
| **Private** | User-specific non-public | Messages, dating preferences, read receipts | User + authorized participants | Standard |
| **Sensitive** | High sensitivity, regulated | Verification selfies, payment records, location | Strict role-based access | Audit logged |
| **Highly Restricted** | Critical security | Bot token, service role key, session secrets | Infrastructure only | Never logged |

## Data Minimization

- **Analytics events**: No message content, no PII, minimal user identifiers
- **AI processing**: No private messages, no verification documents sent to external providers
- **Location**: Approximate only, never precise coordinates exposed to users
- **Profile**: Only fields user explicitly provides, no inferred data collection
- **Payments**: Server-authoritative records only, no client-provided pricing

## Consent & Preferences

| Category | Configurable | Default | Where |
|----------|-------------|---------|-------|
| Profile visibility | Yes | Public | Privacy settings |
| Message requests | Yes | Everyone | Message request settings |
| Discovery participation | Yes | Enabled | Discovery preferences |
| Location visibility | Yes | Region | Privacy settings |
| Activity status | Yes | Visible | Privacy settings |
| Read receipts | Not yet | Enabled | Planned |
| Notification preferences | Yes | All enabled | Notification settings |
| Analytics participation | Not yet | Always | Product requirement |

## Data Export (User-Facing)

Users can export their data via the account settings. The export includes:
- Profile information
- Posts and comments
- Preferences and settings
- Connection history
- Transaction history

The export NEVER includes:
- Other users' private information
- Internal moderation evidence
- Security secrets or tokens
- Internal trust scores
- Safety signals

## Third-Party Processors

| Processor | Data | Purpose | Location |
|-----------|------|---------|----------|
| Telegram | InitData, payment info | Auth, payments | Telegram servers |
| Supabase | All application data | Database, storage, auth | Supabase cloud (multi-region) |
| Vercel | Application hosting | Frontend + API hosting | Vercel edge network |

## Retention Policy Summary

| Data Category | Active Retention | Archive/Cleanup | Legal Hold |
|---------------|-----------------|-----------------|------------|
| Messages | 90 days | Deleted after 90 days | If legally required |
| Stories | 24-48 hours | Expired + 24h grace | Not retained |
| Profile data | Account lifetime | Anonymized on deletion | Financial records preserved |
| Payment records | 3 years | Retained for tax/audit | Yes |
| Analytics events | 90 days | Aggregated, raw deleted | Not retained |
| Safety signals | 90 days | Auto-expired | If legally required |
| Verification evidence | 90 days after review | Deleted | If legally required |
| Support tickets | 1 year after closure | Deleted | If legally required |
| Logs | 30 days | Rotated | If legally required |
