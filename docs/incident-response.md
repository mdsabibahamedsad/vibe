# Incident Response

## Severity Levels

| Severity | Definition | Examples | Response Time | Notify |
|----------|-----------|----------|---------------|--------|
| **SEV-1** | Complete service outage or critical feature unavailable | Database down, auth failing, payments broken | 5 minutes | All engineers, public status page |
| **SEV-2** | Major feature degradation or partial outage | Chat slow, feed not loading, upload failing | 15 minutes | Engineering team lead |
| **SEV-3** | Minor feature issue or non-critical bug | UI glitch, non-critical feature broken | 1 hour | Engineering team (Slack) |
| **SEV-4** | Cosmetic or low-impact issue | Typo, layout issue, minor bug | 1 day | Issue tracking |
| **SEV-5** | Internal tooling issue | Admin panel UX, reporting bug | 1 week | Issue tracking |

## Incident Commander

The **Incident Commander (IC)** is the first person to respond to an incident. Responsibilities:

- Assess severity and declare the incident
- Assign roles (Communications Lead, Technical Lead)
- Drive the incident to resolution
- Decide on escalation
- Declare the incident resolved
- Ensure a postmortem is scheduled

### Role Assignments

| Role | Responsibility |
|------|---------------|
| **Incident Commander** | Overall coordination, decision-making |
| **Technical Lead** | Debugging, root cause analysis, mitigation |
| **Communications Lead** | Status updates, stakeholder communication |
| **Scribe** | Timeline documentation, action item tracking |

## Escalation

### Escalation Path

1. **On-call engineer** (first responder)
2. **Engineering team lead** (if unresolved in 15 minutes)
3. **CTO / Head of Engineering** (if SEV-1 or unresolved in 1 hour)
4. **CEO** (if user-facing impact > 1 hour)

### When to Escalate

- Incident status is unclear after 10 minutes
- Root cause is outside the responder's area of expertise
- Incident requires cross-team coordination
- Incident duration exceeds expected resolution time for severity level
- Additional resources needed

## Communication

### Internal Communication

Use designated Slack channel for incident coordination:
- `#incidents` — All incident notifications
- `#incident-<id>` — Dedicated channel for active incident (auto-created)

### Status Updates

Update every 30 minutes (or as new information becomes available):

1. **Current status**: What's happening now
2. **Impact**: How many users affected, what features are impacted
3. **Root cause**: What we know (or "under investigation")
4. **Next step**: What we're doing next
5. **ETA**: If known, when we expect resolution

### User Communication

For SEV-1 incidents with significant user impact:

1. **Status page**: Update public status page
2. **In-app notification**: Banner for known issues
3. **Social media**: Brief acknowledgment on official channels

Template:

> We're aware of [issue description] affecting [scope]. Our team is investigating. Updates will follow. We apologize for the inconvenience.

## Incident Lifecycle

### Detection

Incidents can be detected through:
- Automated alerting (see docs/observability.md)
- User reports (support tickets, social media)
- Manual monitoring (dashboard review)
- Proactive testing (chaos engineering)

### Triage

1. Acknowledge the alert within response time
2. Assess severity based on user impact
3. Declare incident in `#incidents` channel
4. Create incident timeline document
5. Assign roles if needed

### Mitigation

1. Stabilize the system (rollback, failover, scale up)
2. Document all actions taken
3. Communicate status regularly
4. Do not fix root cause during mitigation if it delays recovery
5. Only mitigate — investigate root cause after stabilization

### Resolution

1. Verify system is stable
2. Verify monitoring shows recovery
3. Declare incident resolved
4. Schedule postmortem (within 72 hours)
5. Restore normal operations

### Postmortem

Required for all SEV-1 and SEV-2 incidents.

**Postmortem meeting (within 72 hours):**
1. Review timeline
2. Identify root cause
3. Identify contributing factors
4. Generate action items
5. Assign owners and due dates

**Postmortem document:**
- Include in docs/postmortems/ directory
- Follow template in docs/disaster-recovery.md
- Review at next engineering meeting

## Incident Command Checklist

### First 5 Minutes

- [ ] Acknowledge alert
- [ ] Assess severity
- [ ] Declare incident in Slack
- [ ] Assign roles (if SEV-1/2)
- [ ] Create timeline document

### First 15 Minutes

- [ ] Determine impact scope
- [ ] Begin mitigation
- [ ] Communicate status to stakeholders
- [ ] Escalate if needed

### Ongoing

- [ ] Update status every 30 minutes
- [ ] Document all actions
- [ ] Track timeline
- [ ] Prepare for postmortem

## Tooling

| Tool | Purpose |
|------|---------|
| Slack | Communication, alerts |
| Status page | User-facing status |
| Logs | Debugging (structured log aggregation) |
| Database | Query analysis, data recovery |
| Vercel | Deployment rollback |
| GitHub | Code review, blame, git bisect |
