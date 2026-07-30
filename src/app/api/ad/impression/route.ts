/**
 * POST /api/ad/impression — Record an ad impression.
 *
 * Called by the client when an ad enters the viewport.
 * Uses event_id for idempotency to prevent duplicate counting.
 * Rate-limited to prevent abuse.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { recordImpression, recordViewability } from "@/lib/ad/impression.service";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { z } from "zod";

const impressionSchema = z.object({
  campaignId: z.string(),
  creativeId: z.string(),
  placement: z.string(),
  requestId: z.string().optional(),
  eventId: z.string().min(1),
  sessionId: z.string().optional(),
  viewabilityPct: z.number().min(0).max(100).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    const body = await request.json();
    const parsed = impressionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    const { eventId, viewabilityPct, ...rest } = parsed.data;

    // Record the impression
    const recorded = await recordImpression({
      userId: user.id,
      ...rest,
      eventId,
    });

    // If viewability data is provided, update the impression
    if (recorded && viewabilityPct !== undefined) {
      await recordViewability(eventId, viewabilityPct);
    }

    return NextResponse.json({ success: true, recorded });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode },
      );
    }
    logger.error("Failed to record impression", { error: String(err) });
    return NextResponse.json({ success: false, error: "Failed to record impression" }, { status: 500 });
  }
}
