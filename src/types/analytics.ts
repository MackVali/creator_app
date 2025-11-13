export type AnalyticsRange = "7d" | "30d" | "90d";

export type AnalyticsKpiId =
  | "skill_xp"
  | "tasks"
  | "projects"
  | "monuments"
  | "windows"
  | "habits";

export type AnalyticsKpi = {
  id: AnalyticsKpiId;
  label: string;
  value: number;
  delta: number;
};

export type AnalyticsSkill = {
  id: string;
  name: string;
  level: number;
  progress: number;
  updatedAt: string | null;
  xpGained: number;
};

export type AnalyticsProject = {
  id: string;
  title: string;
  progress: number;
  tasksDone: number;
  tasksTotal: number;
  updatedAt: string | null;
};

export type AnalyticsMonument = {
  id: string;
  title: string;
  progress: number;
  goalCount: number;
};

export type AnalyticsScheduleCompletion = {
  id: string;
  title: string;
  type: "project" | "task" | "habit";
  completedAt: string;
  startUtc: string;
  endUtc: string;
  durationMinutes: number;
  energy: string | null;
};

export type AnalyticsActivityEvent = {
  id: string;
  label: string;
  date: string;
};

export type AnalyticsHabitStreakPoint = {
  label: string;
  value: number;
};

export type AnalyticsHabitRoutine = {
  id: string;
  name: string;
  heatmap: number[][];
};

export type AnalyticsHabitPerformance = {
  label: string;
  successRate: number;
};

export type AnalyticsHabitWeeklyReflection = {
  id: string;
  weekLabel: string;
  streak: number;
  bestDay: string;
  lesson: string;
  pinned: boolean;
  recommendation?: string;
};

export type AnalyticsHabitSummary = {
  currentStreak: number;
  longestStreak: number;
  calendarDays: number;
  calendarCompleted: number[];
  routines: AnalyticsHabitRoutine[];
  streakHistory: AnalyticsHabitStreakPoint[];
  bestTimes: AnalyticsHabitPerformance[];
  bestDays: AnalyticsHabitPerformance[];
  weeklyReflections: AnalyticsHabitWeeklyReflection[];
};

export type AnalyticsWindowsSummary = {
  heatmap: number[][];
  energy: { label: string; value: number }[];
};

export type AnalyticsResponse = {
  range: AnalyticsRange;
  generatedAt: string;
  kpis: AnalyticsKpi[];
  skills: AnalyticsSkill[];
  projects: AnalyticsProject[];
  monuments: AnalyticsMonument[];
  recentSchedules: AnalyticsScheduleCompletion[];
  windows: AnalyticsWindowsSummary;
  activity: AnalyticsActivityEvent[];
  habit: AnalyticsHabitSummary;
  projectVelocity: number[];
};
