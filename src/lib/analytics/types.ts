export type Kpi = {
  id:
    | "focus_hours"
    | "throughput"
    | "habit_consistency"
    | "skill_xp"
    | "energy_balance";
  label: string;
  value: number;
  delta: number;
  spark: number[];
  confidence?: "low" | "med" | "high";
  target?: [number, number];
  top?: string;
};

export type Insight = {
  id: string;
  text: string;
  why?: string;
  action: {
    type: "create_blocks" | "open_planner" | "filter";
    payload?: any;
  };
};

export type AnalyticsSummary = {
  period: {
    from: string;
    to: string;
    compareFrom?: string;
    compareTo?: string;
    compared: boolean;
  };
  kpis: Kpi[];
  insights: Insight[];
};
