/**
 * SSRF (Server-Side Request Forgery) Protection
 *
 * Prevents attackers from using the application as a proxy to access:
 *  - Internal/private IP ranges
 *  - Localhost (127.0.0.1, ::1)
 *  - Cloud metadata endpoints (AWS, GCP, Azure)
 *  - Internal network services
 *
 * Usage:
 *   import { validateExternalUrl } from "@/lib/security/ssrf-protection";
 *
 *   const result = validateExternalUrl("https://example.com/image.jpg");
 *   if (!result.safe) {
 *     throw new AppError("VALIDATION_ERROR", result.reason);
 *   }
 *   // Safe to fetch
 */

/**
 * NOTE: DNS resolution uses Node.js `dns` module (via dynamic import)
 * and will NOT work in Edge Runtime (Vercel Edge Functions).
 * If deploying to edge:
 *  - Use `validateExternalUrlBasic()` instead (pattern-only, no DNS)
 *  - Or implement DNS resolution via external API call
 *
 * `URL` is a global in all modern JS runtimes — no import needed.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface UrlValidationResult {
  /** Whether the URL is safe to fetch */
  safe: boolean;
  /** Human-readable reason if unsafe */
  reason?: string;
  /** Resolved IP address (if checked) */
  resolvedIp?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Known cloud metadata endpoints that should never be fetched */
const CLOUD_METADATA_ENDPOINTS = [
  "169.254.169.254", // AWS, GCP, Azure Metadata
  "fd00:ec2::254",   // AWS Metadata IPv6
  "100.100.100.200", // Alibaba Cloud Metadata
  "metadata.google.internal", // GCP Metadata hostname
  "metadata.goog",           // GCP Metadata short
];

/** Hostnames that resolve to internal/private IPs */
const INTERNAL_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^localhost\.localdomain$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fd00:/i,
  /^fe80:/i,
  /^169\.254\./,
];

/** Private IPv4 CIDR ranges (as byte ranges for fast checking) */
const PRIVATE_IP_RANGES = [
  { min: [10, 0, 0, 0], max: [10, 255, 255, 255] },
  { min: [172, 16, 0, 0], max: [172, 31, 255, 255] },
  { min: [192, 168, 0, 0], max: [192, 168, 255, 255] },
  { min: [127, 0, 0, 0], max: [127, 255, 255, 255] },
  { min: [169, 254, 0, 0], max: [169, 254, 255, 255] },
  { min: [0, 0, 0, 0], max: [0, 255, 255, 255] },
];

// ============================================================================
// URL VALIDATION
// ============================================================================

/**
 * Validate a URL for SSRF safety before fetching.
 *
 * Checks:
 *  1. Valid URL format
 *  2. Allowed protocol (http/https only)
 *  3. Not a cloud metadata endpoint
 *  4. Hostname doesn't resolve to private/internal IP
 *
 * For high-safety mode, performs DNS resolution to check the IP.
 * For low-safety mode, checks hostname patterns only (faster).
 *
 * @param url - The URL to validate
 * @param options - Optional configuration
 * @returns Validation result
 */
export async function validateExternalUrl(
  url: string,
  options: {
    /** Whether to perform DNS resolution (slower but more accurate). Default: false */
    resolveDns?: boolean;
    /** Timeout for DNS resolution in ms. Default: 5000 */
    dnsTimeoutMs?: number;
  } = {},
): Promise<UrlValidationResult> {
  const { resolveDns = false, dnsTimeoutMs = 5000 } = options;

  // ─── Step 1: Validate URL format ─────────────────────────────────
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: "Invalid URL format" };
  }

  // ─── Step 2: Check protocol ──────────────────────────────────────
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      safe: false,
      reason: `Protocol not allowed: ${parsed.protocol}. Only http and https are supported.`,
    };
  }

  // ─── Step 3: Check hostname against known metadata endpoints ─────
  const hostname = parsed.hostname.toLowerCase();

  if (CLOUD_METADATA_ENDPOINTS.includes(hostname)) {
    return { safe: false, reason: "URL points to a cloud metadata endpoint" };
  }

  // ─── Step 4: Check hostname pattern (fast check) ─────────────────
  for (const pattern of INTERNAL_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return {
        safe: false,
        reason: `URL resolves to a private/internal IP range (matched pattern: ${pattern})`,
        resolvedIp: hostname,
      };
    }
  }

  // ─── Step 5: DNS resolution (if enabled) ─────────────────────────
  if (resolveDns) {
    try {
      const resolved = await resolveHostname(hostname, dnsTimeoutMs);
      if (resolved) {
        for (const ip of resolved) {
          if (isPrivateIP(ip)) {
            return {
              safe: false,
              reason: `URL resolves to private IP: ${ip}`,
              resolvedIp: ip,
            };
          }
        }
      }
    } catch {
      // DNS resolution failed — this is a risk but we don't block
      // because the domain might be valid but temporarily unresolvable
      // Return safe but note the resolution failure
      return {
        safe: true,
        reason: "URL format and protocol valid, but DNS resolution failed",
      };
    }
  }

  return { safe: true };
}

/**
 * Quick synchronous check for SSRF safety.
 * Use for non-critical paths where DNS resolution is too expensive.
 */
export function validateExternalUrlBasic(url: string): UrlValidationResult {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, reason: "Protocol not allowed" };
    }

    const hostname = parsed.hostname.toLowerCase();

    if (CLOUD_METADATA_ENDPOINTS.includes(hostname)) {
      return { safe: false, reason: "URL points to cloud metadata endpoint" };
    }

    for (const pattern of INTERNAL_HOSTNAME_PATTERNS) {
      if (pattern.test(hostname)) {
        return { safe: false, reason: "URL resolves to private/internal IP range" };
      }
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: "Invalid URL format" };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if an IP address is private/internal.
 */
function isPrivateIP(ip: string): boolean {
  // IPv6 localhost
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;

  // IPv6 unique local address
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;

  // IPv6 link-local
  if (ip.startsWith("fe80")) return true;

  // IPv4 check
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;

  for (const range of PRIVATE_IP_RANGES) {
    if (
      parts[0] >= range.min[0] && parts[0] <= range.max[0] &&
      parts[1] >= range.min[1] && parts[1] <= range.max[1] &&
      parts[2] >= range.min[2] && parts[2] <= range.max[2] &&
      parts[3] >= range.min[3] && parts[3] <= range.max[3]
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Resolve a hostname to IP addresses.
 */
/**
 * Resolve a hostname to IP addresses using Node.js DNS.
 * Falls back to pattern-only check if DNS module is unavailable (Edge Runtime).
 */
async function resolveHostname(
  hostname: string,
  timeoutMs: number,
): Promise<string[]> {
  // Dynamic import to avoid crashing in Edge Runtime
  try {
    const dns = await import("dns");
    return await new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("DNS resolution timed out"));
      }, timeoutMs);

      dns.resolve(hostname, (err: Error | null, addresses: string[]) => {
        clearTimeout(timer);
        if (err) {
          reject(err);
        } else {
          resolve(addresses);
        }
      });
    });
  } catch {
    // DNS module not available (e.g., Edge Runtime) — return empty
    return [];
  }
}
