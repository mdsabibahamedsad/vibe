"use client";

import { useEffect, useState, useCallback } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { canSync, Permissions } from "@/lib/admin/permissions";
import { Loading, ErrorState } from "@/components/ui";

interface Experiment {
  id: string;
  name: string;
  description: string | null;
  owner: string;
  status: string;
  primary_metric: string;
  max_rollout_pct: number;
  kill_switch: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export default function AdminExperimentsPage() {
  const { user } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedExp, setSelectedExp] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
    running: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    paused: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  };

  const fetchExperiments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/analytics/experiments");
      const json = await res.json();
      if (json.success) setExperiments(json.data ?? []);
      else setError(json.error ?? "Failed to load experiments");
    } catch {
      setError("Failed to load experiments");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchResults = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/analytics/experiments?id=${id}&results=true`);
      const json = await res.json();
      if (json.success) setResults(json.data ?? []);
    } catch {
      setResults([]);
    }
  }, []);

  useEffect(() => {
    if (user && canSync(user.role, Permissions.ANALYTICS_VIEW)) {
      fetchExperiments();
    } else {
      setLoading(false);
    }
  }, [user, fetchExperiments]);

  useEffect(() => {
    if (selectedExp) fetchResults(selectedExp);
  }, [selectedExp, fetchResults]);

  if (!user || !canSync(user.role, Permissions.ANALYTICS_VIEW)) {
    return <div className="p-6 text-red-500">Access denied</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Experiments</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            A/B testing and experiment management
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
        >
          {showCreate ? "Cancel" : "New Experiment"}
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5">
          <CreateExperimentForm onCreated={() => { setShowCreate(false); fetchExperiments(); }} />
        </div>
      )}

      {loading ? (
        <Loading message="Loading experiments..." />
      ) : error ? (
        <ErrorState title="Error" message={error} onRetry={fetchExperiments} />
      ) : (
        <div className="space-y-6">
          {/* Experiments list */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Owner</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-500">Rollout</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {experiments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No experiments yet. Create your first A/B test.
                    </td>
                  </tr>
                )}
                {experiments.map((exp) => (
                  <tr
                    key={exp.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer ${
                      selectedExp === exp.id ? "bg-blue-50 dark:bg-blue-900/20" : ""
                    }`}
                    onClick={() => setSelectedExp(selectedExp === exp.id ? null : exp.id)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {exp.name}
                      {exp.description && <p className="text-xs text-gray-500 mt-0.5">{exp.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{exp.owner}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[exp.status] ?? ""}`}>
                        {exp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-gray-600 dark:text-gray-400">
                      {exp.max_rollout_pct}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium mr-3"
                      >
                        {exp.status === "running" ? "Pause" : exp.status === "draft" ? "Start" : "View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Experiment results */}
          {selectedExp && results.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Results</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Variant</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-500">Users</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-500">Primary Metric</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-500">Per User</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-500">Lift</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {results.map((r: any, i: number) => (
                    <tr key={i} className={r.is_control ? "bg-gray-50 dark:bg-gray-800/50" : ""}>
                      <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">
                        {r.variant_name}
                        {r.is_control && <span className="text-xs text-gray-400 ml-2">(control)</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{r.user_count}</td>
                      <td className="px-4 py-2 text-right font-mono">{r.primary_metric_value}</td>
                      <td className="px-4 py-2 text-right font-mono">{r.primary_metric_per_user}</td>
                      <td className={`px-4 py-2 text-right font-mono ${r.lift_vs_control > 0 ? "text-green-600" : r.lift_vs_control < 0 ? "text-red-600" : ""}`}>
                        {r.is_control ? "—" : `${r.lift_vs_control > 0 ? "+" : ""}${r.lift_vs_control}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateExperimentForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [primaryMetric, setPrimaryMetric] = useState("");

  const handleCreate = async () => {
    if (!name || !owner || !primaryMetric) return;
    const res = await fetch("/api/admin/analytics/experiments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, owner, primaryMetric }),
    });
    const json = await res.json();
    if (json.success) onCreated();
    else alert(json.error ?? "Failed to create");
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900 dark:text-white">Create Experiment</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" placeholder="Experiment name" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Owner</label>
          <input value={owner} onChange={(e) => setOwner(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" placeholder="Owner name" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" rows={2} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Primary Metric (event name)</label>
        <input value={primaryMetric} onChange={(e) => setPrimaryMetric(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" placeholder="e.g. payment_completed" />
      </div>
      <button onClick={handleCreate} className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
        Create Draft
      </button>
    </div>
  );
}
