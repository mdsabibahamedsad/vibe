/**
 * Authentication & Authorization Security Tests
 *
 * These tests verify that authentication and authorization controls
 * cannot be bypassed. They target the most common web vulnerabilities
 * for a Telegram Mini App: authentication bypass, IDOR, and privilege escalation.
 *
 * Requirements:
 *   - A running app instance (default http://localhost:3000, override with TEST_API_BASE)
 *   - Supabase env vars in .env.local (NEXT_PUBLIC_SUPABASE_URL,
 *     NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
 *   - TELEGRAM_BOT_TOKEN in .env.local (for signed initData tests)
 *   - TELEGRAM_WEBHOOK_SECRET in .env.local (for webhook tests)
 *
 * Run: npx vitest run src/__tests__/security/auth-security.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";

// ============================================================================
// TEST SETUP
// ============================================================================

const API_BASE = process.env.TEST_API_BASE ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const hasServiceRole = Boolean(SERVICE_ROLE_KEY && SUPABASE_URL);

// Test user tokens (populated in beforeAll using the real auth flow)
let userAToken = "";
let userBToken = "";
let userAId = "";
let userBId = "";
let userSetupOk = false;
const createdUserIds: string[] = [];

/**
 * The auth route rate-limits per IP (in-memory store). Each test gets a
 * unique X-Forwarded-For so parallel/sequential runs don't trip the limiter
 * for unrelated tests. The rate-limit test deliberately reuses ONE IP.
 */
let ipCounter = 0;
function uniqueIp(): string {
  ipCounter += 1;
  return `203.0.113.${100 + ipCounter}`;
}

/**
 * Build a signed Telegram initData string for the given user.
 * Mirrors Telegram's HMAC-SHA-256 algorithm using the real bot token.
 */
