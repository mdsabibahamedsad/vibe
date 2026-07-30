import { createAdminClient } from "@/lib/supabase/admin";

export interface UnitEconomicsData {
  dauAvg: number;
  mau: number;
  totalUsers: number;
  activeUsers: number;
  premiumUsers: number;
  revenueStars: number;
  arpuStars: number;
  arppuStars: number;
  premiumConversionRate: number;
  creatorCount: number;
  creatorRevenueStars: number;
}

export class UnitEconomics {
  private admin;

  constructor() {
    this.admin = createAdminClient();
  }

  async getUnitEconomics(startDate: string, endDate: string): Promise<UnitEconomicsData> {
    const { data, error } = await this.admin.rpc("get_unit_economics", {
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) throw new Error(`Unit economics failed: ${error.message}`);

    const row = (data ?? [])[0] as UnitEconomicsData | undefined;
    return row ?? {
      dauAvg: 0, mau: 0, totalUsers: 0, activeUsers: 0,
      premiumUsers: 0, revenueStars: 0, arpuStars: 0, arppuStars: 0,
      premiumConversionRate: 0, creatorCount: 0, creatorRevenueStars: 0,
    };
  }

  async getArpu(startDate: string, endDate: string): Promise<number> {
    const { data } = await this.admin.rpc("get_unit_economics", {
      p_start_date: startDate,
      p_end_date: endDate,
    });
    return (data ?? [])[0]?.arpu_stars ?? 0;
  }

  async getArppu(startDate: string, endDate: string): Promise<number> {
    const { data } = await this.admin.rpc("get_unit_economics", {
      p_start_date: startDate,
      p_end_date: endDate,
    });
    return (data ?? [])[0]?.arppu_stars ?? 0;
  }

  async getConversionRate(startDate: string, endDate: string): Promise<number> {
    const { data } = await this.admin.rpc("get_unit_economics", {
      p_start_date: startDate,
      p_end_date: endDate,
    });
    return (data ?? [])[0]?.premium_conversion_rate ?? 0;
  }
}
