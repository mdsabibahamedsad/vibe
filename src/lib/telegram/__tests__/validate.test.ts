/**
 * Tests for Telegram initData validation.
 *
 * These tests verify the HMAC-SHA-256 validation algorithm against
 * real signed initData strings (mirroring Telegram's algorithm).
 */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  validateTelegramInitData,
  generateAuthPassword,
  generateAuthEmail,
} from "@/lib/telegram/validate";
import { AppError } from "@/lib/errors";

// Test constants
const TEST_BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";
const TEST_USER_ID = 123456789;
const TEST_FIRST_NAME = "Test";
const TEST_USERNAME = "testuser";
const TEST_LAST_NAME = "User";

/**
 * Generate a valid initData string for testing.
 * This mirrors Telegram's algorithm to create valid test data.
 * Values are URL-encoded as Telegram's WebApp would produce them.
 */
function generateValidInitData(overrides: Record<string, string> = {}): string {
  const authDate = Math.floor(Date.now() / 1000).toString();

  const defaultUser = {
    id: TEST_USER_ID,
    first_name: TEST_FIRST_NAME,
    last_name: TEST_LAST_NAME,
    username: TEST_USERNAME,
    language_code: "en",
    is_premium: true,
  };

  let userObj = defaultUser;
  if (overrides.user) {
    try {
      userObj = { ...defaultUser, ...JSON.parse(overrides.user) };
    } catch {
      // If it's not valid JSON, use as-is
    }
  }

  const userJson = JSON.stringify(userObj);

  // Strip `user` from overrides (handled above), keep the rest
  const cleanOverrides: Record<string, string> = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (k !== "user") cleanOverrides[k] = v;
  }

  const params: Record<string, string> = {
    auth_date: authDate,
    query_id: "AAHdF6IQAAAAAN0XohD_jx8b",
    user: userJson,
    ...cleanOverrides,
  };
  // Ensure user is set from our constructed object, not overrides
  if (overrides.user !== undefined) {
    params.user = overrides.user; // raw override — for negative tests
  }

  // Build data-check-string: sort keys alphabetically, join with \n
  // IMPORTANT: Use the RAW (URL-encoded) values, not decoded
  const sortedKeys = Object.keys(params).sort();
  const dataCheckParts = sortedKeys.map((key) => {
    const value = params[key];
    return `${key}=${encodeURIComponent(value)}`;
  });
  const dataCheckString = dataCheckParts.join("\n");

  // Compute hash: HMAC-SHA-256 with key derived from "WebAppData" + bot token
  const secretKey = createHmac("sha256", "WebAppData").update(TEST_BOT_TOKEN).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  // Build URL-encoded query string (as Telegram sends it)
  const allParams = { ...params, hash };
  return Object.entries(allParams)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
}

/** Build an initData string directly for a given set of params (signed). */
function signParams(params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  const dataCheckParts = sortedKeys.map(
    (key) => `${key}=${encodeURIComponent(params[key])}`,
  );
  const dataCheckString = dataCheckParts.join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(TEST_BOT_TOKEN).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const allParams = { ...params, hash };
  return Object.entries(allParams)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
}

