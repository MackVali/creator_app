export type UserStats = { level: number; xp_current: number; xp_max: number };
export type MonumentCounts = Record<
  "Achievement" | "Legacy" | "Triumph" | "Pinnacle",
  number
>;
export type SkillItem = {
  skill_id: string | number;
  name: string;
  icon: string;
  level: number;
  progress: number;
};

export type CatItem = {
  cat_id: string;
  cat_name: string;
  skill_count: number;
  skills: SkillItem[];
};
export type GoalItem = {
  goal_id: string | number;
  name: string;
  updated_at?: string;
};

export type DashboardData = {
  userStats: UserStats;
  monuments: MonumentCounts;
  skillsAndGoals: {
    cats: CatItem[];
    goals: GoalItem[];
  };
};
