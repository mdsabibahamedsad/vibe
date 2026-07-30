import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { processDatingAction } from "@/features/matching/services/match.service";
import { datingActionSchema } from "@/lib/discovery/schemas";

/**
 * POST /api/discovery/action — Perform a dating action (like/pass/super_like)
 *
 * Now integrates with the matching system — mutual positive actions
 * atomically create a match.
 *
 * Body: { targetUserId: string, action: "like" | "pass" | "super_like" }
 *
 * Response when matched:
 *   { success: true, action: "like", matched: true, matchId: "uuid", notificationCreated: true }
 *
 * Response when not matched:
 *   { success: true, action: "like", matched: false }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const parsed = datingActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid action data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { targetUserId, action } = parsed.data;

    const result = await processDatingAction(user.id, targetUserId, action);

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message, code: (error as any).code },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to perform action" }, { status: 500 });
  }
}
