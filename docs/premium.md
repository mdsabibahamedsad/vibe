# Vibe — Premium Features

## Overview

Premium subscriptions unlock exclusive features that enhance the Vibe experience. This document describes the feature catalog, entitlement system, and integration points.

## Premium Feature Catalog

### Premium Badge
- **Key**: `premium_badge`
- **Description**: Shows an exclusive premium badge on the user's profile
- **Integration**: Profile display, discovery cards, chat, feed
- **Server check**: `hasEntitlement(userId, 'premium_badge')`

### Advanced Discovery
- **Key**: `advanced_discovery`
- **Description**: Additional discovery filters and sorting options
- **Integration**: Discovery engine filters
- **Server check**: Applied as additional filter parameters in discovery queries

### Unlimited Likes
- **Key**: `unlimited_likes`
- **Description**: No daily limit on likes in discovery
- **Integration**: Like action rate limiter
- **Server check**: `getDailyLikeLimit(userId)` returns 999999 for premium

### Advanced Filters
- **Key**: `advanced_filters`
- **Description**: Filter by additional criteria beyond basic age/gender
- **Integration**: Profile preference filters
- **Server check**: Additional filter parameters accepted for premium users

### Profile Boost
- **Key**: `profile_boost`
- **Description**: Get your profile seen by more people
- **Integration**: Recommendation engine ranking
- **Server check**: Boost affects discovery ranking temporarily

### Rewind
- **Key**: `rewind`
- **Description**: Go back to a profile you passed on
- **Integration**: Dating action service
- **Server check**: `requireEntitlement(userId, 'rewind')` before allowing rewind action

### Who Liked You
- **Key**: `who_liked_you`
- **Description**: See who liked you before you swipe
- **Integration**: Dating action queries
- **Server check**: `requireEntitlement(userId, 'who_liked_you')` on the likes list endpoint

### Read Receipts
- **Key**: `read_receipts`
- **Description**: See when your messages are read
- **Integration**: Chat message read tracking
- **Server check**: `hasEntitlement(userId, 'read_receipts')` controls read receipt visibility

### Incognito Mode
- **Key**: `incognito_mode`
- **Description**: Browse profiles without being seen
- **Integration**: Profile visibility and last_seen tracking
- **Server check**: Hides user from others' "who viewed" lists

## Entitlement Checking Architecture

### Server-Side (Enforcement)

```typescript
// Centralized check
import { hasEntitlement, requireEntitlement } from "@/lib/billing/entitlement.service";

// Soft check (for UI logic)
const canRewind = await hasEntitlement(userId, "rewind");

// Hard check (for API enforcement)
await requireEntitlement(userId, "who_liked_you"); // Throws 403 if not entitled
```

### Client-Side (UX Only)

```typescript
// Show/hide UI elements based on entitlements
const entitlements = await getUserEntitlements(userId);
const hasBadge = entitlements.includes("premium_badge");
```

## Integration Points

| System | Integration |
|--------|-------------|
| Discovery (Prompt 13) | Premium filters, unlimited likes, boost |
| Chat (Prompt 09) | Read receipts |
| Dating (Prompt 07) | Rewind, who liked you |
| Profile | Premium badge |
| Feed | Premium badge |
| Stories | Premium badge |
| Media | Premium badge |
| Rate Limiting | Higher limits for premium users |

## Security

1. **Never trust client state**: All premium features are checked server-side
2. **Entitlement expiration**: Checked on every request
3. **No cache poisoning**: Stale cache never grants premium permanently
4. **Feature flag separation**: Premium entitlements are separate from feature flags
