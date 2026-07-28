import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { createReport } from "@/features/feed/services/post.service";
import { createReportSchema } from "@/features/feed/schemas/post.schema";

/**
 * POST /api/reports — Report a user, post, or comment
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json();

    const parsed = createReportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid report data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await createReport(user.id, parsed.data);

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
  }
}
