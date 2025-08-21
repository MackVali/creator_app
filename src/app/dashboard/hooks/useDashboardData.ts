import { useState, useEffect } from "react";

// Types matching the loader return values
export interface UserStats {
  level: number;
  xp_current: number;
  xp_max: number;
}

export interface MonumentsSummary {
  Achievement: number;
  Legacy: number;
  Triumph: number;
  Pinnacle: number;
}

export interface Skill {
  skill_id: string;
  name: string;
  progress: number;
}

export interface Goal {
  goal_id: string;
  name: string;
  updated_at: string;
}

export interface SkillsAndGoals {
  skills: Skill[];
  goals: Goal[];
}

export interface DashboardData {
  userStats: UserStats;
  monuments: MonumentsSummary;
  skillsAndGoals: SkillsAndGoals;
}

export interface UseDashboardDataReturn {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDashboardData(): UseDashboardDataReturn {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/dashboard");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch dashboard data";
      setError(errorMessage);
      console.error("Dashboard data fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const refetch = async () => {
    await fetchData();
  };

  return {
    data,
    loading,
    error,
    refetch,
  };
}
