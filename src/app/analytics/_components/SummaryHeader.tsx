"use client";

import { useEffect, useState } from "react";
import { KpiTile } from "./KpiTile";
import { InsightChip } from "./InsightChip";
import type { AnalyticsSummary } from "@/lib/analytics/types";

interface SummaryHeaderProps {
  onDrilldown?: (kpiId: string) => void;
}

export function SummaryHeader({ onDrilldown }: SummaryHeaderProps) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [compare, setCompare] = useState(false);

  useEffect(() => {
    const loadSummary = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("compare", compare.toString());
        // In a real implementation, set from/to dates
        params.set("from", "2026-01-01");
        params.set("to", "2026-01-30");

        const response = await fetch(`/api/analytics/summary?${params}`);
        if (response.ok) {
          const data = await response.json();
          setSummary(data);
        }
      } catch (error) {
        console.error("Failed to load summary", error);
      } finally {
        setLoading(false);
      }
    };

    loadSummary();
  }, [compare]);

  const handleKpiClick = (kpiId: string) => {
    onDrilldown?.(kpiId);
    // Placeholder for side panel
    console.log("Open drilldown for", kpiId);
  };

  const handleInsightAction = (insightId: string) => {
    console.log("Action for insight", insightId);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 md:gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-950/80 to-black/60"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-2xl border border-red-900/50 bg-red-950/20 p-4 text-red-200">
        Failed to load summary data.
      </div>
    );
  }

  return (
    <div className="space-y-6" id="summary">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Summary</h2>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => setCompare(e.target.checked)}
            className="rounded border-zinc-700 bg-zinc-900 text-zinc-200 focus:ring-zinc-600"
          />
          Compare to previous period
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 md:gap-4">
        {summary.kpis.map((kpi) => (
          <KpiTile
            key={kpi.id}
            {...kpi}
            onOpen={() => handleKpiClick(kpi.id)}
          />
        ))}
      </div>

      {summary.insights.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {summary.insights.slice(0, 3).map((insight) => (
            <InsightChip
              key={insight.id}
              {...insight}
              onAction={() => handleInsightAction(insight.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
