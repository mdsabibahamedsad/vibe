/**
 * POST /api/recommendations/feedback
 *
 * Record a user action on a recommended candidate.
 * Used for ranking improvement feedback loop.
 *
 * Body:
 *   candidateId — ID of the recommended user
 *   action      — like | pass | super_like | follow | view
 *   requestId   — (optional) the recommendation request ID
 *
 * Auth: Required
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { recordFeedback } from "@/lib/recommendation/feedback.service";
import { AppError } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { candidateId, action, requestId, mode } = body;

    if (!candidateId || !action) {
      return NextResponse.json(
        { error: "Missing required fields: candidateId, action" },
        { status: 400 },
      );
    }

    await recordFeedback({
      viewerId: user.id,
      candidateId,
      action,
      requestId,
      mode,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
