import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { unmatch } from "@/features/matching/services/match.service";

/**
 * POST /api/matches/[id]/unmatch — Unmatch a user.
 * Only accessible to match participants.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser(request);
    const { id } = await params;

    await unmatch(id, user.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to unmatch" }, { status: 500 });
  }
}
