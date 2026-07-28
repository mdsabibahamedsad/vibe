import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getFeed } from "@/features/feed/services/feed.service";
import { feedCursorSchema } from "@/features/feed/schemas/post.schema";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    const url = new URL(request.url);
    const parsed = feedCursorSchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? 20,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid pagination parameters", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const feed = await getFeed({
      currentUserId: user.id,
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
    });

    return NextResponse.json(feed);
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to load feed" }, { status: 500 });
  }
}
