import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getOptionalCurrentUser } from "@/lib/auth/get-current-user";
import { getCommunities, createCommunity, getMyCommunities } from "@/features/community/services/community-service";

export async function GET(_request: NextRequest) {
  try {
    const communities = await getCommunities();

    const user = await getOptionalCurrentUser();
    const myCommunities = user ? await getMyCommunities() : [];

    const myIds = new Set(myCommunities.map((c) => c.id));
    const enriched = communities.map((c) => ({
      ...c,
      isMember: myIds.has(c.id),
    }));

    return NextResponse.json({ communities: enriched });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to load communities" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const _user = await getCurrentUser(request);

    const body = await request.json();
    const community = await createCommunity({
      name: body.name,
      slug: body.slug,
      description: body.description,
      visibility: body.visibility,
    });

    return NextResponse.json({ community }, { status: 201 });
  } catch (err) {
    const error = err as Error;
    if ("statusCode" in error) {
      return NextResponse.json({ error: error.message }, { status: (error as any).statusCode });
    }
    return NextResponse.json({ error: "Failed to create community" }, { status: 500 });
  }
}
