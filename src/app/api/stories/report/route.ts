import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { reportStory } from "@/lib/stories/story.service";
import { storyReportSchema } from "@/lib/stories/schemas";

/**
 * POST /api/stories/report — Report a story
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const parsed = storyReportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid report data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await reportStory(
      user.id,
      parsed.data.storyId,
      parsed.data.reason,
      parsed.data.details,
    );

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json(
      { error: "Failed to submit report" },
      { status: 500 },
    );
  }
}
