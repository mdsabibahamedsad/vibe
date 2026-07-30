import { createAdminClient } from "@/lib/supabase/admin";

export interface RetentionPoint {
  weekOffset: number;
  cohortSize: number;
  retainedUsers: number;
  retentionRate: number;
}

export interface CohortData {
  cohortWeek: number;
  weekOffset: number;
  cohortSize: number;
  retainedUsers: number;
  retentionRate: number;
}

export class RetentionEngine {
  private admin;

  constructor() {
    this.admin = createAdminClient();
  }

  async getCohortRetention(
    startDate: string,
    endDate: string,
    weeks: number = 12,
  ): Promise<CohortData[]> {
    const { data, error } = await this.admin.rpc("get_cohort_retention", {
      p_cohort_start: startDate,
      p_cohort_end: endDate,
      p_weeks: weeks,
    });

    if (error) throw new Error(`Cohort retention failed: ${error.message}`);
    return (data ?? []) as CohortData[];
  }

  async getD1Retention(startDate: string, endDate: string): Promise<number> {
    const cohorts = await this.getCohortRetention(startDate, endDate, 2);
    const d1 = cohorts.find((c) => c.weekOffset === 1);
    return d1?.retentionRate ?? 0;
  }

  async getD7Retention(startDate: string, endDate: string): Promise<number> {
    const cohorts = await this.getCohortRetention(startDate, endDate, 8);
    const d7 = cohorts.find((c) => c.weekOffset === 1);
    return d7?.retentionRate ?? 0;
  }

  async getD30Retention(startDate: string, endDate: string): Promise<number> {
    const cohorts = await this.getCohortRetention(startDate, endDate, 5);
    const d30 = cohorts.find((c) => c.weekOffset === 4);
    return d30?.retentionRate ?? 0;
  }
}

export class CohortEngine {
  private admin;

  constructor() {
    this.admin = createAdminClient();
  }

  async getCohortComparison(
    cohorts: Array<{ label: string; startDate: string; endDate: string }>,
    weeks: number = 12,
  ): Promise<Record<string, CohortData[]>> {
    const result: Record<string, CohortData[]> = {};

    for (const cohort of cohorts) {
      const retention = new RetentionEngine();
      result[cohort.label] = await retention.getCohortRetention(
        cohort.startDate,
        cohort.endDate,
        weeks,
      );
    }

    return result;
  }
}