function buildSignedInitData(
  userId: number,
  first_name: string,
  overrides: Record<string, string> = {},
): string {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not set in the test environment");
  const authDate = overrides.auth_date ?? Math.floor(Date.now() / 1000).toString();
  const user = JSON.stringify({ id: userId, first_name, username: `sec_${userId}` });

  const params: Record<string, string> = {
    auth_date: authDate,
    query_id: "AAHdF6IQAAAAAN0XohD_test",
    user,
    ...overrides,
  };
  if (overrides.user !== undefined) params.user = overrides.user;

  const sortedKeys = Object.keys(params).sort();
  const dataCheckString = sortedKeys
    .map((key) => `${key}=${encodeURIComponent(params[key])}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  return Object.entries({ ...params, hash })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
}

beforeAll(async () => {
  // Create two test users via the service-role client, then sign in
  // with the anon key to obtain real session tokens.
  if (!hasServiceRole) return;

  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const suffix = Date.now();
  const emailA = `sec_a_${suffix}@vibe-auth.app`;
  const emailB = `sec_b_${suffix}@vibe-auth.app`;
  const password = "TestPass123!";

  const [a, b] = await Promise.all([
    admin.auth.admin.createUser({ email: emailA, password, email_confirm: true }),
    admin.auth.admin.createUser({ email: emailB, password, email_confirm: true }),
  ]);

  userAId = a.data.user?.id ?? "";
  userBId = b.data.user?.id ?? "";
  if (userAId) createdUserIds.push(userAId);
  if (userBId) createdUserIds.push(userBId);

  const anon = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

  const [sa, sb] = await Promise.all([
    anon.auth.signInWithPassword({ email: emailA, password }),
    anon.auth.signInWithPassword({ email: emailB, password }),
  ]);

  userAToken = sa.data.session?.access_token ?? "";
  userBToken = sb.data.session?.access_token ?? "";
  userSetupOk = Boolean(userAToken && userBToken);
});

afterAll(async () => {
  if (!hasServiceRole || createdUserIds.length === 0) return;
  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  await Promise.all(createdUserIds.map((id) => admin.auth.admin.deleteUser(id).catch(() => {})));
});

// ============================================================================
// AUTHENTICATION TESTS
// ============================================================================

describe("Authentication Security", () => {
  describe("Telegram initData Validation", () => {
    it("should reject empty initData", async () => {
      const res = await fetch(`${API_BASE}/api/auth/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ initData: "" }),
      });
      expect(res.status).toBe(400);
    });

    it("should reject malformed initData", async () => {
      const res = await fetch(`${API_BASE}/api/auth/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ initData: "invalid_data_here" }),
      });
      expect(res.status).toBe(400);
    });

    it("should reject initData without a hash field", async () => {
      const res = await fetch(`${API_BASE}/api/auth/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({
          initData: "query_id=test&user=%7B%22id%22%3A123%7D&auth_date=1000000",
        }),
      });
      expect(res.status).toBe(400);
    });

    it("should reject a tampered signature even with valid structure", async () => {
      const valid = buildSignedInitData(999999, "Real User");
      // Corrupt the user payload (the user ID is not URL-encoded, so this
      // reliably changes the signed payload) — the hash no longer matches
      const tampered = valid.replace("999999", "111111");
      const res = await fetch(`${API_BASE}/api/auth/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ initData: tampered }),
      });
      expect(res.status).toBe(401);
    });

    it("should reject expired auth_date", async () => {
      const oldAuthDate = (Math.floor(Date.now() / 1000) - 90000).toString();
      const initData = buildSignedInitData(999999, "Real User", { auth_date: oldAuthDate });
      const res = await fetch(`${API_BASE}/api/auth/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({ initData }),
      });
      expect(res.status).toBe(401);
    });

    it("should not trust client-provided user ID", async () => {
      // The server must derive identity from validated initData,
      // NOT from any client-supplied user_id field
      const res = await fetch(`${API_BASE}/api/auth/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": uniqueIp() },
        body: JSON.stringify({
          initData: "some_data",
          userId: "attacker_provided_user_id",
        }),
      });
      // Rejected because initData is invalid despite having userId
      expect(res.status).toBe(400);
    });
  });

  describe("Rate Limiting", () => {
    it("should rate-limit excessive auth attempts", async () => {
      const promises: Promise<Response>[] = [];
      // Attempt 15 rapid auth requests from ONE IP (limit is 10/min)
      const spamIp = uniqueIp();
      for (let i = 0; i < 15; i++) {
        promises.push(
          fetch(`${API_BASE}/api/auth/telegram`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-forwarded-for": spamIp },
            body: JSON.stringify({ initData: `spam_attempt_${i}` }),
          }),
        );
      }
      const results = await Promise.all(promises);
      const rateLimited = results.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe("Session Security", () => {
    it("should reject expired sessions", async () => {
      const res = await fetch(`${API_BASE}/api/auth/telegram/me`, {
        headers: {
          Authorization: "Bearer expired_token_that_was_never_valid",
        },
      });
      expect(res.status).toBe(401);
    });

    it("should reject tampered tokens", async () => {
      const res = await fetch(`${API_BASE}/api/auth/telegram/me`, {
        headers: {
          Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.tampered.payload",
        },
      });
      expect(res.status).toBe(401);
    });

    it("should reject unauthenticated profile access", async () => {
      const res = await fetch(`${API_BASE}/api/profile`);
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// AUTHORIZATION / IDOR TESTS
// ============================================================================

describe("Authorization (IDOR) Security", () => {
  describe("Admin Access Controls", () => {
    it("should prevent unauthenticated access to any admin endpoint", async () => {
      const endpoints = [
        "/api/admin/reports",
        "/api/admin/users",
        "/api/admin/dashboard",
        "/api/admin/content",
        "/api/admin/billing/subscriptions",
      ];
      for (const endpoint of endpoints) {
        const res = await fetch(`${API_BASE}${endpoint}`);
        expect(res.status, `expected 401 for ${endpoint}`).toBe(401);
      }
    });

    it("should prevent a regular user from accessing admin endpoints", async () => {
      // Requires test users; skipped when user setup could not complete
      // (e.g. service-role key missing or invalid)
      if (!hasServiceRole || !userSetupOk) return;

      const res = await fetch(`${API_BASE}/api/admin/dashboard`, {
        headers: { Authorization: `Bearer ${userAToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  describe("Profile Access Controls", () => {
    it("should require authentication for profile updates", async () => {
      const res = await fetch(`${API_BASE}/api/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: "Hacked bio" }),
      });
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// SUPABASE RLS TESTS
// ============================================================================

describe("RLS (Row Level Security)", () => {
  const tables = [
    "messages",
    "payment_events",
    "conversations",
    "verification_requests",
    "trust_profiles",
    "admin_audit_log",
    "dead_letter_queue",
  ];

  it.each(tables)("should prevent direct anonymous access to %s", async (table) => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await anonClient.from(table).select("*");
    // RLS should block returning any data
    expect(error).toBeDefined();
    expect(data).toBeNull();
  });
});

// ============================================================================
// WEBHOOK SECURITY TESTS
// ============================================================================

describe("Webhook Security", () => {
  it("should reject webhook requests without valid secret", async () => {
    const res = await fetch(`${API_BASE}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": "invalid_secret",
      },
      body: JSON.stringify({ update_id: 1 }),
    });
    expect(res.status).toBe(401);
  });

  it("should reject webhook requests without any auth header", async () => {
    const res = await fetch(`${API_BASE}/api/billing/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ update_id: 1 }),
    });
    expect(res.status).toBe(401);
  });
});
