import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { dismissSafetyWarning } from "@/lib/safety/chat-safety.service";

/**
 * POST /api/safety/warnings/[id]/dismiss
 * Dismisses a safety warning for the current user.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await dismissSafetyWarning(id, user.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to dismiss warning";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
