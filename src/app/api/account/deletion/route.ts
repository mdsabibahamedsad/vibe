/**
 * API routes for account deletion.
 *
 * POST /api/account/deletion — Request account deletion
 * GET /api/account/deletion — Check deletion request status
 * DELETE /api/account/deletion — Cancel pending deletion request
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  requestAccountDeletion,
  cancelDeletionRequest,
  getDeletionRequestStatus,
} from "@/lib/security/account-deletion.service";
import { AppError } from "@/lib/errors";

/**
 * POST — Request account deletion.
 * Creates a deletion request with a grace period.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason : undefined;

    const result = await requestAccountDeletion(user.id, reason);

    return NextResponse.json({
      success: true,
      deletionRequest: {
        id: result.id,
        status: result.status,
        confirmAt: result.confirmAt,
        message: `Your account deletion has been requested. You have until ${new Date(result.confirmAt).toLocaleDateString()} to cancel this request.`,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to request account deletion." },
      { status: 500 },
    );
  }
}

/**
 * GET — Check deletion request status.
 */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const status = await getDeletionRequestStatus(user.id);

    if (!status) {
      return NextResponse.json({
        success: true,
        hasActiveRequest: false,
        deletionRequest: null,
      });
    }

    return NextResponse.json({
      success: true,
      hasActiveRequest: ["pending", "confirmed", "processing"].includes(status.status),
      deletionRequest: {
        status: status.status,
        confirmAt: status.confirmAt,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to check deletion status." },
      { status: 500 },
    );
  }
}

/**
 * DELETE — Cancel a pending deletion request.
 */
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const status = await getDeletionRequestStatus(user.id);

    if (!status || !["pending"].includes(status.status)) {
      return NextResponse.json(
        { success: false, error: "No pending deletion request to cancel." },
        { status: 400 },
      );
    }

    // We need the request ID — get it from the status
    const adminClient = (await import("@/lib/supabase/admin")).createAdminClient();
    const { data } = await adminClient
      .from("account_deletion_requests")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .single();

    if (!data) {
      return NextResponse.json(
        { success: false, error: "No pending deletion request found." },
        { status: 404 },
      );
    }

    await cancelDeletionRequest(user.id, data.id);

    return NextResponse.json({
      success: true,
      message: "Account deletion request has been cancelled.",
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to cancel deletion request." },
      { status: 500 },
    );
  }
}
