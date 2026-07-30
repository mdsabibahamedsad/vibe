/**
 * GET /api/ad/click/[eventId] — Click redirect handler.
 *
 * Takes a click event ID, validates it, and redirects to the safe destination.
 * This prevents open redirect vulnerabilities by never accepting
 * a redirect URL from the client — only from the server's stored creative data.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveClickDestination } from "@/lib/ad/click.service";
import { logger } from "@/lib/logger";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  try {
    const destination = await resolveClickDestination(eventId);

    if (!destination) {
      return NextResponse.json(
        { error: "Invalid or expired click event" },
        { status: 404 },
      );
    }

    // Redirect to the safe destination
    switch (destination.type) {
      case "external_url":
        if (destination.url) {
          // Validate it's a safe HTTPS URL
          try {
            const url = new URL(destination.url);
            if (url.protocol !== "https:") {
              return NextResponse.json({ error: "Invalid destination" }, { status: 400 });
            }
            return NextResponse.redirect(destination.url);
          } catch {
            return NextResponse.json({ error: "Invalid destination" }, { status: 400 });
          }
        }
        break;
      case "internal_page":
        if (destination.page) {
          return NextResponse.redirect(new URL(destination.page, requestUrl(_request)));
        }
        break;
      case "internal_profile":
        if (destination.profileId) {
          return NextResponse.redirect(
            new URL(`/profile/${destination.profileId}`, requestUrl(_request)),
          );
        }
        break;
    }

    return NextResponse.redirect(new URL("/", requestUrl(_request)));
  } catch (err) {
    logger.error("Click redirect error", { eventId, error: String(err) });
    return NextResponse.redirect(new URL("/", requestUrl(_request)));
  }
}

function requestUrl(request: NextRequest): string {
  const url = request.url;
  // Extract the origin from the request URL
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}
