import { createAdminClient } from "@/lib/supabase/admin";

export interface PrivacyPolicy {
  minCohortSize: number;
  suppressSparseResults: boolean;
  piiFields: string[];
  retentionDaysByCategory: Record<string, number>;
}

export class PrivacyControls {
  private defaultPolicy: PrivacyPolicy = {
    minCohortSize: 10,
    suppressSparseResults: true,
    piiFields: [
      "ip_address", "user_agent", "phone", "email",
      "credit_card", "ssn", "password", "secret", "token",
    ],
    retentionDaysByCategory: {
      engagement: 90,
      monetization: 730,
      growth: 365,
      moderation: 730,
      content: 90,
      social: 90,
      dating: 90,
      system: 90,
      advertising: 90,
      support: 730,
    },
  };

  getPolicy(): PrivacyPolicy {
    return { ...this.defaultPolicy };
  }

  applyThreshold(value: number, threshold?: number): number {
    const minSize = threshold ?? this.defaultPolicy.minCohortSize;
    return value < minSize ? 0 : value;
  }

  shouldSuppress(cohortSize: number): boolean {
    return this.defaultPolicy.suppressSparseResults && cohortSize < this.defaultPolicy.minCohortSize;
  }

  sanitizeEventProperties(
    properties: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitized = { ...properties };
    for (const field of this.defaultPolicy.piiFields) {
      delete sanitized[field];
    }
    return sanitized;
  }

  getRetentionDays(category: string): number {
    return this.defaultPolicy.retentionDaysByCategory[category] ?? 365;
  }

  validateExportFields(fields: string[]): string[] {
    const blocked = new Set(this.defaultPolicy.piiFields);
    return fields.filter((f) => !blocked.has(f));
  }

  async getDataRetentionReport(): Promise<
    Array<{ category: string; retentionDays: number; totalRows: bigint; oldestRow: string | null }>
  > {
    const admin = createAdminClient();
    const report: Array<{ category: string; retentionDays: number; totalRows: bigint; oldestRow: string | null }> = [];

    for (const [category, days] of Object.entries(this.defaultPolicy.retentionDaysByCategory)) {
      const { count } = await admin
        .from("analytics_events")
        .select("*", { count: "exact", head: true })
        .lt("created_at", new Date(Date.now() - days * 86400000).toISOString());

      report.push({
        category,
        retentionDays: days,
        totalRows: BigInt(count ?? 0),
        oldestRow: null,
      });
    }

    return report;
  }
}
