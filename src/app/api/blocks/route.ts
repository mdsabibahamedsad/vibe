import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, authorizationError } from "@/lib/errors";
import { z } from "zod";

const blockSchema = z.object({
  blockedUserId: z.string().uuid("Invalid user ID"),
});

/**
 * POST /api/blocks — Block a user
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const parsed = blockSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid user ID", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (user.id === parsed.data.blockedUserId) {
      return NextResponse.json({ error: "You cannot block yourself" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient.from("blocks").insert({
      blocker_id: user.id,
      blocked_id: parsed.data.blockedUserId,
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ success: true }); // Already blocked — idempotent
      }
      throw new AppError("INTERNAL_ERROR", "Failed to block user", { statusCode: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to block user" }, { status: 500 });
  }
}

/**
 * DELETE /api/blocks?blockedUserId=xxx — Unblock a user
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const url = new URL(request.url);
    const blockedUserId = url.searchParams.get("blockedUserId");

    if (!blockedUserId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from("blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", blockedUserId);

    if (error) {
      throw new AppError("INTERNAL_ERROR", "Failed to unblock user", { statusCode: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to unblock user" }, { status: 500 });
  }
}
