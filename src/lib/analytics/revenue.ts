import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export interface RevenueSummary {
  totalRevenueStars: number;
  totalTransactions: number;
  uniquePayingUsers: number;
  avgRevenuePerUser: number;
  subscriptionRevenue: number;
  boostRevenue: number;
  featureRevenue: number;
  adRevenue: number;
}

export interface ReconciliationResult {
  status: "ok" | "warning" | "error";
  discrepancies: Array<{
    source: string;
    expected: number;
    actual: number;
    difference: number;
    severity: "low" | "medium" | "high";
  }>;
  lastChecked: string;
}

export class RevenueReconciliation {
  private admin;

  constructor() {
    this.admin = createAdminClient();
  }

  async getRevenueSummary(startDate: string, endDate: string): Promise<RevenueSummary> {
    const { data, error } = await this.admin.rpc("get_revenue_summary", {
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) throw new Error(`Revenue summary failed: ${error.message}`);

    const row = (data ?? [])[0] as RevenueSummary | undefined;
    return row ?? {
      totalRevenueStars: 0,
      totalTransactions: 0,
      uniquePayingUsers: 0,
      avgRevenuePerUser: 0,
      subscriptionRevenue: 0,
      boostRevenue: 0,
      featureRevenue: 0,
      adRevenue: 0,
    };
  }

  async reconcile(startDate: string, endDate: string): Promise<ReconciliationResult> {
    const discrepancies: ReconciliationResult["discrepancies"] = [];

    try {
      const [analyticsRevenue, paymentRevenue, adRevenue, creatorRevenue] = await Promise.all([
        this.getAnalyticsRevenue(startDate, endDate),
        this.getPaymentRevenue(startDate, endDate),
        this.getAdRevenue(startDate, endDate),
        this.getCreatorPayouts(startDate, endDate),
      ]);

      if (Math.abs(analyticsRevenue - paymentRevenue) > 0) {
        discrepancies.push({
          source: "analytics vs payments",
          expected: paymentRevenue,
          actual: analyticsRevenue,
          difference: analyticsRevenue - paymentRevenue,
          severity: Math.abs(analyticsRevenue - paymentRevenue) > 10 ? "high" : "low",
        });
      }

      if (discrepancies.length === 0) {
        return { status: "ok", discrepancies: [], lastChecked: new Date().toISOString() };
      }

      const hasHigh = discrepancies.some((d) => d.severity === "high");
      return {
        status: hasHigh ? "error" : "warning",
        discrepancies,
        lastChecked: new Date().toISOString(),
      };
    } catch (err) {
      logger.error("Revenue reconciliation failed", { error: String(err) });
      return {
        status: "error",
        discrepancies: [{ source: "reconciliation", expected: 0, actual: 0, difference: 0, severity: "high" }],
        lastChecked: new Date().toISOString(),
      };
    }
  }

  private async getAnalyticsRevenue(startDate: string, endDate: string): Promise<number> {
    const { data } = await this.admin
      .from("analytics_events")
      .select("properties")
      .eq("event_name", "payment_completed")
      .gte("created_at", startDate)
      .lte("created_at", endDate);

    return (data ?? []).reduce((sum: number, e: any) => {
      return sum + ((e.properties?.amount_stars as number) ?? 0);
    }, 0);
  }

  private async getPaymentRevenue(startDate: string, endDate: string): Promise<number> {
    const { data } = await this.admin
      .from("payment_transactions")
      .select("amount_stars")
      .eq("status", "completed")
      .gte("created_at", startDate)
      .lte("created_at", endDate);

    return (data ?? []).reduce((sum: number, t: any) => sum + (t.amount_stars ?? 0), 0);
  }

  private async getAdRevenue(startDate: string, endDate: string): Promise<number> {
    const { data } = await this.admin
      .from("ad_revenue_events")
      .select("amount_stars")
      .gte("created_at", startDate)
      .lte("created_at", endDate);

    return (data ?? []).reduce((sum: number, e: any) => sum + (e.amount_stars ?? 0), 0);
  }

  private async getCreatorPayouts(startDate: string, endDate: string): Promise<number> {
    const { data } = await this.admin
      .from("creator_earnings_ledger")
      .select("amount_stars")
      .gte("created_at", startDate)
      .lte("created_at", endDate);

    return (data ?? []).reduce((sum: number, e: any) => sum + (e.amount_stars ?? 0), 0);
  }
}
