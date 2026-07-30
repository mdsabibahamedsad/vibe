/**
 * GET /api/admin/content — Search content by type and moderation status
 * POST /api/admin/content — Remove or restore content
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleAdminError, adminResponse } from "@/lib/admin/admin-api";
import { Permissions } from "@/lib/admin/permissions";
import {
  searchContent,
  removeContent,
  restoreContent,
  getContentDetails,
  type ContentType,
} from "@/lib/admin/content-moderation.service";
import { z } from "zod";

/**
 * GET /api/admin/content — Search content
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, Permissions.CONTENT_VIEW);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(request.url);
    const contentType = url.searchParams.get("type") as ContentType | null;
    const contentId = url.searchParams.get("contentId");
    const moderationStatus = url.searchParams.get("moderationStatus") ?? undefined;
    const authorId = url.searchParams.get("authorId") ?? undefined;

    // If contentId is provided, get full details
    if (contentType && contentId) {
      const details = await getContentDetails(auth.role, contentType, contentId);
      return adminResponse(details);
    }

    const result = await searchContent(auth.role, {
      type: contentType ?? undefined,
      moderationStatus,
      authorId,
      limit: url.searchParams.get("limit")
        ? parseInt(url.searchParams.get("limit")!)
        : 25,
    });

    return adminResponse(result);
  } catch (err) {
    return handleAdminError(err);
  }
}

/**
 * POST /api/admin/content — Remove or restore content
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, contentType, contentId, reasonCode, reason } = body;

    if (!action || !contentType || !contentId) {
      return NextResponse.json(
        { error: "action, contentType, and contentId are required" },
        { status: 400 },
      );
    }

    const validContentTypes = ["post", "comment", "story", "media"];
    if (!validContentTypes.includes(contentType)) {
      return NextResponse.json({ error: "Invalid content type" }, { status: 400 });
    }

    switch (action) {
      case "remove": {
        const auth = await requireAdmin(request, Permissions.CONTENT_REMOVE);
        if (auth instanceof Response) return auth;

        const schema = z.object({
          action: z.literal("remove"),
          contentType: z.enum(["post", "comment", "story", "media"]),
          contentId: z.string().uuid(),
          reasonCode: z.string().min(1),
          reason: z.string().optional(),
        });
        const parsed = schema.parse(body);
        await removeContent(
          auth.userId,
          auth.role,
          parsed.contentType as ContentType,
          parsed.contentId,
          parsed.reasonCode,
          parsed.reason,
        );
        return adminResponse({ message: "Content removed" });
      }

      case "restore": {
        const auth = await requireAdmin(request, Permissions.CONTENT_RESTORE);
        if (auth instanceof Response) return auth;

        const schema = z.object({
          action: z.literal("restore"),
          contentType: z.enum(["post", "comment", "story", "media"]),
          contentId: z.string().uuid(),
          reason: z.string().optional(),
        });
        const parsed = schema.parse(body);
        await restoreContent(
          auth.userId,
          auth.role,
          parsed.contentType as ContentType,
          parsed.contentId,
          parsed.reason,
        );
        return adminResponse({ message: "Content restored" });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: err.errors }, { status: 400 });
    }
    return handleAdminError(err);
  }
}
