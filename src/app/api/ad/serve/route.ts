/**
 * POST /api/ad/serve — Get an eligible ad for the current user at a placement.
 *
 * Returns an ad object or { found: false, reason } if no ad is eligible.
 * The server handles all eligibility, targeting, frequency caps, and premium
 * exclusion. The client simply renders what's returned.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { serveAd } from "@/lib/ad/delivery.service";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { z } from "zod";

const serveRequestSchema = z.object({
  placement: z.string().min(1, "Placement is required"),
  context: z.object({
    countries: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    age: z.number().optional(),
    gender: z.string().optional(),
    interestIds: z.array(z.string()).optional(),
  }).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    const body = await request.json();
    const parsed = serveRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    const result = await serveAd({
      userId: user.id,
      placement: parsed.data.placement,
      context: parsed.data.context,
    });

    if (!result.found) {
      return NextResponse.json({
        success: true,
        found: false,
        reason: result.reason,
      });
    }

    return NextResponse.json({
      success: true,
      found: true,
      ad: {
        requestId: result.ad!.requestId,
        campaignId: result.ad!.campaignId,
        creativeId: result.ad!.creativeId,
        creativeType: result.ad!.creativeType,
        headline: result.ad!.headline,
        body: result.ad!.body,
        mediaId: result.ad!.mediaId,
        thumbnailMediaId: result.ad!.thumbnailMediaId,
        destinationType: result.ad!.destinationType,
        destinationUrl: result.ad!.destinationUrl,
        destinationPage: result.ad!.destinationPage,
        cta: result.ad!.cta,
        sponsoredLabel: result.ad!.sponsoredLabel,
        isHouseCampaign: result.ad!.isHouseCampaign,
        impressionEventId: result.ad!.impressionEventId,
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode },
      );
    }
    logger.error("Ad serve error", { error: String(err) });
    return NextResponse.json({ success: false, error: "Failed to serve ad" }, { status: 500 });
  }
}
