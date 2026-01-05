import { NextRequest, NextResponse } from "next/server";
import type { AnalyticsSummary } from "@/lib/analytics/types";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const compare = url.searchParams.get("compare") === "true";

  // Mock data - in a real implementation, this would query the database
  const mockData: AnalyticsSummary = {
    period: {
      from: from || "2026-01-01",
      to: to || "2026-01-30",
      compared: compare,
      compareFrom: compare ? "2025-12-02" : undefined,
      compareTo: compare ? "2025-12-31" : undefined,
    },
    kpis: [
      {
        id: "focus_hours",
        label: "Focus Hours",
        value: 18.5,
        delta: 12.3,
        spark: [2, 3, 1, 4, 5, 3, 0],
        confidence: "high",
      },
      {
        id: "throughput",
        label: "Throughput/day",
        value: 0.8,
        delta: -0.2,
        spark: [1, 0, 0, 1, 0, 0, 0],
        confidence: "med",
      },
      {
        id: "habit_consistency",
        label: "Habit Consistency",
        value: 0.64,
        delta: 0.12,
        spark: [0.4, 0.5, 0.7, 0.6],
        confidence: "high",
      },
      {
        id: "skill_xp",
        label: "Skill XP",
        value: 58,
        delta: 9,
        spark: [6, 10, 12, 30],
        top: "Mind",
      },
      {
        id: "energy_balance",
        label: "High/Extreme Share",
        value: 0.34,
        delta: -0.06,
        spark: [0.5, 0.42, 0.38, 0.34],
        target: [0.4, 0.6],
      },
    ],
    insights: [
      {
        id: "add_early_blocks",
        text: "Best output on Wed AM. Add 3 early focus blocks.",
        why: "Based on last 6 weeks",
        action: {
          type: "create_blocks",
          payload: { count: 3, slot: "early" },
        },
      },
    ],
  };

  return NextResponse.json(mockData);
}
