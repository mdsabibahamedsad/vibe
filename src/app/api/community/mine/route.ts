import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getMyCommunities } from "@/features/community/services/community-service";

export async function GET(request: NextRequest) {
  try {
    await getCurrentUser(request);

    const communities = await getMyCommunities();

    return NextResponse.json({ communities });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to load your communities" }, { status: 500 });
  }
}
