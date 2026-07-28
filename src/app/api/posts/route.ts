import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createPost, deletePost, getPostById } from "@/features/feed/services/post.service";
import { createPostSchema } from "@/features/feed/schemas/post.schema";

/**
 * POST /api/posts — Create a new post
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const parsed = createPostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid post data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const post = await createPost(user.id, parsed.data);

    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}

/**
 * GET /api/posts?id=xxx — Get a single post by ID
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const url = new URL(request.url);
    const postId = url.searchParams.get("id");

    if (!postId) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }

    const post = await getPostById(postId, user.id);

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json({ post });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to load post" }, { status: 500 });
  }
}

/**
 * DELETE /api/posts?id=xxx — Delete a post (soft delete)
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const url = new URL(request.url);
    const postId = url.searchParams.get("id");

    if (!postId) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }

    await deletePost(postId, user.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
  }
}
