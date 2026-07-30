import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { requireChatAccess } from "@/features/chat/services/chat-access.service";
import { uploadChatMedia } from "@/features/chat/services/chat-upload.service";
import { chatMediaUploadSchema } from "@/lib/chat/schemas";
import { logger } from "@/lib/logger";

/**
 * POST /api/chat/upload — Upload media for a chat message.
 *
 * Body: { matchId, mediaType, mimeType, fileSize?, width?, height?, durationSeconds?,
 *         storageProvider, providerFileId?, storagePath? }
 *
 * Creates a media record associated with the sender.
 * The resulting media ID can be used in sendMessage with messageType "image" or "video".
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const parsed = chatMediaUploadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid upload data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Verify chat access before allowing upload
    await requireChatAccess(user.id, parsed.data.matchId);

    // Upload media
    const result = await uploadChatMedia(user.id, {
      ...parsed.data,
      fileSize: body.fileSize,
      width: body.width,
      height: body.height,
      durationSeconds: body.durationSeconds,
      storageProvider: body.storageProvider ?? "telegram",
      providerFileId: body.providerFileId,
      storagePath: body.storagePath,
    });

    return NextResponse.json(
      { success: true, mediaId: result.id, mediaType: result.mediaType },
      { status: 201 },
    );
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as any).statusCode },
      );
    }
    logger.error("Chat upload failed", {
      error: error.message,
    });
    return NextResponse.json({ error: "Failed to upload media" }, { status: 500 });
  }
}
