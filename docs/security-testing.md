# Security Testing

## Automated Security Tests

### Authentication Tests

```typescript
// Test 1: Invalid initData should be rejected
describe('Authentication', () => {
  it('should reject invalid Telegram initData', async () => {
    const res = await fetch('/api/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ initData: 'invalid_data' }),
    });
    expect(res.status).toBe(401);
  });

  it('should reject expired initData', async () => {
    const expiredData = generateExpiredInitData();
    const res = await fetch('/api/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ initData: expiredData }),
    });
    expect(res.status).toBe(401);
  });

  it('should reject initData with tampered hash', async () => {
    const tamperedData = generateInitDataWithTamperedHash();
    const res = await fetch('/api/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ initData: tamperedData }),
    });
    expect(res.status).toBe(401);
  });

  it('should reject initData without user field', async () => {
    const data = generateInitDataWithoutUser();
    const res = await fetch('/api/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ initData: data }),
    });
    expect(res.status).toBe(400);
  });

  it('should rate-limit excessive auth attempts', async () => {
    for (let i = 0; i < 15; i++) {
      await fetch('/api/auth/telegram', {
        method: 'POST',
        body: JSON.stringify({ initData: 'test_' + i }),
      });
    }
    const res = await fetch('/api/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ initData: 'final_test' }),
    });
    expect(res.status).toBe(429);
  });
});
```

### Authorization / IDOR Tests

```typescript
describe('Authorization', () => {
  it('should prevent User A from accessing User B private profile fields', async () => {
    // User A tries to access User B's date_of_birth (not publicly visible)
    const res = await fetch(`/api/profiles/${userB.id}`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    const data = await res.json();
    expect(data.profile.dateOfBirth).toBeUndefined();
  });

  it('should prevent User A from reading User B messages', async () => {
    const res = await fetch(`/api/chat/${conversationBId}/messages`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    expect(res.status).toBe(403);
  });

  it('should prevent User A from viewing User B payments', async () => {
    const res = await fetch(`/api/billing/subscriptions?userId=${userB.id}`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    expect(res.status).toBe(403);
  });

  it('should prevent unauthenticated access to admin endpoints', async () => {
    const res = await fetch('/api/admin/reports');
    expect(res.status).toBe(401);
  });

  it('should prevent regular user from accessing admin endpoints', async () => {
    const res = await fetch('/api/admin/reports', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(403);
  });
});
```

### RLS Bypass Tests

```typescript
describe('RLS', () => {
  it('should prevent direct table access to private data via anon key', async () => {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data } = await supabase.from('messages').select('*');
    expect(data).toBeNull(); // RLS should block
  });

  it('should enforce block list in conversation queries', async () => {
    // User A has blocked User B
    const { data } = await supabaseA
      .from('conversations')
      .select('*');
    // Conversations with User B should not appear
    expect(data.every(c => !c.members.includes(userB.id))).toBe(true);
  });
});
```

### Storage Security Tests

```typescript
describe('Storage Security', () => {
  it('should reject unauthenticated uploads', async () => {
    const res = await fetch('/api/media/upload', {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(401);
  });

  it('should reject non-image MIME types on image endpoints', async () => {
    const res = await uploadFile('test.exe', 'application/x-msdownload');
    expect(res.status).toBe(400);
  });

  it('should reject files exceeding size limit', async () => {
    const largeFile = generateLargeFile(11 * 1024 * 1024); // 11MB
    const res = await uploadFile(largeFile);
    expect(res.status).toBe(400);
  });

  it('should not enumerate private media IDs', async () => {
    // Try accessing someone else's private media
    const res = await fetch(`/api/media/${userBMediaId}`);
    expect(res.status).toBe(403);
  });
});
```

### Payment Security Tests

