import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  addStoryReaction,
  removeStoryReaction,
} from "@/lib/stories/story.service";
import { storyReactionSchema } from "@/lib/stories/schemas";

/**
 * POST /api/stories/[id]/reactions — Add or change a reaction on a story
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser(request);
    const { id } = await params;

    const body = await request.json();
    const parsed = storyReactionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid reaction", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await addStoryReaction(id, user.id, parsed.data.reaction);

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
      { error: "Failed to add reaction" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/stories/[id]/reactions — Remove a reaction from a story
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser(request);
    const { id } = await params;

    await removeStoryReaction(id, user.id);

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
      { error: "Failed to remove reaction" },
      { status: 500 },
    );
  }
}
