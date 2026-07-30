import { createAdminClient } from "@/lib/supabase/admin";

export interface FunnelStep {
  step: number;
  eventName: string;
  uniqueUsers: number;
  conversionFromFirst: number;
  dropoffFromPrevious: number;
}

export interface FunnelAnalysis {
  name: string;
  steps: FunnelStep[];
}

export class Funnels {
  private admin;

  constructor() {
    this.admin = createAdminClient();
  }

  async getFunnel(
    eventNames: string[],
    startDate: string,
    endDate: string,
  ): Promise<FunnelAnalysis> {
    const { data, error } = await this.admin.rpc("get_funnel_analysis", {
      p_event_names: eventNames,
      p_start_date: startDate,
      p_end_date: endDate,
      p_window_hours: 168,
    });

    if (error) throw new Error(`Funnel analysis failed: ${error.message}`);

    return {
      name: eventNames.join(" → "),
      steps: (data ?? []) as FunnelStep[],
    };
  }

  async getOnboardingFunnel(startDate: string, endDate: string): Promise<FunnelAnalysis> {
    const { data, error } = await this.admin.rpc("get_onboarding_funnel", {
      p_start_date: startDate,
      p_end_date: endDate,
    });
    if (error) throw new Error(`Onboarding funnel failed: ${error.message}`);
    return { name: "Onboarding", steps: (data ?? []) as FunnelStep[] };
  }

  async getDatingFunnel(startDate: string, endDate: string): Promise<FunnelAnalysis> {
    const { data, error } = await this.admin.rpc("get_dating_funnel", {
      p_start_date: startDate,
      p_end_date: endDate,
    });
    if (error) throw new Error(`Dating funnel failed: ${error.message}`);
    return { name: "Dating", steps: (data ?? []) as FunnelStep[] };
  }

  async getContentFunnel(startDate: string, endDate: string): Promise<FunnelAnalysis> {
    const { data, error } = await this.admin.rpc("get_content_funnel", {
      p_start_date: startDate,
      p_end_date: endDate,
    });
    if (error) throw new Error(`Content funnel failed: ${error.message}`);
    return { name: "Content", steps: (data ?? []) as FunnelStep[] };
  }

  async getPremiumFunnel(startDate: string, endDate: string): Promise<FunnelAnalysis> {
    const { data, error } = await this.admin.rpc("get_premium_funnel", {
      p_start_date: startDate,
      p_end_date: endDate,
    });
    if (error) throw new Error(`Premium funnel failed: ${error.message}`);
    return { name: "Premium", steps: (data ?? []) as FunnelStep[] };
  }
}
