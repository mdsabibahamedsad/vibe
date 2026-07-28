/**
 * Server-side Telegram WebApp initData validation.
 *
 * Validates the authenticity of Telegram Mini App initData using
 * the HMAC-SHA-256 algorithm as specified in Telegram's official docs:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
 *
 * IMPORTANT: The data-check-string must use RAW (URL-encoded) values,
 * NOT decoded values. This is why we parse the query string manually
 * instead of using URLSearchParams.
 *
 * The bot token is used ONLY on the server and is NEVER exposed to the client.
 */

import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { AppError } from "@/lib/errors";

/**
 * Configurable maximum age for Telegram auth_data in seconds.
 * Default: 86400 (24 hours).
 * Set via env TELEGRAM_INIT_DATA_MAX_AGE_SECONDS.
 */
function getMaxAgeSeconds(): number {
  const envVal = process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 86400; // 24 hours default
}

/** A raw key-value pair parsed from the initData query string */
interface RawParam {
  key: string;
  /** The raw value as it appears in the query string (URL-encoded) */
  rawValue: string;
  /** The URL-decoded value for actual use */
  decodedValue: string;
}

/**
 * Parse the raw initData query string into key-value pairs
 * WITHOUT URL-decoding the values. We need raw values for the
 * data-check-string, but decoded values for extracting user data.
 *
 * This is critical for correct HMAC verification.
 */
function parseRawInitData(initData: string): RawParam[] {
  const params: RawParam[] = [];

  if (!initData) return params;

  // Split by & first
  const pairs = initData.split("&");

  for (const pair of pairs) {
    if (!pair) continue;

    // Split by the FIRST = only (values may contain =)
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) {
      params.push({
        key: pair,
        rawValue: "",
        decodedValue: "",
      });
      continue;
    }

    const key = pair.substring(0, eqIndex);
    const rawValue = pair.substring(eqIndex + 1);

    // URL-decode the value for actual use
    let decodedValue: string;
    try {
      // Handle both %20 and + as space (standard URL query encoding)
      decodedValue = decodeURIComponent(rawValue.replace(/\+/g, "%20"));
    } catch {
      decodedValue = rawValue;
    }

    params.push({ key, rawValue, decodedValue });
  }

  return params;
}

/**
 * Get all raw values for a given key (handles duplicate keys).
 */
function getRawValues(params: RawParam[], key: string): string[] {
  return params.filter((p) => p.key === key).map((p) => p.rawValue);
}

/**
 * Get the first decoded value for a given key, or null if not found.
 */
function getDecodedValue(params: RawParam[], key: string): string | null {
  const found = params.find((p) => p.key === key);
  return found ? found.decodedValue : null;
}

/**
 * Remove all entries with the given key from the params array.
 */
function removeKey(params: RawParam[], key: string): RawParam[] {
  return params.filter((p) => p.key !== key);
}

/**
 * Parsed and validated Telegram initData.
 */
export interface ValidatedTelegramData {
  /** Verified Telegram user info */
  user: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
    photo_url?: string;
  };
  /** Unix timestamp when the data was issued */
  authDate: number;
  /** Raw initData string (for reference) */
  raw: string;
  /** Optional: query_id for service messages */
  queryId?: string;
  /** Optional: start param from deep link */
  startParam?: string;
}

