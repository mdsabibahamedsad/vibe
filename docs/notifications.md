**Note:** The `integration.service.ts` provides ready-to-use notification hooks (`notifyPostLike()`, `notifyComment()`, `notifyFollow()`, `notifyMatch()`, etc.) for all domain actions. These hooks are designed to be called from existing API routes. Wire them in Prompt 15 when adding notification triggers to existing endpoints.

### Key Docs Changes for Prompt 14
- `docs/notifications.md` — This document (fully updated with Prompt 14 architecture)
- `docs/architecture.md` — Already references notifications in Planned Modules; no structural changes needed
- `docs/database-schema.md` — Already documents the notifications table; no additional migrations needed
- `docs/chat.md` — No changes needed (message notifications use existing patterns)

## 13. Known Limitations

| Limitation | Impact | Future Improvement |
|-----------|--------|-------------------|
| In-memory cooldowns | Cooldowns don't work across multiple server instances | Redis-backed distributed cooldowns |
| Integration hooks not yet wired | `integration.service.ts` hooks exist but aren't called from existing API routes | Wire at call sites in Prompt 15 |
| Read-time grouping | `getGroupedNotifications()` queries 100+ notifications for aggregation | Background compaction job or materialized view |
| Per-type rate limiters defined | `throttle.service.ts` exports rate limiters for notification endpoints | Already applied to /api/notifications routes |
