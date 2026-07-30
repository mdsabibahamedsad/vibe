import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { leaveCommunity } from "@/features/community/services/community-service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await getCurrentUser(_request);

    const { id } = await params;
    await leaveCommunity(id);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to leave community" }, { status: 500 });
  }
}
