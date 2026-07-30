import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export interface DataQualityCheck {
  checkName: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  severity: "info" | "low" | "medium" | "high";
}

export class DataQuality {
  private admin;

  constructor() {
    this.admin = createAdminClient();
  }

  async runAllChecks(): Promise<DataQualityCheck[]> {
    try {
      const { data, error } = await this.admin.rpc("check_analytics_data_quality");
      if (error) throw error;
      return (data ?? []) as DataQualityCheck[];
    } catch (err) {
      logger.error("Data quality checks failed", { error: String(err) });
      return [{
        checkName: "data_quality_job",
        status: "fail",
        detail: `Failed to run checks: ${String(err)}`,
        severity: "high",
      }];
    }
  }

  async checkRecentEvents(hours: number = 1): Promise<boolean> {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { count } = await this.admin
      .from("analytics_events")
      .select("*", { count: "exact", head: true })
      .gte("created_at", cutoff);

    return (count ?? 0) > 0;
  }

  async checkDuplicateEvents(): Promise<number> {
    const checks = await this.runAllChecks();
    const duplicateCheck = checks.find((c) => c.checkName === "duplicate_events");
    return duplicateCheck?.status === "fail" ? 1 : 0;
  }

  async checkRevenueConsistency(): Promise<{ consistent: boolean; discrepancy: number }> {
    const checks = await this.runAllChecks();
    const revCheck = checks.find((c) => c.checkName === "revenue_inconsistency");
    return {
      consistent: revCheck?.status === "pass",
      discrepancy: revCheck?.status === "warn" ? 1 : 0,
    };
  }

  getAlertLevel(checks: DataQualityCheck[]): "ok" | "warning" | "critical" {
    const hasFail = checks.some((c) => c.status === "fail" && c.severity === "high");
    const hasWarn = checks.some((c) => c.status === "warn" || c.status === "fail");

    if (hasFail) return "critical";
    if (hasWarn) return "warning";
    return "ok";
  }
}
