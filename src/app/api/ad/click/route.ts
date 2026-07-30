/**
 * POST /api/ad/click — Record an ad click and return safe destination.
 *
 * Called by the client when user clicks/taps an ad CTA.
 * The server resolves the destination — the client never provides a redirect URL.
 * Uses event_id for idempotency.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { recordClick } from "@/lib/ad/click.service";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { z } from "zod";

const clickSchema = z.object({
  campaignId: z.string(),
  creativeId: z.string(),
  placement: z.string(),
  requestId: z.string().optional(),
  eventId: z.string().min(1),
  impressionEventId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    const body = await request.json();
    const parsed = clickSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    const result = await recordClick({
      userId: user.id,
      ...parsed.data,
    });

    return NextResponse.json({
      success: true,
      recorded: result.recorded,
      destination: result.destination,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode },
      );
    }
    logger.error("Failed to record click", { error: String(err) });
    return NextResponse.json({ success: false, error: "Failed to record click" }, { status: 500 });
  }
}
