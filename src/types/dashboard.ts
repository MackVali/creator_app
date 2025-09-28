export type UserStats = { level: number; xp_current: number; xp_max: number };
export type MonumentCounts = Record<
  "Achievement" | "Legacy" | "Triumph" | "Pinnacle",
  number
>;
export type SkillItem = {
  skill_id: string | number;
  cat_id: string;
  name: string;
  icon: string;
  level: number;
  progress: number;
};

export type CatItem = {
  cat_id: string;
  cat_name: string;
  user_id: string;
  skill_count: number;
  color_hex?: string | null;
  order?: number | null;
  emoji?: string | null;
  skills: SkillItem[];
};

export type GoalItem = {
  id: string;
  name: string;
  priority: "NO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "ULTRA-CRITICAL";
  energy: "NO" | "LOW" | "MEDIUM" | "HIGH" | "ULTRA" | "EXTREME";
  monument_id?: string | null;
  created_at: string;
  status?: string | null;
  active?: boolean | null;
  weight_snapshot?: number | null;
  weight?: number | null;
};

export type DashboardData = {
  userStats: UserStats;
  monuments: MonumentCounts;
  skillsAndGoals: {
    cats: CatItem[];
    goals: GoalItem[];
  };
};
