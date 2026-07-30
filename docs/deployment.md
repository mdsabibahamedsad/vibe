# Deployment

## CI/CD Pipeline

```
Code Push → Lint → TypeCheck → Unit Tests → Build → Migration Check → Deploy Staging → Integration Tests → Canary → Production
```

### Pre-Merge Checks
- [ ] `npx tsc --noEmit` — TypeScript compilation
- [ ] `npx next lint` — ESLint
- [ ] `npm test` — Unit + integration tests
- [ ] `npm audit` — Dependency vulnerability scan
- [ ] Migration dry-run (if applicable)

### Build
```bash
npm run build  # next build
```

## Environment Configuration

### Required Environment Variables

```
# ── Supabase ──
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# ── Telegram Bot ──
TELEGRAM_BOT_TOKEN=
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_INIT_DATA_MAX_AGE_SECONDS=86400

# ── App ──
NEXT_PUBLIC_APP_URL=
LOG_LEVEL=warn
NODE_ENV=production
VIBE_DEV_AUTH_ENABLED=false
```

### Environment Separation

| Variable | Development | Staging | Production |
|----------|-------------|---------|------------|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Staging URL | Production URL |
| `TELEGRAM_BOT_TOKEN` | Dev bot | Staging bot | Production bot |
| `SUPABASE_SERVICE_ROLE_KEY` | Dev project | Staging project | Production project |
| `LOG_LEVEL` | `debug` | `info` | `warn` |
| `TELEGRAM_WEBHOOK_SECRET` | Optional | Required | Required |
| `VIBE_DEV_AUTH_ENABLED` | `true` | `false` | `false` |

**Never use production credentials in development environments.**

## Production Launch Steps

### Pre-Deploy (24 hours before)

1. Verify all environment variables are set in production
2. Run database migrations against production
3. Verify backups are active (PITR + daily snapshots)
4. Run smoke tests against staging
5. Check moderation queue is empty or manageable
6. Verify monitoring dashboards are configured
7. Confirm incident response contacts are listed
8. Run through launch readiness checklist

### Deploy

```bash
# Step 1: Database migration
# (if applicable — verify backward compatibility first)
npx supabase db push

# Step 2: Build and deploy frontend + backend
# Vercel (recommended):
git push production main
# Or: vercel --prod

# Step 3: Configure Telegram Bot
# Set Mini App URL in BotFather:
#   /mybot → select bot → Bot Settings → Menu Button
#   URL: https://yourdomain.com
#   Button text: Open Vibe

# Set webhook (if using webhook mode):
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourdomain.com/api/billing/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["pre_checkout_query", "message"]
  }'
```

### Post-Deploy Verification

1. Open `https://yourdomain.com/api/health` — should return 200
2. Open `https://yourdomain.com/api/health/ready` — should return 200
3. Open `https://yourdomain.com/api/health/deps` — all dependencies healthy
4. Open Mini App from Telegram — auth should work
5. Complete a test account creation + onboarding
6. Verify feed loads, discovery works, chat connects
7. Verify reporting and blocking work
8. Check monitoring dashboards show traffic

## Rollback

### Frontend/BE Rollback (Vercel)
```bash
# Instant rollback to previous deployment
vercel rollback --confirm
```

### Database Rollback
**Do NOT rollback destructive migrations automatically.**
- All migrations are backward-compatible (add-only pattern)
- If rollback is needed after a non-backward-compatible migration:
  1. Deploy old application code
  2. Restore database from PITR backup
  3. Run data integrity checks
  4. Verify critical records

### Feature Flag Rollback
```bash
# Disable problematic feature via emergency kill switch
# (set in admin panel or database directly)
UPDATE feature_flags SET enabled = false WHERE key = 'problematic_feature';
```

### Telegram Bot Rollback
```bash
# Reset webhook
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/deleteWebhook"

# Change Mini App URL back to previous
# Via BotFather: /mybot → Bot Settings → Menu Button
```

## Staged Rollout Plan

| Stage | Users | Duration | Monitoring Focus | Go/No-Go Criteria |
|-------|-------|----------|-----------------|-------------------|
| **Internal** | Team + test accounts | 24 hours | All systems | Error rate < 1%, no payment failures |
| **Alpha** | 1% of users | 48 hours | Auth, payments, retention | D1 retention > 40%, no blockers |
| **Beta** | 10% of users | 1 week | All metrics | All SLOs met, no critical bugs |
| **GA** | 100% | Ongoing | Full monitoring | All launch criteria met |

## Capacity Planning

| Metric | Expected (10K DAU) | Monitor Threshold |
|--------|-------------------|-------------------|
| API requests/sec | ~50 peak | > 200/sec alert |
| Database connections | < 30 | > 80% of max |
| Realtime connections | < 200 | > 400 |
| Media uploads/min | < 10 | > 50/min |
| Concurrent users | < 2000 | > 5000 |
