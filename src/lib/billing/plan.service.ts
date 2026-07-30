/**
 * Plan Service — Subscription Plan Catalog.
 *
 * Manages the subscription plan catalog.
 * All plan prices come from the database, NOT from client code.
 * The client is never authoritative for pricing.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, notFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export interface SubscriptionPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  starsPrice: number;
  durationDays: number;
  isActive: boolean;
  sortOrder: number;
  features: string[];
  metadata: Record<string, unknown>;
}

/**
 * Get all active subscription plans, ordered by sort_order.
 */
export async function getActivePlans(): Promise<SubscriptionPlan[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    logger.error("Failed to fetch subscription plans", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to load plans");
  }

  return (data ?? []).map(formatPlan);
}

/**
 * Get all plans (including inactive — for admin).
 */
export async function getAllPlans(): Promise<SubscriptionPlan[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("subscription_plans")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    logger.error("Failed to fetch all plans", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to load plans");
  }

  return (data ?? []).map(formatPlan);
}

/**
 * Get a single plan by slug.
 */
export async function getPlanBySlug(slug: string): Promise<SubscriptionPlan | null> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("subscription_plans")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error) return null;
  return formatPlan(data);
}

/**
 * Get a single plan by slug, throwing if not found or inactive.
 */
export async function requireActivePlan(slug: string): Promise<SubscriptionPlan> {
  const plan = await getPlanBySlug(slug);

  if (!plan) throw notFoundError(`Plan not found: ${slug}`);
  if (!plan.isActive) throw new AppError("VALIDATION_ERROR", "This plan is no longer available");

  return plan;
}

/**
 * Calculate the effective monthly price for comparison display.
 */
export function calculateMonthlyPrice(starsPrice: number, durationDays: number): number {
  if (durationDays <= 0) return starsPrice;
  const months = durationDays / 30.44; // average days per month
  return Math.round(starsPrice / months);
}

// ============================================================================
// ADMIN PLAN MANAGEMENT
// ============================================================================

export interface PlanUpdateInput {
  name?: string;
  description?: string;
  starsPrice?: number;
  durationDays?: number;
  isActive?: boolean;
  sortOrder?: number;
  features?: string[];
}

/**
 * Update a plan (admin only).
 */
export async function updatePlan(planId: string, input: PlanUpdateInput): Promise<void> {
  const adminClient = createAdminClient();

  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.starsPrice !== undefined) updateData.stars_price = input.starsPrice;
  if (input.durationDays !== undefined) updateData.duration_days = input.durationDays;
  if (input.isActive !== undefined) updateData.is_active = input.isActive;
  if (input.sortOrder !== undefined) updateData.sort_order = input.sortOrder;
  if (input.features !== undefined) updateData.features = input.features;

  const { error } = await adminClient
    .from("subscription_plans")
    .update(updateData)
    .eq("id", planId);

  if (error) {
    logger.error("Failed to update plan", { planId, error: error.message });
    throw new AppError("INTERNAL_ERROR", "Failed to update plan");
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function formatPlan(raw: Record<string, unknown>): SubscriptionPlan {
  return {
    id: raw.id as string,
    slug: raw.slug as string,
    name: raw.name as string,
    description: (raw.description as string) ?? null,
    starsPrice: raw.stars_price as number,
    durationDays: raw.duration_days as number,
    isActive: raw.is_active as boolean,
    sortOrder: raw.sort_order as number,
    features: (raw.features as string[]) ?? [],
    metadata: (raw.metadata as Record<string, unknown>) ?? {},
  };
}
