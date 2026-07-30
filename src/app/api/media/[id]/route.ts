import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getMediaUrl } from "@/lib/media/media.service";
import { getMediaCacheHeaders } from "@/lib/media/media.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, authorizationError, notFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { DERIVATIVE_TYPES } from "@/lib/media/constants";
import type { DerivativeType } from "@/lib/media/constants";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const user = await getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const derivativeParam = searchParams.get("derivative") as DerivativeType | null;
    const download = searchParams.get("download") === "true";

    const derivative = derivativeParam &&
      Object.values(DERIVATIVE_TYPES).includes(derivativeParam as any)
      ? (derivativeParam as DerivativeType)
      : undefined;

    const adminClient = createAdminClient();
    const { data: media } = await adminClient
      .from("media")
      .select("*")
      .eq("id", id)
      .single();

    if (!media || media.deleted_at) {
      return NextResponse.json(
        { error: "Media not found" },
        { status: 404 },
      );
    }

    const accessResult = await getMediaUrl(id, derivative, user.id);

    if (accessResult.url.startsWith("http")) {
      const headers = new Headers(getMediaCacheHeaders(
        media.visibility,
        media.version || 1,
      ));

      if (download) {
        headers.set("Content-Disposition", `attachment; filename="${id}.${accessResult.mimeType?.split("/").pop() || "bin"}"`);
      }

      return NextResponse.redirect(accessResult.url, { headers });
    }

    try {
      const response = await fetch(accessResult.url);
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

      const blob = await response.blob();
      const headers = new Headers({
        "Content-Type": accessResult.mimeType || media.mime_type || "application/octet-stream",
        "Content-Length": blob.size.toString(),
        ...getMediaCacheHeaders(media.visibility, media.version || 1),
      });

      if (download) {
        headers.set(
          "Content-Disposition",
          `attachment; filename="${id}.${(accessResult.mimeType || media.mime_type || "").split("/").pop() || "bin"}"`,
        );
      }

      return new NextResponse(blob, { status: 200, headers });
    } catch {
      return NextResponse.redirect(accessResult.url);
    }
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode || 403 },
      );
    }

    logger.error("Media serve failed", {
      mediaId: id,
      error: err instanceof Error ? err.message : "Unknown",
    });

    return NextResponse.json(
      { error: "Failed to serve media" },
      { status: 500 },
    );
  }
}