describe("validateTelegramInitData", () => {
  it("should validate a correctly signed initData", () => {
    const initData = generateValidInitData();
    const result = validateTelegramInitData(initData, TEST_BOT_TOKEN);

    expect(result.user.id).toBe(TEST_USER_ID);
    expect(result.user.first_name).toBe(TEST_FIRST_NAME);
    expect(result.user.username).toBe(TEST_USERNAME);
    expect(result.user.last_name).toBe(TEST_LAST_NAME);
    expect(result.authDate).toBeGreaterThan(0);
    expect(result.raw).toBe(initData);
  });

  it("should reject empty initData", () => {
    expect(() => validateTelegramInitData("", TEST_BOT_TOKEN)).toThrowError(
      AppError,
    );
    expect(() => validateTelegramInitData("", TEST_BOT_TOKEN)).toThrowError(
      "Missing Telegram initData",
    );
  });

  it("should reject initData without hash field", () => {
    expect(() =>
      validateTelegramInitData("auth_date=123456789&user=%7B%7D", TEST_BOT_TOKEN),
    ).toThrowError("Missing hash");
  });

  it("should reject modified user data", () => {
    const validData = generateValidInitData();
    const tamperedData = validData.replace("Test", "Hacker");
    expect(() => validateTelegramInitData(tamperedData, TEST_BOT_TOKEN)).toThrowError(
      "hash mismatch",
    );
  });

  it("should reject modified hash", () => {
    const validData = generateValidInitData();
    const tamperedData = validData.replace(
      /hash=[a-f0-9]+/,
      "hash=0000000000000000000000000000000000000000000000000000000000000000",
    );
    expect(() => validateTelegramInitData(tamperedData, TEST_BOT_TOKEN)).toThrowError(
      "hash mismatch",
    );
  });

  it("should reject missing user data", () => {
    // Sign valid initData that simply has no `user` field
    const initData = signParams({
      query_id: "test",
      auth_date: Math.floor(Date.now() / 1000).toString(),
    });
    expect(() => validateTelegramInitData(initData, TEST_BOT_TOKEN)).toThrowError(
      "Missing user data",
    );
  });

  it("should reject malformed user JSON", () => {
    const initData = signParams({
      query_id: "test",
      auth_date: Math.floor(Date.now() / 1000).toString(),
      user: "not-json",
    });
    expect(() => validateTelegramInitData(initData, TEST_BOT_TOKEN)).toThrowError(
      "Invalid user JSON",
    );
  });

  it("should reject invalid user ID (zero)", () => {
    const initData = signParams({
      query_id: "test",
      auth_date: Math.floor(Date.now() / 1000).toString(),
      user: JSON.stringify({ id: 0, first_name: "Test" }),
    });
    expect(() => validateTelegramInitData(initData, TEST_BOT_TOKEN)).toThrowError(
      "Invalid or missing Telegram user ID",
    );
  });

  it("should reject missing first_name", () => {
    const initData = signParams({
      query_id: "test",
      auth_date: Math.floor(Date.now() / 1000).toString(),
      user: JSON.stringify({ id: 12345 }),
    });
    expect(() => validateTelegramInitData(initData, TEST_BOT_TOKEN)).toThrowError(
      "Invalid or missing Telegram user first_name",
    );
  });

  it("should reject expired auth_date", () => {
    const oldDate = Math.floor(Date.now() / 1000) - 90000;
    const initData = generateValidInitData({ auth_date: oldDate.toString() });
    expect(() => validateTelegramInitData(initData, TEST_BOT_TOKEN)).toThrowError(
      "has expired",
    );
  });

  it("should reject future auth_date", () => {
    const futureDate = Math.floor(Date.now() / 1000) + 600;
    const initData = generateValidInitData({ auth_date: futureDate.toString() });
    expect(() => validateTelegramInitData(initData, TEST_BOT_TOKEN)).toThrowError(
      "auth_date is in the future",
    );
  });

  it("should reject missing auth_date", () => {
    // Sign valid initData that simply has no auth_date field
    const initData = signParams({
      query_id: "test",
      user: JSON.stringify({ id: TEST_USER_ID, first_name: TEST_FIRST_NAME }),
    });
    expect(() => validateTelegramInitData(initData, TEST_BOT_TOKEN)).toThrowError(
      "Missing auth_date",
    );
  });

  it("should reject invalid auth_date format", () => {
    const initData = generateValidInitData({
      auth_date: encodeURIComponent("not-a-number"),
    });
    expect(() => validateTelegramInitData(initData, TEST_BOT_TOKEN)).toThrowError(
      "Invalid auth_date",
    );
  });

  it("should throw when bot token is empty", () => {
    expect(() => validateTelegramInitData("hash=abc", "")).toThrowError(
      "not configured",
    );
  });

  it("should handle URL-encoded JSON correctly", () => {
    const authDate = Math.floor(Date.now() / 1000).toString();
    const userJson = JSON.stringify({
      id: TEST_USER_ID,
      first_name: TEST_FIRST_NAME,
      username: TEST_USERNAME,
    });
    const result = validateTelegramInitData(
      signParams({
        auth_date: authDate,
        query_id: "AAHdF6IQAAAAAN0XohD_jx8b",
        user: userJson,
      }),
      TEST_BOT_TOKEN,
    );
    expect(result.user.id).toBe(TEST_USER_ID);
    expect(result.user.first_name).toBe(TEST_FIRST_NAME);
  });

  it("should handle special characters in user data", () => {
    const userObj = {
      id: 99999,
      first_name: "José",
      last_name: "García-López",
      username: "jose_garcia",
    };
    const authDate = Math.floor(Date.now() / 1000).toString();
    const result = validateTelegramInitData(
      signParams({
        auth_date: authDate,
        query_id: "test",
        user: JSON.stringify(userObj),
      }),
      TEST_BOT_TOKEN,
    );
    expect(result.user.first_name).toBe("José");
    expect(result.user.last_name).toBe("García-López");
  });
});

describe("generateAuthPassword", () => {
  it("should generate a deterministic 32-char password", () => {
    const pwd1 = generateAuthPassword(12345, TEST_BOT_TOKEN);
    const pwd2 = generateAuthPassword(12345, TEST_BOT_TOKEN);
    expect(pwd1).toBe(pwd2);
    expect(pwd1.length).toBe(32);
  });

  it("should generate different passwords for different user IDs", () => {
    const pwd1 = generateAuthPassword(12345, TEST_BOT_TOKEN);
    const pwd3 = generateAuthPassword(67890, TEST_BOT_TOKEN);
    expect(pwd1).not.toBe(pwd3);
  });
});

describe("generateAuthEmail", () => {
  it("should generate a deterministic email format", () => {
    expect(generateAuthEmail(12345)).toBe("tg_12345@vibe-auth.app");
  });

  it("should generate different emails for different user IDs", () => {
    expect(generateAuthEmail(12345)).not.toBe(generateAuthEmail(67890));
  });
});
