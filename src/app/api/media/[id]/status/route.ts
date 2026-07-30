import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, notFoundError, authorizationError } from "@/lib/errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const user = await getCurrentUser(request);

    const adminClient = createAdminClient();

    const { data: media } = await adminClient
      .from("media")
      .select("id, owner_id, media_type, processing_status, failed_at, error_code")
      .eq("id", id)
      .single();

    if (!media) {
      throw notFoundError("Media not found");
    }

    if (media.owner_id !== user.id) {
      throw authorizationError("You can only check the status of your own media");
    }

    return NextResponse.json({
      mediaId: media.id,
      mediaType: media.media_type,
      processingStatus: media.processing_status,
      ready: media.processing_status === "ready",
      failed: media.processing_status === "failed",
      failedAt: media.failed_at || null,
      error: media.error_code || null,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode || 403 },
      );
    }

    return NextResponse.json(
      { error: "Failed to check processing status" },
      { status: 500 },
    );
  }
}
