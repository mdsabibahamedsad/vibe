# Account Deletion

## Deletion Flow

When a user requests account deletion, the following steps occur server-side:

### 1. Initiate Deletion

**Trigger**: User requests deletion from Settings → Account → Delete Account

**Validation**:
- User must be authenticated
- User must confirm deletion (double opt-in)
- Cooling-off period: 48-hour delay before irreversible deletion

### 2. Revoke Sessions

- All active sessions are revoked
- Refresh tokens invalidated
- User is logged out of all devices
- Realtime subscriptions closed

### 3. Disable Account

- Account status set to `deleted`
- Login prevented
- Profile hidden from all discovery, search, and recommendations
- Messages show "Deleted User" instead of display name

### 4. Anonymize Personal Data

| Data | Action | Timing |
|------|--------|--------|
| Display name | Replaced with "Deleted User" | Immediate |
| Username | Released for reuse | Immediate |
| Bio | Cleared | Immediate |
| Avatar/Photos | Removed from profile | Immediate |
| Date of birth | Anonymized | Immediate |
| Gender | Cleared | Immediate |
| Phone/Email | Cleared | Immediate |
| Telegram user ID | Anonymized from public references | Immediate |

### 5. Handle Content

| Content | Action | Timing |
|---------|--------|--------|
| Posts | Author set to deleted user, content preserved for moderation | Immediate |
| Comments | Author set to deleted user, content preserved | Immediate |
| Messages | Sender shown as "Deleted User", content preserved | Immediate |
| Stories | Deleted immediately | Immediate |
| Profile photos | Removed from storage | Within 24 hours |
| Post media | Remains accessible (referenced by others) | Per retention policy |

### 6. Social Graph

| Relationship | Action | Timing |
|-------------|--------|--------|
| Follows | Removed | Immediate |
| Matches | Status set to `deleted` | Immediate |
| Blocks | Preserved (blocking harmful users still valid) | Immediate |

### 7. Dating Data

| Data | Action | Timing |
|------|--------|--------|
| Dating actions | Anonymized (actor reference removed) | Immediate |
| Dating preferences | Cleared | Immediate |
| Discovery participation | Disabled | Immediate |

### 8. Support & Moderation

| Data | Action | Timing |
|------|--------|--------|
| Support tickets | Anonymized (personal info removed) | Within 7 days |
| Reports filed | Reporter reference anonymized | Immediate |
| Reports received | Target reference preserved for moderation | Per retention policy |
| Moderation actions | Target reference preserved | Per retention policy |
| Appeals | Anonymized | Immediate |

### 9. Payment & Financial Records

| Data | Action | Timing | Reason |
|------|--------|--------|--------|
| Purchase history | Preserved (immutable) | 3 years | Legal/audit requirement |
| Subscription history | Preserved | 3 years | Legal requirement |
| Creator earnings | Preserved | 3 years | Financial record |
| Payout records | Preserved | 3 years | Tax/audit |
| Payment method | (Telegram-managed, not stored) | N/A | N/A |

### 10. Verification & Trust

| Data | Action | Timing |
|------|--------|--------|
| Verification requests | Anonymized | Within 7 days |
| Verification media | Deleted from storage | Within 24 hours |
| Trust profile | Cleared of personal data | Immediate |
| Safety signals | Anonymized | Immediate |

### 11. Analytics

| Data | Action | Timing | Reason |
|------|--------|--------|--------|
| Analytics events | Anonymized (user ID replaced) | Immediate | Product analytics |
| Aggregated metrics | Preserved | Permanent | Business intelligence |

## Implementation

### Admin Deletion

Admins can also initiate account deletion:
- Requires `USERS_BAN` or equivalent permission
- Logged in audit trail
- Notification sent to user

### Data Export Before Deletion

Users are offered a data export before deletion completes:
- Profile data (JSON)
- Post history (JSON)
- Transaction history (JSON)
- Chat history (JSON) — own messages only

### Irreversibility

- After the 48-hour cooling-off period, deletion is irreversible
- Data cannot be restored
- User must create a new account to use the platform again
- Previous content (posts, comments) remain visible with "Deleted User" attribution

## Testing

The deletion flow should be tested for:
- [ ] All personal data is properly anonymized
- [ ] Financial records are preserved
- [ ] User can log in during cooling-off period
- [ ] User cannot log in after deletion completes
- [ ] Profile is hidden from discovery
- [ ] Messages show "Deleted User"
- [ ] Data export contains correct data
- [ ] Admin audit log records the deletion
