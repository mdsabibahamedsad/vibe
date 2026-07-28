import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { updatePost } from "@/features/feed/services/post.service";
import { updatePostSchema } from "@/features/feed/schemas/post.schema";

/**
 * PUT /api/posts/edit — Update a post (caption, visibility, comments)
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const { postId, ...updateData } = body;

    if (!postId) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }

    const parsed = updatePostSchema.safeParse(updateData);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid update data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const post = await updatePost(postId, user.id, parsed.data);

    return NextResponse.json({ post });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to update post" }, { status: 500 });
  }
}
