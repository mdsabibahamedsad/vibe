/**
 * API routes for user data export.
 *
 * POST /api/account/export — Export user data (returns JSON)
 * Supports filtering by categories
 *
 * Request body (optional):
 *   { "categories": ["profile", "posts", ...] }
 *
 * Response:
 *   {
 *     "success": true,
 *     "export": {
 *       "exportedAt": "...",
 *       "categories": [...],
 *       "data": { ... }
 *     }
 *   }
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  exportUserData,
  EXPORT_CATEGORIES,
  type ExportCategory,
} from "@/lib/security/data-export.service";
import { AppError } from "@/lib/errors";

/**
 * POST — Export user data.
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    const body = await request.json().catch(() => ({}));

    // Validate categories if provided
    let categories: ExportCategory[] | undefined;
    if (body.categories) {
      if (!Array.isArray(body.categories)) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Categories must be an array. Valid options: " + EXPORT_CATEGORIES.join(", "),
          },
          { status: 400 },
        );
      }

      categories = body.categories.filter((c: string) =>
        EXPORT_CATEGORIES.includes(c as ExportCategory),
      ) as ExportCategory[];

      if (categories.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              "No valid categories provided. Valid options: " + EXPORT_CATEGORIES.join(", "),
          },
          { status: 400 },
        );
      }
    }

    const result = await exportUserData(user.id, categories);

    return NextResponse.json({
      success: true,
      export: {
        exportedAt: result.exportedAt,
        categories: result.categories,
        categoryCount: result.categoryCount,
        data: result.data,
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
      { success: false, error: "Failed to export data." },
      { status: 500 },
    );
  }
}

/**
 * GET — Get export metadata (categories available).
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    availableCategories: EXPORT_CATEGORIES,
    totalCategories: EXPORT_CATEGORIES.length,
    note: "Use POST to export data. Specify categories in the request body.",
  });
}
