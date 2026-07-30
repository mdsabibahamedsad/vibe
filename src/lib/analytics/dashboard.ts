import { createAdminClient } from "@/lib/supabase/admin";

export interface DashboardMetric {
  label: string;
  value: number;
  change?: number;
  format?: "number" | "currency" | "percent" | "duration";
}

export interface DashboardData {
  overview: Record<string, number>;
  engagement: Record<string, number>;
  monetization: Record<string, number>;
  safety: Record<string, number>;
  growth: Record<string, number>;
  lastRefreshed: string;
}

export class AnalyticsDashboard {
  private admin;

  constructor() {
    this.admin = createAdminClient();
  }

  async getDashboard(startDate: string, endDate: string): Promise<DashboardData> {
    const { data, error } = await this.admin.rpc("get_analytics_dashboard", {
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) throw new Error(`Dashboard failed: ${error.message}`);

    const json = data as Record<string, any> ?? {};
    return {
      overview: json.overview ?? {},
      engagement: json.engagement ?? {},
      monetization: json.monetization ?? {},
      safety: json.safety ?? {},
      growth: json.growth ?? {},
      lastRefreshed: new Date().toISOString(),
    };
  }

  async getDauTimeseries(days: number = 30): Promise<Array<{ date: string; dau: number }>> {
    const { data, error } = await this.admin.rpc("get_dau_timeseries", {
      p_days: days,
    });

    if (error) throw new Error(`DAU timeseries failed: ${error.message}`);
    return (data ?? []) as Array<{ date: string; dau: number }>;
  }

  async getMauTimeseries(months: number = 12): Promise<Array<{ month: string; mau: number }>> {
    const { data, error } = await this.admin.rpc("get_mau_timeseries", {
      p_months: months,
    });

    if (error) throw new Error(`MAU timeseries failed: ${error.message}`);
    return (data ?? []) as Array<{ month: string; mau: number }>;
  }

  async getDailyRevenue(days: number = 30): Promise<Array<{ date: string; revenue: number }>> {
    const { data, error } = await this.admin
      .from("mv_daily_revenue")
      .select("date, total_revenue_stars")
      .gte("date", new Date(Date.now() - days * 86400000).toISOString().split("T")[0])
      .order("date");

    if (error) throw new Error(`Daily revenue failed: ${error.message}`);
    return (data ?? []).map((r: any) => ({ date: r.date, revenue: r.total_revenue_stars }));
  }
}
