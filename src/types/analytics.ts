export type AnalyticsRange = "1d" | "7d" | "30d" | "90d";

export type AnalyticsView =
  | "overview"
  | "execution"
  | "schedule"
  | "identity"
  | "habits"
  | "system-health";

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

export type AnalyticsScheduleSummary = {
  plannedEvents: number;
  completedEvents: number;
  missedEvents: number;
  scheduledEvents: number;
  executionRate: number;
  pastEvents: number;
  completedPastEvents: number;
  upcomingScheduledEvents: number;
  assignedExecutionRate: number;
  missedRate: number;
  completedMinutes: number;
  missedMinutes: number;
  byType: Array<{
    type: "project" | "task" | "habit" | "unknown";
    planned: number;
    completed: number;
    missed: number;
    minutes: number;
  }>;
};

export type AnalyticsTodaySummary = {
  dayStartUtc: string;
  dayEndUtc: string;
  plannedEvents: number;
  completedEvents: number;
  missedEvents: number;
  scheduledEvents: number;
  executionRate: number;
  completedMinutes: number;
  remainingScheduledEvents: number;
  byType: Array<{
    type: "project" | "task" | "habit" | "unknown";
    planned: number;
    completed: number;
    missed: number;
    scheduled: number;
  }>;
};

export type AnalyticsOverviewDailyPoint = {
  date: string;
  xpGained: number;
  projectXp: number;
  habitXp: number;
  taskXp: number;
  completedEvents: number;
  completedProjects: number;
  completedHabits: number;
  completedTasks: number;
  scheduledEvents: number;
  missedEvents: number;
  usableWindowMinutes: number;
  completedMinutes: number;
  efficiencyRate: number;
};

export type AnalyticsOverviewEfficiencyDebugSource = {
  sourceKind: "window" | "time_block" | "day_type_time_block";
  sourceId: string;
  label: string;
  startLocal: string | null;
  endLocal: string | null;
  minutesAfterClipping: number;
};

export type AnalyticsOverviewEfficiencyDebugExcludedSource = {
  sourceKind: "window" | "time_block" | "day_type_time_block";
  sourceId: string;
  label: string;
  reason: string;
};

export type AnalyticsOverviewEfficiencyDebugDay = {
  dayKey: string;
  dayStartUtc: string;
  dayEndUtc: string;
  assignedDayTypeId: string | null;
  capacitySource:
    | "assigned_day_type"
    | "default_day_type"
    | "general_windows"
    | "fallback";
  completedMinutes: number;
  usableWindowMinutes: number;
  mergedIntervalCount: number;
  intervalsBeforeMergeCount: number;
  includedSources: AnalyticsOverviewEfficiencyDebugSource[];
  excludedSources: AnalyticsOverviewEfficiencyDebugExcludedSource[];
};

export type AnalyticsOverviewEfficiencyDebug = {
  selectedRange: AnalyticsRange;
  startIso: string;
  endIso: string;
  totalCompletedMinutes: number;
  totalUsableWindowMinutes: number;
  rangeEfficiencyRate: number;
  perDay: AnalyticsOverviewEfficiencyDebugDay[];
};

export type AnalyticsTimeBlockPerformance = {
  id: string;
  label: string;
  startLocal: string | null;
  endLocal: string | null;
  plannedEvents: number;
  completedEvents: number;
  scheduledEvents: number;
  missedEvents: number;
  completionRate: number;
  missedRate: number;
  totalMinutes: number;
  completedMinutes: number;
};

export type AnalyticsUnscheduledPressure = {
  blocks: number;
  minutes: number;
  habits: Array<{
    id: string;
    name: string;
    durationMinutes: number;
  }>;
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
  scheduleSummary: AnalyticsScheduleSummary;
  timeBlockPerformance: AnalyticsTimeBlockPerformance[];
  unscheduledPressure: AnalyticsUnscheduledPressure;
  todaySummary: AnalyticsTodaySummary;
  overviewDaily: AnalyticsOverviewDailyPoint[];
  windows: AnalyticsWindowsSummary;
  activity: AnalyticsActivityEvent[];
  habit: AnalyticsHabitSummary;
  projectVelocity: number[];
  overviewEfficiencyDebug?: AnalyticsOverviewEfficiencyDebug;
};