/**
 * Validate Telegram WebApp initData server-side.
 *
 * Steps:
 * 1. Parse the raw query string (preserving URL-encoding)
 * 2. Extract and remove the hash
 * 3. Sort remaining key-value pairs alphabetically
 * 4. Construct the data-check-string using RAW (URL-encoded) values
 * 5. Derive the secret key via HMAC-SHA-256("WebAppData", bot_token)
 * 6. Compute the verification hash
 * 7. Timing-safe comparison
 * 8. Validate auth_date freshness
 *
 * @param initData - Raw initData query string from Telegram WebApp
 * @param botToken - Telegram Bot Token (server-side only)
 * @returns ValidatedTelegramData if validation succeeds
 * @throws AppError if validation fails
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string,
): ValidatedTelegramData {
  if (!initData) {
    throw new AppError("TELEGRAM_ERROR", "Missing Telegram initData", {
      statusCode: 400,
    });
  }

  if (!botToken) {
    throw new AppError("TELEGRAM_ERROR", "Telegram Bot Token is not configured on the server", {
      statusCode: 500,
    });
  }

  // Step 1: Parse raw query string (preserving URL-encoding)
  let params = parseRawInitData(initData);

  // Step 2: Extract hash
  const hash = getDecodedValue(params, "hash");
  if (!hash) {
    throw new AppError("TELEGRAM_ERROR", "Missing hash in Telegram initData", {
      statusCode: 400,
    });
  }
  params = removeKey(params, "hash");

  // Step 3: Sort keys alphabetically and build data-check-string
  // using RAW (URL-encoded) values as Telegram requires
  const keys = [...new Set(params.map((p) => p.key))].sort();
  const dataCheckParts: string[] = [];

  for (const key of keys) {
    const rawValues = getRawValues(params, key);
    for (const rawValue of rawValues) {
      // Use raw (URL-encoded) value — do NOT decode
      dataCheckParts.push(`${key}=${rawValue}`);
    }
  }

  const dataCheckString = dataCheckParts.join("\n");

  // Step 4: Derive secret key using HMAC-SHA-256
  // secret_key = HMAC-SHA-256(key="WebAppData", message=bot_token)
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();

  // Step 5: Compute verification hash
  // calculated_hash = HMAC-SHA-256(key=secret_key, message=data_check_string)
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  // Step 6: Timing-safe comparison
  const calculatedHashBuffer = Buffer.from(calculatedHash, "hex");
  const receivedHashBuffer = Buffer.from(hash, "hex");

  if (
    calculatedHashBuffer.length !== receivedHashBuffer.length ||
    !timingSafeEqual(calculatedHashBuffer, receivedHashBuffer)
  ) {
    throw new AppError("TELEGRAM_ERROR", "Invalid Telegram authentication data — hash mismatch", {
      statusCode: 401,
    });
  }

  // Step 7: Validate auth_date
  const authDateStr = getDecodedValue(params, "auth_date");
  if (!authDateStr) {
    throw new AppError("TELEGRAM_ERROR", "Missing auth_date in Telegram initData", {
      statusCode: 400,
    });
  }

  const authDate = parseInt(authDateStr, 10);
  if (isNaN(authDate) || authDate <= 0) {
    throw new AppError("TELEGRAM_ERROR", "Invalid auth_date in Telegram initData", {
      statusCode: 400,
    });
  }

  const now = Math.floor(Date.now() / 1000);

  // Reject future timestamps (allow small clock skew of 5 minutes)
  if (authDate > now + 300) {
    throw new AppError("TELEGRAM_ERROR", "auth_date is in the future", {
      statusCode: 400,
    });
  }

  // Reject expired auth data
  const maxAge = getMaxAgeSeconds();
  if (now - authDate > maxAge) {
    throw new AppError("TELEGRAM_ERROR", "Telegram authentication data has expired", {
      statusCode: 401,
    });
  }

  // Step 8: Extract and validate user data
  const userStr = getDecodedValue(params, "user");
  if (!userStr) {
    throw new AppError("TELEGRAM_ERROR", "Missing user data in Telegram initData", {
      statusCode: 400,
    });
  }

  let userData: unknown;
  try {
    userData = JSON.parse(userStr);
  } catch {
    throw new AppError("TELEGRAM_ERROR", "Invalid user JSON in Telegram initData", {
      statusCode: 400,
    });
  }

  if (!userData || typeof userData !== "object") {
    throw new AppError("TELEGRAM_ERROR", "Invalid user data in Telegram initData", {
      statusCode: 400,
    });
  }

  const user = userData as Record<string, unknown>;

  if (typeof user.id !== "number" || user.id <= 0) {
    throw new AppError("TELEGRAM_ERROR", "Invalid or missing Telegram user ID", {
      statusCode: 400,
    });
  }

  if (typeof user.first_name !== "string" || user.first_name.length === 0) {
    throw new AppError("TELEGRAM_ERROR", "Invalid or missing Telegram user first_name", {
      statusCode: 400,
    });
  }

  return {
    user: {
      id: user.id as number,
      first_name: user.first_name as string,
      last_name: (user.last_name as string) || undefined,
      username: (user.username as string) || undefined,
      language_code: (user.language_code as string) || undefined,
      is_premium: (user.is_premium as boolean) || undefined,
      photo_url: (user.photo_url as string) || undefined,
    },
    authDate,
    raw: initData,
    queryId: getDecodedValue(params, "query_id") || undefined,
    startParam: getDecodedValue(params, "start_param") || undefined,
  };
}

/**
 * Generate a deterministic password for Supabase Auth users
 * linked to Telegram accounts.
 *
 * This allows the server to consistently regenerate the same password
 * for a given Telegram user, enabling password-based sign-in without
 * storing passwords in a separate database.
 */
export function generateAuthPassword(telegramUserId: number, botToken: string): string {
  const hash = createHash("sha256").update(`vibe_auth_${telegramUserId}_${botToken}`).digest("hex");
  return hash.slice(0, 32);
}

/**
 * Generate a deterministic email for Supabase Auth users linked to Telegram accounts.
 * Format: tg_{telegramUserId}@vibe-auth.app
 */
export function generateAuthEmail(telegramUserId: number): string {
  return `tg_${telegramUserId}@vibe-auth.app`;
}
