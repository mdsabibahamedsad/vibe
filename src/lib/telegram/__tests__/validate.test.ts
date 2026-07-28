/**
 * Tests for Telegram initData validation.
 *
 * These tests verify the HMAC-SHA-256 validation algorithm.
 * Uses Node.js built-in assert to avoid external test framework dependencies.
 *
 * Run with: node --experimental-strip-types src/lib/telegram/__tests__/validate.test.ts
 */

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

// Track test results
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed++;
    console.error(`  FAIL: ${message}`);
    return;
  }
  passed++;
  console.log(`  PASS: ${message}`);
}

function assertThrows(fn: () => void, expectedMessage: string, testName: string) {
  try {
    fn();
    failed++;
    console.error(`  FAIL: ${testName} — expected error but none thrown`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expectedMessage)) {
      passed++;
      console.log(`  PASS: ${testName}`);
    } else {
      failed++;
      console.error(`  FAIL: ${testName} — expected "${expectedMessage}", got "${message}"`);
    }
  }
}

function assertNotThrows(fn: () => void, testName: string) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${testName}`);
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  FAIL: ${testName} — unexpected error: ${message}`);
  }
}

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

  // Fil undefined overrides would mess things up ; remove them
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

// ─── Run Tests ───────────────────────────────────────────────────────────

console.log("\n=== Telegram initData Validation Tests ===\n");

// validateTelegramInitData
console.log("\n--- validateTelegramInitData ---");

assertNotThrows(() => {
  const initData = generateValidInitData();
  const result = validateTelegramInitData(initData, TEST_BOT_TOKEN);
  assert(result.user.id === TEST_USER_ID, "user.id matches");
  assert(result.user.first_name === TEST_FIRST_NAME, "user.first_name matches");
  assert(result.user.username === TEST_USERNAME, "user.username matches");
  assert(result.authDate > 0, "authDate is positive");
  assert(result.raw === initData, "raw data is preserved");
  assert(result.user.last_name === TEST_LAST_NAME, "user.last_name matches");
}, "should validate a correctly signed initData");

assertThrows(
  () => validateTelegramInitData("", TEST_BOT_TOKEN),
  "Missing Telegram initData",
  "should reject empty initData",
);

assertThrows(
  () => validateTelegramInitData("auth_date=123456789&user=%7B%7D", TEST_BOT_TOKEN),
  "Missing hash",
  "should reject missing hash",
);

assertThrows(
  () => {
    const validData = generateValidInitData();
    const tamperedData = validData.replace("Test", "Hacker");
    validateTelegramInitData(tamperedData, TEST_BOT_TOKEN);
  },
  "hash mismatch",
  "should reject modified user data",
);

assertThrows(
  () => {
    const validData = generateValidInitData();
    const tamperedData = validData.replace(
      /hash=[a-f0-9]+/,
      "hash=0000000000000000000000000000000000000000000000000000000000000000",
    );
    validateTelegramInitData(tamperedData, TEST_BOT_TOKEN);
  },
  "hash mismatch",
  "should reject modified hash",
);

assertThrows(
  () => {
    const initData = generateValidInitData();
    const withoutUser = initData
      .split("&")
      .filter((p) => !p.startsWith("user="))
      .join("&");
    validateTelegramInitData(withoutUser, TEST_BOT_TOKEN);
  },
  "Missing user data",
  "should reject missing user data",
);

assertThrows(
  () => {
    const initData = generateValidInitData({
      user: encodeURIComponent("not-json"),
    });
    validateTelegramInitData(initData, TEST_BOT_TOKEN);
  },
  "Invalid user JSON",
  "should reject malformed user JSON",
);

assertThrows(
  () => {
    const initData = generateValidInitData({
      user: encodeURIComponent('{"id":0,"first_name":"Test"}'),
    });
    validateTelegramInitData(initData, TEST_BOT_TOKEN);
  },
  "Invalid or missing Telegram user ID",
  "should reject invalid user ID (zero)",
);

assertThrows(
  () => {
    const initData = generateValidInitData({
      user: encodeURIComponent('{"id":12345}'),
    });
    validateTelegramInitData(initData, TEST_BOT_TOKEN);
  },
  "Invalid or missing Telegram user first_name",
  "should reject missing first_name",
);

