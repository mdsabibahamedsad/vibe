import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  getActiveStoriesForUser,
  createStory,
} from "@/lib/stories/story.service";
import { createStorySchema } from "@/lib/stories/schemas";

/**
 * GET /api/stories — Get active stories for the current user (StoriesBar data)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    const url = new URL(request.url);
    const authorId = url.searchParams.get("authorId");

    if (authorId) {
      // Get stories for a specific author
      const { getStoriesByAuthor } = await import("@/lib/stories/story.service");
      const stories = await getStoriesByAuthor(authorId, user.id);
      return NextResponse.json({ stories });
    }

    const storiesBar = await getActiveStoriesForUser(user.id);

    return NextResponse.json(storiesBar);
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to load stories" }, { status: 500 });
  }
}

/**
 * POST /api/stories — Create a new story
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const parsed = createStorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid story data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const story = await createStory(user.id, parsed.data);

    return NextResponse.json({ story }, { status: 201 });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    return NextResponse.json({ error: "Failed to create story" }, { status: 500 });
  }
}
