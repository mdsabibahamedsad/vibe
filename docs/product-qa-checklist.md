# Product QA Checklist

## End-to-End Test Scenarios

### Scenario 1: New User Journey

```
Telegram → Onboarding → Profile → Discovery → First Interaction
```

| Step | Action | Expected Result | Pass/Fail |
|------|--------|----------------|-----------|
| 1.1 | Open Telegram Mini App | App loads within 3 seconds | □ |
| 1.2 | Click "Start" / Authenticate | Telegram login prompt appears | □ |
| 1.3 | Complete Telegram authentication | Redirected to onboarding | □ |
| 1.4 | Complete basic profile (name, DOB, gender) | Progress shown, next step loads | □ |
| 1.5 | Upload profile photo | Photo uploads, preview shows | □ |
| 1.6 | Select interests (3 minimum) | Interests saved, next step loads | □ |
| 1.7 | Set discovery preferences | Preferences saved | □ |
| 1.8 | Complete onboarding | Redirected to home screen | □ |
| 1.9 | View discovery feed | Profiles load with pagination | □ |
| 1.10 | Like a profile (dating) / Follow (social) | Action succeeds without error | □ |

### Scenario 2: Dating Flow

```
Profile → Preferences → Discovery → Like → Match → Conversation → Date Coordination
```

| Step | Action | Expected Result | Pass/Fail |
|------|--------|----------------|-----------|
| 2.1 | Set dating intent and preferences | Preferences saved to profile | □ |
| 2.2 | Open discovery in dating mode | Dating profiles shown | □ |
| 2.3 | Swipe/like a profile | Like recorded, UI updates | □ |
| 2.4 | Another user likes back (coordinated) | Match celebration shown | □ |
| 2.5 | Send first message in matched chat | Message delivered in realtime | □ |
| 2.6 | Receive reply (coordinated) | Notification appears | □ |
| 2.7 | Send image in chat | Image uploaded and displayed | □ |
| 2.8 | Block the match | Chat closed, block enforced | □ |

### Scenario 3: Social Feed

```
Feed → Content → Follow → Engagement → Return
```

| Step | Action | Expected Result | Pass/Fail |
|------|--------|----------------|-----------|
| 3.1 | Open feed | Posts load with cursor pagination | □ |
| 3.2 | Scroll through feed | Infinite scroll works, no duplicates | □ |
| 3.3 | Like a post | Like counted, heart animation | □ |
| 3.4 | Comment on a post | Comment posted, visible to others | □ |
| 3.5 | Share a post | Share options presented | □ |
| 3.6 | Follow a creator | Follow state updates, notifications sent | □ |
| 3.7 | View creator's profile | Profile loads with their content | □ |
| 3.8 | View a short video | Video plays, controls work | □ |
| 3.9 | Create a post with media | Post published in feed | □ |

### Scenario 4: Creator Flow

```
Creator Setup → Publish → Audience → Engagement → Monetization
```

| Step | Action | Expected Result | Pass/Fail |
|------|--------|----------------|-----------|
| 4.1 | Complete creator profile | Creator badge/stats visible | □ |
| 4.2 | Create first post | Post published to feed | □ |
| 4.3 | View creator analytics | Dashboard shows metrics | □ |
| 4.4 | Check monetization eligibility | Status shown with requirements | □ |
| 4.5 | Receive a gift (coordinated) | Gift credited to earnings | □ |
| 4.6 | View earnings ledger | Transaction history displayed | □ |
| 4.7 | Request payout | Payout initiated | □ |
| 4.8 | View audience insights | Demographics shown | □ |

### Scenario 5: Premium Flow

```
Paywall → Payment → Entitlement → Renewal/Cancellation
```

| Step | Action | Expected Result | Pass/Fail |
|------|--------|----------------|-----------|
| 5.1 | View premium page | Plans displayed with prices | □ |
| 5.2 | Select a plan | Paywall shows feature comparison | □ |
| 5.3 | Complete test payment | Payment processed, no real charge | □ |
| 5.4 | Verify entitlement | Premium features activated | □ |
| 5.5 | Verify premium badge visible | Badge shows on profile | □ |
| 5.6 | Verify premium filters | Additional filter options available | □ |
| 5.7 | Cancel subscription | Confirmation shown, end date displayed | □ |
| 5.8 | Verify cancellation | Subscription expires on schedule | □ |
| 5.9 | Restore subscription | Premium reinstated | □ |

### Scenario 6: Safety Flow

```
Report → Moderation → Restriction → Appeal → Resolution
```

| Step | Action | Expected Result | Pass/Fail |
|------|--------|----------------|-----------|
| 6.1 | Report a post | Report submitted, confirmation shown | □ |
| 6.2 | Report a user | Report submitted | □ |
| 6.3 | Block a user | Block immediate, all interactions stopped | □ |
| 6.4 | Verify block in chat | Can't message blocked user | □ |
| 6.5 | Verify block in discovery | Blocked user not shown | □ |
| 6.6 | Admin reviews report | Report appears in moderation queue | □ |
| 6.7 | Admin takes moderation action | User receives notification | □ |
| 6.8 | User appeals restriction | Appeal submitted | □ |
| 6.9 | Admin resolves appeal | Status updated | □ |

### Scenario 7: Account Management

```
Settings → Privacy → Export → Deletion
```

| Step | Action | Expected Result | Pass/Fail |
|------|--------|----------------|-----------|
| 7.1 | Access settings | All categories visible | □ |
| 7.2 | Update profile information | Changes saved immediately | □ |
| 7.3 | Change privacy settings | Settings persisted | □ |
| 7.4 | Update notification preferences | Preferences saved | □ |
| 7.5 | Change language | UI updates to selected language | □ |
| 7.6 | Request data export | Export queued, notification sent | □ |
| 7.7 | Request account deletion | Deletion queued, grace period starts | □ |
| 7.8 | Cancel deletion during grace period | Account remains active | □ |
| 7.9 | Confirm deletion | Account disabled, data scheduled for cleanup | □ |

## Pre-Launch Verification

### Performance Check
- [ ] Feed loads in < 2s (p95)
- [ ] Chat messages deliver in < 500ms (p95)
- [ ] Media uploads complete in < 5s (p95 for 1MB images)
- [ ] Discovery pagination loads in < 2s
- [ ] Story creation opens in < 1s
- [ ] Video starts playing in < 3s
- [ ] App cold start < 3s

### Localization Check
- [ ] All supported languages display correctly
- [ ] RTL languages render properly
- [ ] Long text doesn't break layouts
- [ ] Date/time formats localized
- [ ] Number formats localized (decimals, separators)
- [ ] Right-to-left UI elements properly mirrored

### Accessibility Check
- [ ] All interactive elements have hover/focus states
- [ ] Touch targets > 44x44px
- [ ] Color contrast meets WCAG AA minimum
- [ ] Screen reader announces dynamic content changes
- [ ] Form inputs have associated labels
- [ ] Error messages are descriptive and visible
- [ ] Keyboard navigation works for all primary flows

### Data Integrity Check
- [ ] No orphaned records after deletion flow
- [ ] Payments ledger balances (credit = debit)
- [ ] Match records consistent (each match has 2 participants)
- [ ] Notification counts accurate
- [ ] Analytics events incrementing correctly
- [ ] Referral attribution working