assertThrows(
  () => {
    const oldDate = Math.floor(Date.now() / 1000) - 90000;
    const initData = generateValidInitData({
      auth_date: oldDate.toString(),
    });
    validateTelegramInitData(initData, TEST_BOT_TOKEN);
  },
  "has expired",
  "should reject expired auth_date",
);

assertThrows(
  () => {
    const futureDate = Math.floor(Date.now() / 1000) + 600;
    const initData = generateValidInitData({
      auth_date: futureDate.toString(),
    });
    validateTelegramInitData(initData, TEST_BOT_TOKEN);
  },
  "auth_date is in the future",
  "should reject future auth_date",
);

assertThrows(
  () => {
    const validData = generateValidInitData();
    const noDate = validData
      .split("&")
      .filter((p) => !p.startsWith("auth_date="))
      .join("&");
    validateTelegramInitData(noDate, TEST_BOT_TOKEN);
  },
  "Missing auth_date",
  "should reject missing auth_date",
);

assertThrows(
  () => {
    const initData = generateValidInitData({
      auth_date: encodeURIComponent("not-a-number"),
    });
    validateTelegramInitData(initData, TEST_BOT_TOKEN);
  },
  "Invalid auth_date",
  "should reject invalid auth_date format",
);

assertThrows(
  () => validateTelegramInitData("hash=abc", ""),
  "not configured",
  "should throw when bot token is empty",
);

assertNotThrows(() => {
  const authDate = Math.floor(Date.now() / 1000).toString();
  const userObj = {
    id: TEST_USER_ID,
    first_name: TEST_FIRST_NAME,
    username: TEST_USERNAME,
  };
  const userJson = JSON.stringify(userObj);
  const params: Record<string, string> = {
    auth_date: authDate,
    query_id: "AAHdF6IQAAAAAN0XohD_jx8b",
    user: userJson,
  };
  const sortedKeys = Object.keys(params).sort();
  const dataCheckParts = sortedKeys.map((key) => `${key}=${encodeURIComponent(params[key])}`);
  const dataCheckString = dataCheckParts.join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(TEST_BOT_TOKEN).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const allParams = { ...params, hash };
  const queryString = Object.entries(allParams)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  const result = validateTelegramInitData(queryString, TEST_BOT_TOKEN);
  assert(result.user.id === TEST_USER_ID, "user.id matches");
  assert(result.user.first_name === TEST_FIRST_NAME, "user.first_name matches");
}, "should handle URL-encoded JSON correctly");

assertNotThrows(() => {
  const userObj = {
    id: 99999,
    first_name: "José",
    last_name: "García-López",
    username: "jose_garcia",
  };
  const userJson = JSON.stringify(userObj);
  const authDate = Math.floor(Date.now() / 1000).toString();
  const params: Record<string, string> = {
    auth_date: authDate,
    query_id: "test",
    user: userJson,
  };
  const sortedKeys = Object.keys(params).sort();
  const dataCheckParts = sortedKeys.map((key) => `${key}=${encodeURIComponent(params[key])}`);
  const dataCheckString = dataCheckParts.join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(TEST_BOT_TOKEN).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const allParams = { ...params, hash };
  const queryString = Object.entries(allParams)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  const result = validateTelegramInitData(queryString, TEST_BOT_TOKEN);
  assert(result.user.first_name === "José", "special chars: first_name");
  assert(result.user.last_name === "García-López", "special chars: last_name");
}, "should handle special characters in user data");

// generateAuthPassword
console.log("\n--- generateAuthPassword ---");

const pwd1 = generateAuthPassword(12345, TEST_BOT_TOKEN);
const pwd2 = generateAuthPassword(12345, TEST_BOT_TOKEN);
assert(pwd1 === pwd2, "deterministic password generation");
assert(pwd1.length === 32, "32-char password length");

const pwd3 = generateAuthPassword(67890, TEST_BOT_TOKEN);
assert(pwd1 !== pwd3, "different passwords for different user IDs");

// generateAuthEmail
console.log("\n--- generateAuthEmail ---");

assert(generateAuthEmail(12345) === "tg_12345@vibe-auth.app", "deterministic email format");
assert(
  generateAuthEmail(12345) !== generateAuthEmail(67890),
  "different emails for different user IDs",
);

// ─── Summary ──────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

if (failed > 0) {
  process.exit(1);
}
