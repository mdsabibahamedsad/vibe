/**
 * Health Check Endpoint
 *
 * GET /api/health          → Liveness check (is the service running?)
 * GET /api/health/ready    → Readiness check (can it accept traffic?)
 * GET /api/health/deps     → Dependency health (are critical services available?)
 *
 * Architecture:
 *   - Liveness: Always returns 200 if the process is running
 *   - Readiness: Returns 200 only when critical dependencies respond
 *   - Dependency: Returns status of each dependency without failing the request
 *
 * Health checks NEVER depend on non-critical services (analytics, AI, etc.).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

interface DependencyStatus {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs: number;
  error?: string;
}

const START_TIME = Date.now();
let startupComplete = false;

// Mark startup as complete after a short delay
if (typeof setTimeout !== "undefined") {
  setTimeout(() => {
    startupComplete = true;
  }, 5000);
}

/**
 * GET /api/health — Liveness check
 * Returns 200 if the service process is running.
 */
export async function GET(request: NextRequest) {
  const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);

  return NextResponse.json(
    {
      status: "ok",
      service: "vibe-api",
      uptime: uptimeSeconds,
      startupComplete,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}

/**
 * GET /api/health/liveness — Alias for /api/health
 */
export { GET as handleLiveness };

/**
 * GET /api/health/ready — Readiness check
 * Returns 200 when the service can safely accept traffic.
 * Only checks critical dependencies (database).
 */
export async function checkReadiness(request: NextRequest) {
  if (!startupComplete) {
    return NextResponse.json(
      {
        status: "starting",
        message: "Service is still starting up",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  // Check database connectivity (critical)
  try {
    const adminClient = createAdminClient();
    const start = Date.now();

    // Simple query to verify database connectivity
    const { error } = await adminClient
      .from("users")
      .select("id", { count: "exact", head: true })
      .limit(1);

    const latency = Date.now() - start;

    if (error) {
      logger.error("Readiness check failed — database unreachable", {
        error: error.message,
        latencyMs: latency,
      });

      return NextResponse.json(
        {
          status: "unhealthy",
          message: "Database unreachable",
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }
  } catch (err) {
    logger.error("Readiness check threw exception", {
      error: String(err),
    });

    return NextResponse.json(
      {
        status: "unhealthy",
        message: "Health check failed",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      status: "ok",
      message: "Service is ready to accept traffic",
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}

/**
 * GET /api/health/deps — Dependency health
 * Returns detailed status of all dependencies without failing.
 * Do NOT make readiness depend on non-critical services.
 */
export async function checkDependencies(request: NextRequest) {
  const deps: DependencyStatus[] = [];

  // 1. Database (critical)
  deps.push(await checkDatabaseHealth());

  // 2. Storage (critical for media)
  deps.push(await checkStorageHealth());

  // 3. Telegram (critical for auth)
  deps.push(await checkTelegramHealth());

  const unhealthy = deps.filter((d) => d.status === "unhealthy");
  const degraded = deps.filter((d) => d.status === "degraded");

  return NextResponse.json(
    {
      status: unhealthy.length > 0 ? "unhealthy" : degraded.length > 0 ? "degraded" : "ok",
      dependencies: deps,
      summary: {
        total: deps.length,
        healthy: deps.filter((d) => d.status === "healthy").length,
        degraded: degraded.length,
        unhealthy: unhealthy.length,
      },
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}

async function checkDatabaseHealth(): Promise<DependencyStatus> {
  const start = Date.now();

  try {
    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("users")
      .select("id", { count: "exact", head: true })
      .limit(1);

    const latency = Date.now() - start;

    if (error) {
      return {
        name: "supabase_postgresql",
        status: "unhealthy",
        latencyMs: latency,
        error: error.message,
      };
    }

    // Degraded if high latency
    const status = latency > 1000 ? "degraded" : "healthy";

    return {
      name: "supabase_postgresql",
      status,
      latencyMs: latency,
    };
  } catch (err) {
    return {
      name: "supabase_postgresql",
      status: "unhealthy",
      latencyMs: Date.now() - start,
      error: String(err),
    };
  }
}

async function checkStorageHealth(): Promise<DependencyStatus> {
  const start = Date.now();

  try {
    const adminClient = createAdminClient();

    // Try to list the public bucket
    const { data, error } = await adminClient.storage.getBucket("public");

    const latency = Date.now() - start;

    if (error) {
      return {
        name: "supabase_storage",
        status: "degraded",
        latencyMs: latency,
        error: error.message,
      };
    }

    return {
      name: "supabase_storage",
      status: "healthy",
      latencyMs: latency,
    };
  } catch (err) {
    return {
      name: "supabase_storage",
      status: "degraded",
      latencyMs: Date.now() - start,
      error: String(err),
    };
  }
}

async function checkTelegramHealth(): Promise<DependencyStatus> {
  const start = Date.now();

  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return {
        name: "telegram_bot",
        status: "degraded",
        latencyMs: 0,
        error: "Not configured (TELEGRAM_BOT_TOKEN missing)",
      };
    }

    // Just verify the token is present — don't make an actual API call
    // to avoid rate limiting on the health check endpoint
    return {
      name: "telegram_bot",
      status: "healthy",
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "telegram_bot",
      status: "degraded",
      latencyMs: Date.now() - start,
      error: String(err),
    };
  }
}
