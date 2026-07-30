/**
 * GET /api/health/ready — Readiness check
 *
 * Returns 200 when the service can safely accept traffic.
 * Only checks critical dependencies (database).
 * Non-critical services (analytics, AI, recommendations) do NOT affect readiness.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

const START_TIME = Date.now();

export async function GET() {
  const startupComplete = Date.now() - START_TIME > 5000;

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

  try {
    const adminClient = createAdminClient();
    const start = performance.now();

    const { error } = await adminClient
      .from("users")
      .select("id", { count: "exact", head: true })
      .limit(1);

    const latencyMs = Math.round(performance.now() - start);

    if (error) {
      logger.error("Readiness check failed", {
        error: error.message,
        latencyMs,
      });

      return NextResponse.json(
        {
          status: "unhealthy",
          message: "Database unreachable",
          latencyMs,
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        status: "ok",
        message: "Ready to accept traffic",
        latencyMs,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        status: "unhealthy",
        message: "Readiness check failed",
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
