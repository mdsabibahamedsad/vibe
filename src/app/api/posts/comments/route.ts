import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createComment, deleteComment, getComments } from "@/features/feed/services/post.service";
import { createCommentSchema } from "@/features/feed/schemas/post.schema";

/**
 * POST /api/posts/comments — Create a comment on a post
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const { postId, ...commentData } = body;

    if (!postId) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }

    const parsed = createCommentSchema.safeParse(commentData);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid comment data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const comment = await createComment(postId, user.id, parsed.data);

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
  }
}

/**
 * GET /api/posts/comments — Get comments for a post
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const url = new URL(request.url);
    const postId = url.searchParams.get("postId");
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);

    if (!postId) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }

    const result = await getComments(postId, user.id, cursor, Math.min(limit, 50));

    return NextResponse.json(result);
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }
}

/**
 * DELETE /api/posts/comments?id=xxx — Delete a comment
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const url = new URL(request.url);
    const commentId = url.searchParams.get("id");

    if (!commentId) {
      return NextResponse.json({ error: "Comment ID is required" }, { status: 400 });
    }

    await deleteComment(commentId, user.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
