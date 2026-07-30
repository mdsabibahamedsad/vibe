/**
 * POST /api/billing/invoice — Create a Telegram Stars invoice for a plan.
 *
 * The server:
 *   1. Verifies the user is authenticated
 *   2. Resolves plan slug to current plan (authoritative price)
 *   3. Generates a secure invoice payload binding user + plan
 *   4. Creates Telegram invoice link
 *   5. Returns the link for the Mini App to open
 *
 * The client NEVER specifies the price — only the plan slug.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { requireActivePlan, createInvoiceLink, generateInvoicePayload } from "@/lib/billing/billing.service";
import { AppError } from "@/lib/errors";
import { RateLimiter } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import { z } from "zod";

// Rate limit: 5 invoice creations per user per minute
const invoiceRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  name: "invoice",
});

const invoiceRequestSchema = z.object({
  planSlug: z.string().min(1, "Plan slug is required"),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);

    // Rate limit check — use enforce() which throws AppError on rate limit
    await invoiceRateLimiter.enforce(`user:${user.id}`);

    const body = await request.json();
    const parsed = invoiceRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    // Resolve plan (authoritative — client never provides price)
    const plan = await requireActivePlan(parsed.data.planSlug);

    // Check if user is banned
    if (user.isBanned) {
      return NextResponse.json(
        { success: false, error: "Account restrictions prevent purchases" },
        { status: 403 },
      );
    }

    // Generate secure invoice payload
    const invoicePayload = generateInvoicePayload(user.id, plan.slug);

    // Create Telegram invoice link
    const invoice = await createInvoiceLink(plan, invoicePayload);

    return NextResponse.json({
      success: true,
      invoice: {
        link: invoice.link,
        planSlug: plan.slug,
        starsPrice: plan.starsPrice,
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode },
      );
    }
    return NextResponse.json({ success: false, error: "Failed to create invoice" }, { status: 500 });
  }
}