```typescript
describe('Payment Security', () => {
  it('should reject unauthorized webhook requests', async () => {
    const res = await fetch('/api/billing/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it('should prevent duplicate payment processing', async () => {
    // Submit the same payment event twice
    const event = generatePaymentEvent(100, 'XTR');
    await processPaymentEvent(event);
    const result = await processPaymentEvent(event);
    expect(result.duplicate).toBe(true);
  });

  it('should verify price against server-side plan price', async () => {
    // Attempt to pay a different price than plan
    const event = generatePaymentEvent(1, 'XTR', { plan_slug: 'monthly' });
    try {
      await processPaymentEvent(event);
      fail('Should have rejected incorrect price');
    } catch (err) {
      expect(err.message).toContain('price mismatch');
    }
  });
});
```

### XSS Tests

```typescript
describe('XSS Protection', () => {
  it('should not execute script tags in profile bios', async () => {
    const maliciousBio = '<script>alert("xss")</script>';
    await updateProfile(userToken, { bio: maliciousBio });
    
    const res = await fetch(`/api/profiles/${userId}`);
    const data = await res.json();
    expect(data.profile.bio).not.toContain('<script>');
  });

  it('should not execute HTML in message content', async () => {
    const maliciousMessage = '<img onerror="alert(1)" src=x>';
    await sendMessage(userToken, conversationId, maliciousMessage);
    
    const res = await fetch(`/api/chat/${conversationId}/messages`);
    const data = await res.json();
    expect(data.messages[0].content).not.toContain('<img');
  });
});
```

## Penetration Test Checklist

### Reconnaissance
- [ ] Map all API endpoints
- [ ] Identify authentication mechanisms
- [ ] Enumerate admin endpoints
- [ ] Identify third-party integrations
- [ ] Check exposed configuration files

### Authentication
- [ ] Test initData HMAC validation bypass
- [ ] Test auth_date expiry bypass
- [ ] Test session token theft/reuse
- [ ] Test refresh token rotation
- [ ] Test logout/session revocation
- [ ] Test rate limiting bypass (distributed)
- [ ] Test dev auth in production

### Authorization / IDOR
- [ ] Test object ID substitution in all resource endpoints
- [ ] Test privilege escalation (user → admin)
- [ ] Test vertical privilege escalation
- [ ] Test horizontal privilege escalation
- [ ] Test admin-only data access without auth
- [ ] Test admin-only action execution without sufficient role

### API Security
- [ ] Test input validation bypass
- [ ] Test mass assignment
- [ ] Test parameter pollution
- [ ] Test HTTP method override
- [ ] Test CORS misconfiguration
- [ ] Test rate limit bypass
- [ ] Test pagination bypass (unbounded queries)

### Storage / Media
- [ ] Test public bucket enumeration
- [ ] Test private bucket access without auth
- [ ] Test signed URL reuse after expiry
- [ ] Test MIME type validation bypass
- [ ] Test file extension bypass
- [ ] Test media ID enumeration
- [ ] Test path traversal in file paths

### Database
- [ ] Test RLS bypass via direct Supabase access
- [ ] Test RPC function abuse
- [ ] Test SQL injection in search queries
- [ ] Test SQL injection in filter parameters
- [ ] Test mass data exfiltration via pagination

### Payments
- [ ] Test payment replay
- [ ] Test price manipulation
- [ ] Test webhook forgery
- [ ] Test double-spend
- [ ] Test refund abuse
- [ ] Test entitlement manipulation

### Admin Panel
- [ ] Test admin privilege escalation
- [ ] Test unauthorized data access
- [ ] Test unauthorized action execution
- [ ] Test audit log tampering
- [ ] Test mass action authorization

### Realtime / WebSockets
- [ ] Test unauthorized channel subscription
- [ ] Test message injection
- [ ] Test event enumeration
- [ ] Test connection exhaustion

### Privacy
- [ ] Test data exposure in API responses
- [ ] Test data exposure in error messages
- [ ] Test data exposure in logs
- [ ] Test data exposure in analytics
- [ ] Test data retention bypass

## Test Environment

- **All tests run against non-production environment**
- **Test data is synthetic** (no real user data)
- **Test accounts are cleaned up** after test suite completes
- **Rate limits are disabled or lowered** for test performance
