/**
 * GET /api/safety/message-requests — Get message request settings
 * PUT /api/safety/message-requests — Update message request settings
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  getMessageRequestSettings,
  updateMessageRequestSettings,
} from "@/lib/safety/chat-safety.service";
import { z } from "zod";

const updateSchema = z.object({
  whoCanMessage: z.enum(["everyone", "followers", "matches_only", "nobody"]).optional(),
  requirePrompt: z.boolean().optional(),
  autoDeclineDays: z.number().int().min(1).max(30).optional(),
  allowNewAccounts: z.boolean().optional(),
});

/**
 * GET /api/safety/message-requests
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await getMessageRequestSettings(user.id);

    return NextResponse.json({ settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/safety/message-requests
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid settings", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await updateMessageRequestSettings(user.id, parsed.data);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
