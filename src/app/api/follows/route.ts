import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  followUser,
  unfollowUser,
  getFollowStatus,
  getFollowersCount,
  getFollowingCount,
} from "@/features/feed/services/post.service";
import { followSchema } from "@/features/feed/schemas/post.schema";

/**
 * POST /api/follows — Follow a user
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const parsed = followSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid user ID", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await followUser(user.id, parsed.data.userId);

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to follow user" }, { status: 500 });
  }
}

/**
 * DELETE /api/follows — Unfollow a user
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const url = new URL(request.url);
    const targetUserId = url.searchParams.get("userId");

    if (!targetUserId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    await unfollowUser(user.id, targetUserId);

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to unfollow user" }, { status: 500 });
  }
}

/**
 * GET /api/follows?userId=xxx — Get follow status and counts
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const url = new URL(request.url);
    const targetUserId = url.searchParams.get("userId") ?? user.id;

    const [status, followersCount, followingCount] = await Promise.all([
      getFollowStatus(user.id, targetUserId),
      getFollowersCount(targetUserId),
      getFollowingCount(targetUserId),
    ]);

    return NextResponse.json({
      ...status,
      followersCount,
      followingCount,
    });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to load follow status" }, { status: 500 });
  }
}
