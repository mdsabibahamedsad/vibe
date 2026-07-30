import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export interface Experiment {
  id: string;
  name: string;
  description: string | null;
  owner: string;
  status: "draft" | "running" | "paused" | "completed" | "cancelled";
  hypothesis: string | null;
  primaryMetric: string;
  secondaryMetrics: string[];
  startDate: string | null;
  endDate: string | null;
  maxRolloutPct: number;
  minSampleSize: number;
  targetingRules: Record<string, unknown>;
  exclusionRules: string[];
  killSwitch: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExperimentVariant {
  id: string;
  experimentId: string;
  name: string;
  description: string | null;
  trafficPct: number;
  config: Record<string, unknown>;
  isControl: boolean;
}

export interface ExperimentAssignment {
  id: string;
  experimentId: string;
  variantId: string;
  userId: string;
  assignedAt: string;
}

export interface ExperimentResult {
  variantName: string;
  isControl: boolean;
  userCount: number;
  primaryMetricValue: number;
  primaryMetricPerUser: number;
  liftVsControl: number;
  confidence: number | null;
}

export class ExperimentService {
  private admin;

  constructor() {
    this.admin = createAdminClient();
  }

  async getExperiments(status?: string): Promise<Experiment[]> {
    let query = this.admin.from("experiments").select("*").order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch experiments: ${error.message}`);
    return (data ?? []) as Experiment[];
  }

  async getExperiment(id: string): Promise<Experiment | null> {
    const { data, error } = await this.admin
      .from("experiments")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return null;
    return data as Experiment;
  }

  async createExperiment(params: {
    name: string;
    description?: string;
    owner: string;
    hypothesis?: string;
    primaryMetric: string;
    secondaryMetrics?: string[];
    maxRolloutPct?: number;
    minSampleSize?: number;
    targetingRules?: Record<string, unknown>;
  }): Promise<string> {
    const { data, error } = await this.admin
      .from("experiments")
      .insert({
        name: params.name,
        description: params.description,
        owner: params.owner,
        hypothesis: params.hypothesis,
        primary_metric: params.primaryMetric,
        secondary_metrics: params.secondaryMetrics ?? [],
        max_rollout_pct: params.maxRolloutPct ?? 100,
        min_sample_size: params.minSampleSize ?? 1000,
        targeting_rules: params.targetingRules ?? {},
        status: "draft",
      })
      .select("id")
      .single();

    if (error) throw new Error(`Failed to create experiment: ${error.message}`);
    return data.id;
  }

  async updateExperimentStatus(id: string, status: Experiment["status"]): Promise<void> {
    const updates: Record<string, unknown> = { status };

    if (status === "running") {
      updates.start_date = new Date().toISOString();
    }
    if (status === "completed") {
      updates.end_date = new Date().toISOString();
    }

    const { error } = await this.admin
      .from("experiments")
      .update(updates)
      .eq("id", id);

    if (error) throw new Error(`Failed to update experiment: ${error.message}`);
  }

  async toggleKillSwitch(id: string, kill: boolean): Promise<void> {
    const { error } = await this.admin
      .from("experiments")
      .update({ kill_switch: kill, status: kill ? "paused" : "running" })
      .eq("id", id);

    if (error) throw new Error(`Failed to toggle kill switch: ${error.message}`);
  }

  async getVariants(experimentId: string): Promise<ExperimentVariant[]> {
    const { data, error } = await this.admin
      .from("experiment_variants")
      .select("*")
      .eq("experiment_id", experimentId)
      .order("created_at");

    if (error) throw new Error(`Failed to fetch variants: ${error.message}`);
    return (data ?? []) as ExperimentVariant[];
  }

  async createVariant(params: {
    experimentId: string;
    name: string;
    description?: string;
    trafficPct: number;
    config?: Record<string, unknown>;
    isControl?: boolean;
  }): Promise<string> {
    const { data, error } = await this.admin
      .from("experiment_variants")
      .insert({
        experiment_id: params.experimentId,
        name: params.name,
        description: params.description,
        traffic_pct: params.trafficPct,
        config: params.config ?? {},
        is_control: params.isControl ?? false,
      })
      .select("id")
      .single();

    if (error) throw new Error(`Failed to create variant: ${error.message}`);
    return data.id;
  }

  async assignUser(experimentId: string, userId: string): Promise<string | null> {
    const { data, error } = await this.admin.rpc("assign_experiment_variant", {
      p_experiment_id: experimentId,
      p_user_id: userId,
    });

    if (error) throw new Error(`Failed to assign user: ${error.message}`);
    return data as string | null;
  }

  async getUserAssignment(experimentId: string, userId: string): Promise<ExperimentVariant | null> {
    const { data, error } = await this.admin
      .from("experiment_assignments")
      .select("variant_id, experiment_variants(*)")
      .eq("experiment_id", experimentId)
      .eq("user_id", userId)
      .single();

    if (error || !data) return null;
    return (data as any).experiment_variants as ExperimentVariant;
  }

  async trackEvent(
    experimentId: string,
    variantId: string,
    userId: string,
    eventName: string,
    eventValue?: number,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.admin
      .from("experiment_events")
      .insert({
        experiment_id: experimentId,
        variant_id: variantId,
        user_id: userId,
        event_name: eventName,
        event_value: eventValue,
        metadata: metadata ?? {},
      });

    if (error) {
      logger.warn("Failed to track experiment event", { error: error.message });
    }
  }

  async getResults(experimentId: string): Promise<ExperimentResult[]> {
    const { data, error } = await this.admin.rpc("get_experiment_results", {
      p_experiment_id: experimentId,
    });

    if (error) throw new Error(`Failed to get experiment results: ${error.message}`);
    return (data ?? []) as ExperimentResult[];
  }
}
