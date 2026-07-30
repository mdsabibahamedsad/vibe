# Disaster Recovery

## Recovery Objectives

| Scenario | RPO (Recovery Point Objective) | RTO (Recovery Time Objective) |
|----------|-------------------------------|-------------------------------|
| Database server failure | 5 minutes (WAL streaming) | 30 minutes |
| Storage failure | 1 hour | 2 hours |
| Application outage | N/A (stateless) | 10 minutes |
| Configuration corruption | 24 hours (backup) | 1 hour |
| External dependency outage | N/A | Duration of outage |
| Full regional failure | 24 hours | 4 hours |

## Backup Strategy

### Database (PostgreSQL via Supabase)

| Backup Type | Frequency | Retention | Method |
|------------|-----------|-----------|--------|
| Continuous WAL archiving | Real-time | 7 days | Supabase point-in-time recovery |
| Daily snapshot | Daily | 30 days | pg_dump |
| Weekly snapshot | Weekly | 90 days | pg_dump |
| Monthly snapshot | Monthly | 1 year | pg_dump |

### Storage (Supabase Storage / S3-compatible)

| Data | Backup Frequency | Retention |
|------|-----------------|-----------|
| Profile photos | Daily incremental | 30 days |
| Post media | Daily incremental | 7 days |
| Story media | Not backed up (ephemeral) | N/A |
| Message attachments | Daily incremental | 7 days |
| Moderation evidence | Weekly | 1 year |

### Configuration

| Item | Backup Method | Retention |
|------|-------------|-----------|
| Environment variables | Secure vault (1Password/Vercel) | Indefinite |
| Feature flags | Database (backed up with DB) | 30 days |
| RLS policies | Versioned in migrations | Git history |
| Function triggers | Versioned in migrations | Git history |

## Recovery Procedures

### Database Failure

1. **Detect**: Health check returns 503 / admin alert
2. **Assess**: Determine failure scope (single table vs full database)
3. **Failover**: If Supabase-managed, failover to replica automatically
4. **Restore from backup** (if required):
   ```bash
   # 1. Download latest backup
   pg_restore --host=<new-host> --port=5432 \
     --username=<user> --dbname=vibe \
     --jobs=4 --verbose latest_backup.dump
   
   # 2. Verify data integrity
   psql --host=<new-host> -d vibe -c "SELECT count(*) FROM users;"
   psql --host=<new-host> -d vibe -c "SELECT count(*) FROM messages;"
   
   # 3. Update connection strings in environment
   # 4. Restart application
   ```
5. **Verify**: Run health checks, verify critical flows (auth, feed, chat)
6. **Communicate**: Update status page, notify users if needed

### Storage Failure

1. **Detect**: Media upload/download failures
2. **Assess**: Check storage provider dashboard
3. **Failover**: Use secondary storage provider if configured
4. **Mitigate**: Media shows as placeholder until storage is restored
5. **Restore**: Upload backup data to new storage
6. **Verify**: Test upload and download flows

### Application Outage

1. **Detect**: Health check fails / error rate spike
2. **Assess**: Check recent deployment, configuration changes
3. **Rollback**: Deploy previous known-good version
   ```bash
   # Vercel: Instant rollback to previous deployment
   vercel rollback --confirm
   
   # Manual: Redeploy previous Docker image
   docker pull vibe-api:<previous-tag>
   docker stop vibe-api && docker run vibe-api:<previous-tag>
   ```
4. **Verify**: Health checks pass, test critical flows
5. **Investigate**: Postmortem after recovery

### Configuration Corruption

1. **Detect**: Unexplained behavior changes, feature flags not working
2. **Assess**: Check recent configuration changes
3. **Restore**: Apply configuration from backup/vault
4. **Verify**: Test affected features
5. **Investigate**: Root cause analysis

### External Dependency Outage

| Dependency | Mitigation |
|-----------|-----------|
| Telegram Bot API | Queue notifications, retry with backoff. Auth falls back to existing sessions. |
| AI Provider | Circuit breaker opens, app falls back to rule-based recommendations |
| Search Provider | Fallback to PostgreSQL text search |
| CDN | Direct origin serving (slower but functional) |

## Full Regional Failure

In the unlikely event of a full regional failure:

1. **DNS failover**: Update DNS records to point to standby region
2. **Database restore**: Deploy latest backup to new region
3. **Storage sync**: Sync media from backup to new region storage
4. **Application deploy**: Deploy application to new region
5. **DNS propagation**: Wait for DNS to propagate (up to 5 minutes)
6. **Verify**: Full health check suites
7. **Communicate**: Status page update

## Backup Verification

A backup that has never been restored is NOT a valid backup.

### Monthly Restore Test

1. Restore backup to staging environment
2. Verify schema integrity:
   ```sql
   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
   SELECT count(*) FROM users;
   SELECT count(*) FROM messages;
   ```
3. Verify RLS policies are intact
4. Verify indexes exist
5. Verify critical records exist (at least one of each type)
6. Verify payment ledger consistency (no missing or duplicate entries)

### Quarterly Full Test

1. Deploy staging environment from backup
2. Run automated integration tests
3. Verify all major flows: auth, feed, chat, payments, moderation
4. Document any issues found

## Incident Severity

| Severity | Definition | Response Time | Examples |
|----------|-----------|--------------|---------|
| SEV-1 | Complete service outage | < 5 minutes | Database failure, auth down, payments failing |
| SEV-2 | Major feature degradation | < 15 minutes | Chat slow, feed not loading, media upload failing |
| SEV-3 | Minor feature issue | < 1 hour | Non-critical feature broken, UI glitch |
| SEV-4 | Cosmetic / low impact | < 1 day | Typo, layout issue, non-critical bug |
| SEV-5 | Internal tooling | < 1 week | Admin panel UX issue, reporting bug |

## Postmortem Process

All SEV-1 and SEV-2 incidents require a postmortem within 72 hours.

### Postmortem Template

```markdown
# Incident Postmortem: [TITLE]

- **Date**: YYYY-MM-DD
- **Duration**: X hours Y minutes
- **Severity**: SEV-X
- **Impact**: [Description of user impact]
- **Root Cause**: [What caused the incident]
- **Trigger**: [What triggered the incident]

## Timeline

| Time | Event |
|------|-------|
| HH:MM | Incident detected |
| HH:MM | Investigation started |
| HH:MM | Root cause identified |
| HH:MM | Mitigation applied |
| HH:MM | Service restored |

## Resolution

[Steps taken to resolve]

## Root Cause Analysis

[Detailed explanation of root cause]

## Action Items

- [ ] Item 1 (Owner, Due Date)
- [ ] Item 2 (Owner, Due Date)

## Prevention

[How to prevent recurrence]

## Lessons Learned

[What went well, what could be improved]
```
