import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { recordStoryView } from "@/lib/stories/story.service";

/**
 * POST /api/stories/[id]/view — Record a view for a story
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser(request);
    const { id } = await params;

    const success = await recordStoryView(id, user.id);

    if (!success) {
      return NextResponse.json(
        { error: "Cannot view this story" },
        { status: 403 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json(
      { error: "Failed to record view" },
      { status: 500 },
    );
  }
}
