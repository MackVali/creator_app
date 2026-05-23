"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type PointerEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CalendarDays,
  CheckSquare,
  FolderKanban,
  Flame,
  Info,
} from "lucide-react";
import type {
  AnalyticsOverviewComparison,
  AnalyticsOverviewComparisonMetric,
  AnalyticsOverviewDailyPoint,
  AnalyticsRange,
  AnalyticsResponse,
  AnalyticsHabitSummary,
  AnalyticsHabitRoutine,
  AnalyticsHabitPerformance,
  AnalyticsHabitStreakPoint,
  AnalyticsHabitWeeklyReflection,
  AnalyticsScheduleCompletion,
  AnalyticsSkillCategoryContribution,
  AnalyticsSkillCategoryContributionMeta,
  AnalyticsView,
} from "@/types/analytics";

const SCHEDULE_ICON_MAP: Record<
  AnalyticsScheduleCompletion["type"],
  ComponentType<{ className?: string }>
> = {
  project: FolderKanban,
  task: CheckSquare,
  habit: Flame,
};

const SCHEDULE_BADGE_STYLES: Record<
  AnalyticsScheduleCompletion["type"],
  string
> = {
  project: "border-sky-400/40 text-sky-100",
  task: "border-emerald-400/40 text-emerald-100",
  habit: "border-orange-400/40 text-orange-100",
};

function classNames(
  ...classes: (string | boolean | null | undefined)[]
): string {
  return classes.filter(Boolean).join(" ");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeHabitSummary(summary: unknown): AnalyticsHabitSummary {
  const base: AnalyticsHabitSummary = {
    currentStreak: 0,
    longestStreak: 0,
    calendarDays: 28,
    calendarCompleted: [],
    routines: [],
    streakHistory: [],
    bestTimes: [],
    bestDays: [],
    weeklyReflections: [],
  };

  if (!summary || typeof summary !== "object") {
    return base;
  }

  const record = summary as Record<string, unknown>;

  const toNonNegativeInt = (value: unknown, fallback: number): number => {
    if (!isFiniteNumber(value)) {
      return fallback;
    }
    const rounded = Math.round(value);
    return rounded >= 0 ? rounded : fallback;
  };

  const toPositiveInt = (value: unknown, fallback: number): number => {
    if (!isFiniteNumber(value)) {
      return fallback;
    }
    const rounded = Math.round(value);
    return rounded > 0 ? rounded : fallback;
  };

  const toPerformanceList = (value: unknown): AnalyticsHabitPerformance[] => {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const entry = item as Record<string, unknown>;
        const label = typeof entry.label === "string" ? entry.label : null;
        const successRate = isFiniteNumber(entry.successRate)
          ? Math.max(0, Math.min(entry.successRate, 100))
          : null;

        if (label == null || successRate == null) {
          return null;
        }

        return { label, successRate } satisfies AnalyticsHabitPerformance;
      })
      .filter((item): item is AnalyticsHabitPerformance => item !== null);
  };

  const calendarDays = toPositiveInt(record.calendarDays, base.calendarDays);

  const calendarCompleted = Array.isArray(record.calendarCompleted)
    ? record.calendarCompleted
        .map((value) => (isFiniteNumber(value) ? Math.round(value) : null))
        .filter(
          (value): value is number =>
            value != null && value >= 1 && value <= calendarDays
        )
    : base.calendarCompleted;

  const routines = Array.isArray(record.routines)
    ? record.routines
        .map((item, index) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const routineRecord = item as Record<string, unknown>;
          const rawHeatmap = routineRecord.heatmap;
          const heatmap = Array.isArray(rawHeatmap)
            ? rawHeatmap.map((week) =>
                Array.isArray(week)
                  ? week.map((value) => (isFiniteNumber(value) ? value : 0))
                  : Array(7).fill(0)
              )
            : [];

          const id =
            typeof routineRecord.id === "string"
              ? routineRecord.id
              : `routine-${index}`;
          const name =
            typeof routineRecord.name === "string"
              ? routineRecord.name
              : `Routine ${index + 1}`;

          return { id, name, heatmap } satisfies AnalyticsHabitRoutine;
        })
        .filter((routine): routine is AnalyticsHabitRoutine => routine !== null)
    : base.routines;

  const streakHistory = Array.isArray(record.streakHistory)
    ? record.streakHistory
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const point = item as Record<string, unknown>;
          const label = typeof point.label === "string" ? point.label : null;
          const value = isFiniteNumber(point.value) ? point.value : null;

          if (label == null || value == null) {
            return null;
          }

          return { label, value } satisfies AnalyticsHabitStreakPoint;
        })
        .filter((point): point is AnalyticsHabitStreakPoint => point !== null)
    : base.streakHistory;

  const weeklyReflections = Array.isArray(record.weeklyReflections)
    ? record.weeklyReflections
        .reduce<AnalyticsHabitWeeklyReflection[]>((acc, item, index) => {
          if (!item || typeof item !== "object") {
            return acc;
          }

          const reflection = item as Record<string, unknown>;
          const id =
            typeof reflection.id === "string"
              ? reflection.id
              : `reflection-${index}`;
          const weekLabel =
            typeof reflection.weekLabel === "string"
              ? reflection.weekLabel
              : `Week ${index + 1}`;
          const streak = isFiniteNumber(reflection.streak)
            ? Math.max(0, Math.round(reflection.streak))
            : 0;
          const bestDay =
            typeof reflection.bestDay === "string"
              ? reflection.bestDay
              : "N/A";
          const lesson =
            typeof reflection.lesson === "string"
              ? reflection.lesson
              : "Keep logging habits to uncover insights.";
          const pinned =
            typeof reflection.pinned === "boolean" ? reflection.pinned : false;
          const recommendation =
            typeof reflection.recommendation === "string"
              ? reflection.recommendation
              : undefined;

          acc.push({
            id,
            weekLabel,
            streak,
            bestDay,
            lesson,
            pinned,
            recommendation,
          } satisfies AnalyticsHabitWeeklyReflection);
          return acc;
        }, [])
    : base.weeklyReflections;

  return {
    currentStreak: toNonNegativeInt(record.currentStreak, base.currentStreak),
    longestStreak: toNonNegativeInt(record.longestStreak, base.longestStreak),
    calendarDays,
    calendarCompleted,
    routines,
    streakHistory,
    bestTimes: toPerformanceList(record.bestTimes),
    bestDays: toPerformanceList(record.bestDays),
    weeklyReflections,
  };
}

interface Project {
  id: string;
  title: string;
  progress: number;
  tasksDone: number;
  tasksTotal: number;
}

const ANALYTICS_TABS: Array<{ id: AnalyticsView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "execution", label: "Execution" },
  { id: "schedule", label: "Schedule" },
  { id: "identity", label: "Identity" },
  { id: "habits", label: "Habits" },
  { id: "system-health", label: "System Health" },
];

const ANALYTICS_RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "1d", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
];

async function fetchAnalyticsRange(
  range: AnalyticsRange,
  signal: AbortSignal
): Promise<AnalyticsResponse> {
  const response = await fetch(`/api/analytics?range=${range}`, {
    credentials: "include",
    signal,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("unauthorized");
    }

    if (response.status === 403) {
      throw new Error("upgrade_required");
    }

    throw new Error("fetch_failed");
  }

  return (await response.json()) as AnalyticsResponse;
}

export default function AnalyticsDashboard({
  activeView,
  onViewChange,
}: {
  activeView: AnalyticsView;
  onViewChange: (view: AnalyticsView) => void;
}) {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyticsRefreshing, setAnalyticsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<AnalyticsRange>("30d");
  const [analyticsCache, setAnalyticsCache] = useState<
    Partial<Record<AnalyticsRange, AnalyticsResponse>>
  >({});
  const previousViewRef = useRef<AnalyticsView>(activeView);
  const analyticsRequestIdRef = useRef(0);
  const analyticsAbortRef = useRef<AbortController | null>(null);
  const analyticsRef = useRef<AnalyticsResponse | null>(null);
  const analyticsCacheRef = useRef<
    Partial<Record<AnalyticsRange, AnalyticsResponse>>
  >({});
  const [slideDirection, setSlideDirection] = useState(1);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    analyticsRef.current = analytics;
  }, [analytics]);

  useEffect(() => {
    analyticsCacheRef.current = analyticsCache;
  }, [analyticsCache]);

  useEffect(() => {
    const cachedAnalytics = analyticsCacheRef.current[selectedRange] ?? null;
    const hasVisibleAnalytics = analyticsRef.current !== null;

    if (cachedAnalytics) {
      setAnalytics(cachedAnalytics);
      setError(null);
      setLoading(false);
      setAnalyticsRefreshing(false);
      return;
    }

    analyticsAbortRef.current?.abort();
    const controller = new AbortController();
    analyticsAbortRef.current = controller;
    const requestId = analyticsRequestIdRef.current + 1;
    analyticsRequestIdRef.current = requestId;

    setError(null);
    setLoading(!hasVisibleAnalytics);
    setAnalyticsRefreshing(hasVisibleAnalytics);

    const load = async () => {
      try {
        const payload = await fetchAnalyticsRange(selectedRange, controller.signal);
        if (
          controller.signal.aborted ||
          analyticsRequestIdRef.current !== requestId
        ) {
          return;
        }

        setAnalyticsCache((current) => ({ ...current, [selectedRange]: payload }));
        setAnalytics(payload);
        setError(null);
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return;
        }
        const errorMessage = err instanceof Error ? err.message : "fetch_failed";

        if (errorMessage === "upgrade_required") {
          setError("upgrade_required");
          return;
        }

        const message =
          errorMessage === "unauthorized"
            ? "Sign in to view analytics."
            : hasVisibleAnalytics
              ? "Unable to update analytics."
              : "Unable to load analytics data.";
        console.error("Failed to load analytics data", err);
        setError(message);
      } finally {
        if (analyticsRequestIdRef.current === requestId) {
          setLoading(false);
          setAnalyticsRefreshing(false);
        }
      }
    };

    void load();

    return () => {
      controller.abort();
      if (analyticsAbortRef.current === controller) {
        analyticsAbortRef.current = null;
      }
    };
  }, [selectedRange]);

  useEffect(() => {
    const previousIndex = ANALYTICS_TABS.findIndex(
      (tab) => tab.id === previousViewRef.current
    );
    const nextIndex = ANALYTICS_TABS.findIndex((tab) => tab.id === activeView);

    if (previousIndex !== -1 && nextIndex !== -1 && previousIndex !== nextIndex) {
      setSlideDirection(nextIndex > previousIndex ? 1 : -1);
    }

    previousViewRef.current = activeView;
  }, [activeView]);

  const projects = analytics?.projects ?? [];
  const skillCategoryContribution = analytics?.skillCategoryContribution ?? [];
  const skillCategoryContributionMeta =
    analytics?.skillCategoryContributionMeta ?? null;
  const habitSummary = normalizeHabitSummary(analytics?.habit);
  const recentSchedules = analytics?.recentSchedules ?? [];
  const scheduleSummary = analytics?.scheduleSummary;
  const overviewTrend = analytics?.overviewDaily ?? [];
  const hasAnalyticsData = analytics !== null;

  const longestStreak = habitSummary.longestStreak;
  const currentStreak = habitSummary.currentStreak;
  const routineTrends = habitSummary.routines;
  const streakHistory = habitSummary.streakHistory;
  const activeTabLabel =
    ANALYTICS_TABS.find((tab) => tab.id === activeView)?.label ?? "Analytics";
  const handleUpgrade = () => {
    router.push("/settings/billing");
  };
  const renderErrorState = () =>
    error === "upgrade_required" ? (
      <AnalyticsPaywallState onUpgrade={handleUpgrade} />
    ) : error ? (
      <ErrorState message={error} />
    ) : null;

  let activeContent: ReactNode = null;

  if (!loading && error === "upgrade_required") {
    activeContent = <AnalyticsPaywallState onUpgrade={handleUpgrade} />;
  } else if (activeView === "overview") {
    activeContent = (
      <div className="space-y-4 xl:space-y-5">
        <SectionCard className="rounded-[24px] border-zinc-800/90 bg-[radial-gradient(circle_at_top_left,rgba(63,63,70,0.18),transparent_34%),linear-gradient(145deg,rgba(9,9,11,0.96),rgba(24,24,27,0.88))] p-4 shadow-[0_22px_54px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.04)] sm:rounded-[28px] sm:p-5 lg:p-6">
          {!hasAnalyticsData && loading ? (
            <Skeleton className="h-64" />
          ) : !hasAnalyticsData && error ? (
            renderErrorState()
          ) : overviewTrend.length === 0 ? (
            <div
              className={classNames(
                "transition-opacity duration-200",
                analyticsRefreshing && "opacity-80"
              )}
            >
              <OverviewPanelStatus
                isRefreshing={analyticsRefreshing}
                message={error}
              />
              <EmptyCopy copy="No execution trend data in this range yet." />
            </div>
          ) : (
            <OverviewDiagnosticsSection
              points={overviewTrend}
              comparison={analytics?.overviewComparison}
              range={analytics?.range ?? selectedRange}
              selectedRange={selectedRange}
              isRefreshing={analyticsRefreshing}
              statusMessage={error}
            />
          )}
        </SectionCard>
      </div>
    );
  } else if (activeView === "execution") {
    activeContent = (
      <div className="space-y-4 xl:space-y-6">
        <SectionCard title="Skill Contribution">
          {loading ? (
            <Skeleton className="h-72" />
          ) : error ? (
            renderErrorState()
          ) : (
            <SkillContributionDashboard
              range={selectedRange}
              categories={skillCategoryContribution}
              meta={skillCategoryContributionMeta}
            />
          )}
        </SectionCard>
        <SectionCard
          title="Recently completed"
          description="Latest completed events."
        >
          {loading ? (
            <Skeleton className="h-40" />
          ) : error ? (
            renderErrorState()
          ) : recentSchedules.length === 0 ? (
            <EmptyCopy copy="No completed events in this range." />
          ) : (
            <RecentScheduleShowcase items={recentSchedules} />
          )}
        </SectionCard>
      </div>
    );
  } else if (activeView === "schedule") {
    activeContent = (
      <div className="space-y-4 xl:space-y-6">
        <SectionCard
          title="Event status"
          description="Observed scheduled events in the selected range."
        >
          {loading ? (
            <Skeleton className="h-44" />
          ) : error ? (
            renderErrorState()
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile
                  label="Planned events"
                  value={`${scheduleSummary?.plannedEvents ?? 0}`}
                />
                <StatTile
                  label="Completed events"
                  value={`${scheduleSummary?.completedEvents ?? 0}`}
                />
                <StatTile
                  label="Scheduled events"
                  value={`${scheduleSummary?.scheduledEvents ?? 0}`}
                />
                <StatTile
                  label="Missed events"
                  value={`${scheduleSummary?.missedEvents ?? 0}`}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <StatTile
                  label="Projects"
                  value={`${
                    scheduleSummary?.byType.find((entry) => entry.type === "project")
                      ?.planned ?? 0
                  }`}
                />
                <StatTile
                  label="Tasks"
                  value={`${
                    scheduleSummary?.byType.find((entry) => entry.type === "task")
                      ?.planned ?? 0
                  }`}
                />
                <StatTile
                  label="Habits"
                  value={`${
                    scheduleSummary?.byType.find((entry) => entry.type === "habit")
                      ?.planned ?? 0
                  }`}
                />
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    );
  } else if (activeView === "identity") {
    activeContent = (
      <div className="space-y-4 xl:space-y-6">
        <SectionCard
          title="Projects"
          description="Projects currently contributing to identity progress."
        >
          {loading ? (
            <Skeleton className="h-40" />
          ) : error ? (
            renderErrorState()
          ) : projects.length === 0 ? (
            <EmptyCopy copy="No project identity data in this range." />
          ) : (
            <div className="space-y-3">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    );
  } else if (activeView === "habits") {
    activeContent = (
      <div className="space-y-4 xl:space-y-6">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] xl:gap-6">
          <DailyConsistencyCard summary={habitSummary} />
          <StreakTrendCard
            currentStreak={currentStreak}
            longestStreak={longestStreak}
            history={streakHistory}
          />
        </div>

        <SectionCard
          title="Routine heatmaps"
          description="Consistency patterns by routine."
        >
          {loading ? (
            <Skeleton className="h-40" />
          ) : error ? (
            renderErrorState()
          ) : (
            <RoutineHeatmap routines={routineTrends} />
          )}
        </SectionCard>
      </div>
    );
  } else if (activeView === "system-health") {
    activeContent = (
      <SectionCard
        title="System health"
        description="This section is being rebuilt from trustworthy analytics data."
      >
        <DataNotice copy="System health analytics are being rebuilt from trustworthy analytics data." />
      </SectionCard>
    );
  }

  return (
    <div className="relative overflow-hidden text-[#E6E6EB]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[-35%] h-[420px] bg-[radial-gradient(circle_at_top,rgba(120,120,120,0.18),transparent_68%)] blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl space-y-4 pb-6 sm:space-y-8 sm:pb-8">
        <Header
          activeView={activeView}
          onViewChange={onViewChange}
          selectedRange={selectedRange}
          onRangeChange={setSelectedRange}
          isRefreshing={analyticsRefreshing}
        />
        <section
          aria-label={`${activeTabLabel} analytics`}
          className="relative overflow-hidden rounded-[20px] border border-zinc-900/80 bg-zinc-950/35 p-0.5 min-[480px]:p-1.5 sm:rounded-[26px]"
        >
          <AnimatePresence custom={slideDirection} initial={false} mode="wait">
            <motion.div
              key={activeView}
              custom={slideDirection}
              initial={
                prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: slideDirection * 24 }
              }
              animate={{ opacity: 1, x: 0 }}
              exit={
                prefersReducedMotion
                  ? { opacity: 1 }
                  : { opacity: 0, x: slideDirection * -24 }
              }
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
              }
              className="motion-reduce:transform-none"
            >
              {activeContent}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}

function Header({
  activeView,
  onViewChange,
  selectedRange,
  onRangeChange,
  isRefreshing,
}: {
  activeView: AnalyticsView;
  onViewChange: (view: AnalyticsView) => void;
  selectedRange: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  isRefreshing: boolean;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-2 z-20 mb-3 -mx-1 rounded-2xl border border-zinc-800/90 bg-black/72 px-2 py-2 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:static sm:mx-0 sm:mb-5 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none sm:backdrop-blur-none">
      <div className="flex min-w-0 flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            aria-label="Back to dashboard"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-800/90 bg-zinc-950/80 text-zinc-300 transition hover:border-zinc-700 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600 sm:h-9 sm:w-9 sm:bg-zinc-950"
          >
            <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
          <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:flex lg:justify-center">
            <div className="w-max min-w-full pr-1 lg:min-w-0 lg:pr-0">
              <AnalyticsTabs activeView={activeView} onViewChange={onViewChange} />
            </div>
          </div>
        </div>
        <div className="flex min-w-0 justify-end">
          <AnalyticsRangeSelector
            selectedRange={selectedRange}
            onRangeChange={onRangeChange}
            isRefreshing={isRefreshing}
          />
        </div>
      </div>
    </header>
  );
}

function formatAnalyticsRangeLabel(range: AnalyticsRange) {
  return (
    ANALYTICS_RANGE_OPTIONS.find((option) => option.value === range)?.label ??
    range.toUpperCase()
  );
}

function AnalyticsTabs({
  activeView,
  onViewChange,
}: {
  activeView: AnalyticsView;
  onViewChange: (view: AnalyticsView) => void;
}) {
  return (
    <div className="inline-flex min-w-max items-center gap-0.5 rounded-full border border-zinc-800/90 bg-zinc-950/70 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:gap-1 sm:rounded-xl sm:bg-zinc-950/80">
      {ANALYTICS_TABS.map((tab) => {
        const isActive = activeView === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onViewChange(tab.id)}
            aria-pressed={isActive}
            className={classNames(
              "relative h-6 shrink-0 rounded-full px-2.5 text-[11px] font-medium leading-none text-zinc-400 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/35 motion-reduce:transition-none sm:h-8 sm:rounded-lg sm:px-3.5 sm:text-xs",
              isActive
                ? "bg-zinc-100 text-zinc-950 shadow-[0_8px_18px_rgba(0,0,0,0.24),inset_0_0_0_1px_rgba(255,255,255,0.7)]"
                : "hover:bg-zinc-900/80 hover:text-zinc-100"
            )}
          >
            {tab.label}
            {isActive ? (
              <span className="absolute inset-x-3 -bottom-0.5 h-px rounded-full bg-emerald-300/55 sm:hidden" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

const CATEGORY_DONUT_COLORS = [
  "#c5c8ce",
  "#adb2ba",
  "#969ca6",
  "#7f8691",
  "#6b727d",
  "#575f6b",
  "#464e59",
  "#3a424d",
];

type VisibleSkillCategoryContribution =
  AnalyticsSkillCategoryContribution & {
    groupedCategories?: AnalyticsSkillCategoryContribution[];
  };

type SkillContributionSkill = AnalyticsSkillCategoryContribution["skills"][number];

type CategoryDonutSegment = {
  category: VisibleSkillCategoryContribution;
  color: string;
  endAngle: number;
  path: string;
  startAngle: number;
};

type CategoryDonutLabel = {
  anchorX: number;
  anchorY: number;
  connectorX: number;
  connectorY: number;
  elbowX: number;
  labelX: number;
  labelY: number;
  lineEndX: number;
  midAngle: number;
  preferredY: number;
  segment: CategoryDonutSegment;
  side: "left" | "right";
};

type CategoryDonutLabelSideConfig = {
  elbowX: number;
  labelX: number;
  lineEndX: number;
  maxY: number;
  minGap: number;
  minY: number;
};

const CATEGORY_DONUT_LABEL_TOP_PADDING = 38;
const CATEGORY_DONUT_LABEL_BOTTOM_PADDING = 342;
const CATEGORY_DONUT_LABEL_DESKTOP_ROW_GAP = 34;
const CATEGORY_DONUT_LABEL_MOBILE_ROW_GAP = 24;

const CATEGORY_DONUT_LABEL_CONFIG: Record<
  CategoryDonutLabel["side"],
  CategoryDonutLabelSideConfig
> = {
  left: {
    elbowX: 112,
    labelX: 106,
    lineEndX: 118,
    maxY: CATEGORY_DONUT_LABEL_BOTTOM_PADDING,
    minGap: CATEGORY_DONUT_LABEL_DESKTOP_ROW_GAP,
    minY: CATEGORY_DONUT_LABEL_TOP_PADDING,
  },
  right: {
    elbowX: 308,
    labelX: 314,
    lineEndX: 302,
    maxY: CATEGORY_DONUT_LABEL_BOTTOM_PADDING,
    minGap: CATEGORY_DONUT_LABEL_DESKTOP_ROW_GAP,
    minY: CATEGORY_DONUT_LABEL_TOP_PADDING,
  },
};

function SkillContributionDashboard({
  range,
  categories,
  meta,
}: {
  range: AnalyticsRange;
  categories: AnalyticsSkillCategoryContribution[];
  meta: AnalyticsSkillCategoryContributionMeta | null;
}) {
  const visibleCategories = useMemo(
    () => buildVisibleSkillCategories(categories),
    [categories]
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedCategoryId((current) =>
      current && visibleCategories.some((category) => category.categoryId === current)
        ? current
        : null
    );
  }, [visibleCategories]);

  const fallbackTotalXp = categories.reduce(
    (sum, category) => sum + category.xpGained,
    0
  );
  const rangeLabel = formatAnalyticsRangeLabel(range);
  const totalXp = meta?.totalXpGained ?? fallbackTotalXp;
  const xpComparison = getSkillXpComparison(meta, rangeLabel);
  const selectedCategory =
    visibleCategories.find((category) => category.categoryId === selectedCategoryId) ??
    null;
  const topCategory = getTopSkillCategory(categories);
  const topSkill = getTopSkillContribution(categories);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1 sm:gap-2">
        <TotalXpContributionChip
          label="TOTAL XP"
          value={`${formatCompactNumber(totalXp)} XP`}
          comparison={formatCompactSkillXpComparisonLabel(xpComparison.label)}
          comparisonTone={xpComparison.tone}
        />
        <ContributionChip
          label="TOP CATEGORY"
          value={
            topCategory
              ? formatContributionIconLabel(
                  topCategory.categoryIcon ?? null,
                  topCategory.categoryName
                )
              : "None yet"
          }
        />
        <ContributionChip
          label="TOP SKILL"
          value={
            topSkill
              ? formatContributionIconLabel(
                  normalizeSkillIcon(topSkill.skillIcon ?? null),
                  topSkill.skillName
                )
              : "None yet"
          }
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[390px_minmax(0,1fr)]">
        <CategoryDonut
          categories={visibleCategories}
          selectedCategoryId={selectedCategory?.categoryId ?? null}
          totalXp={totalXp}
          rangeLabel={rangeLabel}
          onSelectCategory={setSelectedCategoryId}
        />
        <SkillCategoryDetail
          category={selectedCategory}
          categories={visibleCategories}
          totalXp={totalXp}
          rangeLabel={rangeLabel}
        />
      </div>
    </div>
  );
}

function getTopSkillCategory(
  categories: AnalyticsSkillCategoryContribution[]
): AnalyticsSkillCategoryContribution | null {
  return categories.reduce<AnalyticsSkillCategoryContribution | null>(
    (topCategory, category) =>
      topCategory === null || category.xpGained > topCategory.xpGained
        ? category
        : topCategory,
    null
  );
}

function getTopSkillContribution(
  categories: AnalyticsSkillCategoryContribution[]
): SkillContributionSkill | null {
  return categories.reduce<SkillContributionSkill | null>((topSkill, category) => {
    return category.skills.reduce<SkillContributionSkill | null>((categoryTop, skill) => {
      if (skill.xpGained <= 0) {
        return categoryTop;
      }

      return categoryTop === null || skill.xpGained > categoryTop.xpGained
        ? skill
        : categoryTop;
    }, topSkill);
  }, null);
}

function getSkillXpComparison(
  meta: AnalyticsSkillCategoryContributionMeta | null,
  rangeLabel: string
): { label: string; tone: "up" | "down" | "neutral" } {
  if (!meta) {
    return { label: "No change vs previous", tone: "neutral" };
  }

  const currentTotal = meta.totalXpGained;
  const previousTotal = meta.previousTotalXpGained;

  if (previousTotal <= 0) {
    return currentTotal > 0
      ? { label: "New activity vs previous", tone: "up" }
      : { label: "No change vs previous", tone: "neutral" };
  }

  if (currentTotal <= 0) {
    return { label: "Down 100% vs previous", tone: "down" };
  }

  const percentChange =
    meta.totalXpPercentChange ??
    ((currentTotal - previousTotal) / previousTotal) * 100;

  if (percentChange === 0) {
    return { label: "No change vs previous", tone: "neutral" };
  }

  const roundedPercent = Math.max(1, Math.round(Math.abs(percentChange)));

  return percentChange > 0
    ? {
        label: `Up ${roundedPercent}% vs previous ${rangeLabel}`,
        tone: "up",
      }
    : {
        label: `Down ${roundedPercent}% vs previous ${rangeLabel}`,
        tone: "down",
      };
}

function formatCompactSkillXpComparisonLabel(label: string) {
  if (label.startsWith("New activity")) {
    return "New";
  }

  if (label.startsWith("No change")) {
    return "Flat";
  }

  const percentMatch = /^(Up|Down)\s+(\d+%)/.exec(label);

  if (percentMatch) {
    return `${percentMatch[1] === "Up" ? "+" : "-"}${percentMatch[2]}`;
  }

  return label.replace(/\s+vs previous.*$/i, "");
}

function TotalXpContributionChip({
  label,
  value,
  comparison,
  comparisonTone,
}: {
  label: string;
  value: string;
  comparison: string;
  comparisonTone: "up" | "down" | "neutral";
}) {
  const comparisonClass =
    comparisonTone === "up"
      ? "bg-emerald-500/10 text-emerald-300/80"
      : comparisonTone === "down"
        ? "bg-amber-500/10 text-amber-300/80"
        : "bg-zinc-800/70 text-zinc-400";

  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-[#080b11] px-1.5 py-2 sm:px-3">
      <div className="truncate text-[8px] uppercase tracking-[0.08em] text-zinc-500 sm:text-[9px] sm:tracking-[0.14em]">
        {label}
      </div>
      <div className="mt-0.5 flex min-w-0 items-baseline gap-1 sm:gap-1.5">
        <div className="shrink-0 truncate text-[11px] font-semibold text-zinc-100 sm:text-sm">
          {value}
        </div>
        <div
          className={classNames(
            "min-w-0 truncate rounded-full px-1 py-0.5 text-[8px] font-medium leading-none sm:text-[10px]",
            comparisonClass
          )}
        >
          {comparison}
        </div>
      </div>
    </div>
  );
}

function ContributionChip({
  label,
  value,
  detail,
  detailTone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  detailTone?: "up" | "down" | "neutral";
}) {
  const detailClass =
    detailTone === "up"
      ? "text-emerald-300/85"
      : detailTone === "down"
        ? "text-amber-300/85"
        : "text-zinc-500";

  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-[#080b11] px-1.5 py-2 sm:px-3">
      <div className="truncate text-[8px] uppercase tracking-[0.08em] text-zinc-500 sm:text-[9px] sm:tracking-[0.14em]">
        {label}
      </div>
      <div className="mt-0.5 truncate text-[11px] font-semibold text-zinc-100 sm:text-sm">
        {value}
      </div>
      {detail ? (
        <div
          className={classNames(
            "mt-1 text-[8px] font-medium leading-tight [overflow-wrap:anywhere] sm:text-[10px]",
            detailClass
          )}
        >
          {detail}
        </div>
      ) : null}
    </div>
  );
}

function CategoryDonut({
  categories,
  selectedCategoryId,
  totalXp,
  rangeLabel,
  onSelectCategory,
}: {
  categories: VisibleSkillCategoryContribution[];
  selectedCategoryId: string | null;
  totalXp: number;
  rangeLabel: string;
  onSelectCategory: (categoryId: string) => void;
}) {
  const size = 420;
  const centerX = size / 2;
  const centerY = 190;
  const radius = 74;
  const strokeWidth = 20;
  const separatorWidth = strokeWidth + 2;
  const selectedCategory =
    categories.find((category) => category.categoryId === selectedCategoryId) ?? null;
  const segments = useMemo<CategoryDonutSegment[]>(() => {
    let cursor = -90;

    return categories.map((category, index) => {
      const percent = totalXp > 0 ? (category.xpGained / totalXp) * 100 : 0;
      const startAngle = cursor;
      const arcDegrees = Math.min(359.99, (percent / 100) * 360);
      const endAngle = cursor + arcDegrees;
      cursor = endAngle;

      return {
        category,
        color: CATEGORY_DONUT_COLORS[index % CATEGORY_DONUT_COLORS.length],
        endAngle,
        path: describeDonutArc(centerX, centerY, radius, startAngle, endAngle),
        startAngle,
      };
    });
  }, [categories, centerX, centerY, radius, totalXp]);
  const labels = useMemo(
    () => buildCategoryDonutLabels(segments, centerX, centerY, radius),
    [segments, centerX, centerY, radius]
  );

  return (
    <div className="rounded-xl border border-zinc-800 bg-[#070a0f] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-3">
      <div className="relative mx-auto aspect-[420/380] max-w-[420px]">
        <svg
          viewBox={`0 0 ${size} 380`}
          className="h-full w-full overflow-visible"
          aria-label="Skill category contribution donut"
        >
          <defs>
            <filter id="category-donut-center-shadow" x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow
                dx="0"
                dy="2"
                stdDeviation="3"
                floodColor="#000000"
                floodOpacity="0.34"
              />
            </filter>
            <filter id="category-donut-selected-glow" x="-35%" y="-35%" width="170%" height="170%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="2.2"
                floodColor="#d7d9dd"
                floodOpacity="0.28"
              />
            </filter>
          </defs>
          <circle
            cx={centerX}
            cy={centerY}
            r={radius}
            fill="none"
            stroke="#151922"
            strokeWidth={separatorWidth}
          />
          {segments.map((segment) => {
            const { category, color, endAngle, path, startAngle } = segment;
            const selected = category.categoryId === selectedCategoryId;
            const selectedOuterPath = selected
              ? describeDonutArc(
                  centerX,
                  centerY,
                  radius + strokeWidth / 2 + 4,
                  startAngle,
                  endAngle
                )
              : null;

            return (
              <g key={category.categoryId}>
                <path
                  d={path}
                  fill="none"
                  stroke="#070a0f"
                  strokeWidth={separatorWidth}
                  strokeLinecap="butt"
                />
                {selectedOuterPath ? (
                  <path
                    d={selectedOuterPath}
                    fill="none"
                    stroke="#f4f4f5"
                    strokeWidth={6}
                    strokeLinecap="butt"
                    opacity={0.18}
                    filter="url(#category-donut-selected-glow)"
                    pointerEvents="none"
                  />
                ) : null}
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={selected ? strokeWidth + 1 : strokeWidth}
                  strokeLinecap="butt"
                  opacity={selected || selectedCategoryId == null ? 1 : 0.48}
                  className="cursor-pointer transition-[opacity,stroke-width] duration-150 focus:outline-none"
                  onMouseEnter={() => onSelectCategory(category.categoryId)}
                  onClick={() => onSelectCategory(category.categoryId)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${category.categoryName}, ${formatPercentLabel(
                    category.percentOfTotal
                  )} of XP`}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectCategory(category.categoryId);
                    }
                  }}
                />
                {selectedOuterPath ? (
                  <path
                    d={selectedOuterPath}
                    fill="none"
                    stroke="#eef0f3"
                    strokeWidth={2.5}
                    strokeLinecap="butt"
                    opacity={0.9}
                    pointerEvents="none"
                  />
                ) : null}
              </g>
            );
          })}
          {labels.map((label) => {
            const { category } = label.segment;
            const selected = category.categoryId === selectedCategoryId;
            const name = formatCategoryDonutName(category.categoryName);
            const details = `${formatPercentLabel(
              category.percentOfTotal
            )}  +${formatCategoryDonutXpLabel(category.xpGained)}`;

            return (
              <g
                key={`label-${category.categoryId}`}
                aria-hidden="true"
                className="pointer-events-none"
              >
                <path
                  d={[
                    "M",
                    label.anchorX.toFixed(2),
                    label.anchorY.toFixed(2),
                    "L",
                    label.connectorX.toFixed(2),
                    label.connectorY.toFixed(2),
                    "L",
                    label.elbowX.toFixed(2),
                    label.labelY.toFixed(2),
                    "L",
                    label.lineEndX.toFixed(2),
                    label.labelY.toFixed(2),
                  ].join(" ")}
                  fill="none"
                  stroke={selected ? "rgba(235,236,240,0.68)" : "rgba(161,166,175,0.34)"}
                  strokeWidth={selected ? 1.15 : 0.85}
                  strokeLinecap="round"
                />
                <circle
                  cx={label.anchorX}
                  cy={label.anchorY}
                  r={1.45}
                  fill={selected ? "#e7e9ed" : "#7c838e"}
                  opacity={selected ? 0.78 : 0.46}
                />
                <text
                  x={label.labelX}
                  y={label.labelY - 4}
                  textAnchor={label.side === "right" ? "start" : "end"}
                  className={classNames(
                    "fill-current text-[9.5px] font-semibold uppercase tracking-[0.09em] min-[380px]:text-[10.5px]",
                    selected ? "text-zinc-100" : "text-zinc-400"
                  )}
                >
                  {name}
                </text>
                <text
                  x={label.labelX}
                  y={label.labelY + 10}
                  textAnchor={label.side === "right" ? "start" : "end"}
                  className={classNames(
                    "fill-current text-[9px] font-medium tabular-nums min-[380px]:text-[10px]",
                    selected ? "text-zinc-300" : "text-zinc-600"
                  )}
                >
                  {details}
                </text>
              </g>
            );
          })}
          <circle
            cx={centerX}
            cy={centerY}
            r={radius - strokeWidth / 2 - 4}
            fill="#070a0f"
            filter="url(#category-donut-center-shadow)"
          />
          <circle
            cx={centerX}
            cy={centerY}
            r={radius - strokeWidth / 2 - 2}
            fill="none"
            stroke="rgba(208,210,214,0.10)"
            strokeWidth={1}
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
          <div className="max-w-[128px]">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500 min-[380px]:text-[10px]">
              {selectedCategory ? selectedCategory.categoryName : "TOTAL XP"}
            </div>
            <div className="mt-1 truncate text-base font-semibold leading-tight text-zinc-50 min-[380px]:text-lg sm:text-xl">
              {selectedCategory
                ? `${formatCompactNumber(selectedCategory.xpGained)} XP`
                : formatCompactNumber(totalXp)}
            </div>
            <div className="mt-1 text-[10px] font-medium text-zinc-400 min-[380px]:text-xs">
              {selectedCategory
                ? `${formatPercentLabel(selectedCategory.percentOfTotal)} of total`
                : `${rangeLabel} gain`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildCategoryDonutLabels(
  segments: CategoryDonutSegment[],
  centerX: number,
  centerY: number,
  radius: number
): CategoryDonutLabel[] {
  const preferredLabelRadius = radius + 78;
  const anchorRadius = radius + 10;
  const radialBreakRadius = radius + 24;
  const leftLabels: CategoryDonutLabel[] = [];
  const rightLabels: CategoryDonutLabel[] = [];

  segments.forEach((segment) => {
    const midAngle = (segment.startAngle + segment.endAngle) / 2;
    const side: CategoryDonutLabel["side"] =
      Math.sin((midAngle * Math.PI) / 180) >= 0 ? "right" : "left";
    const config = CATEGORY_DONUT_LABEL_CONFIG[side];
    const anchor = polarToCartesian(centerX, centerY, anchorRadius, midAngle);
    const radialBreak = polarToCartesian(
      centerX,
      centerY,
      radialBreakRadius,
      midAngle
    );
    const preferred = polarToCartesian(
      centerX,
      centerY,
      preferredLabelRadius,
      midAngle
    );
    const label: CategoryDonutLabel = {
      anchorX: anchor.x,
      anchorY: anchor.y,
      connectorX: radialBreak.x,
      connectorY: radialBreak.y,
      elbowX: config.elbowX,
      labelX: config.labelX,
      labelY: preferred.y,
      lineEndX: config.lineEndX,
      midAngle,
      preferredY: preferred.y,
      segment,
      side,
    };

    if (side === "right") {
      rightLabels.push(label);
    } else {
      leftLabels.push(label);
    }
  });

  return [
    ...layoutCategoryDonutLabelSide(leftLabels, CATEGORY_DONUT_LABEL_CONFIG.left),
    ...layoutCategoryDonutLabelSide(rightLabels, CATEGORY_DONUT_LABEL_CONFIG.right),
  ];
}

function layoutCategoryDonutLabelSide(
  labels: CategoryDonutLabel[],
  config: CategoryDonutLabelSideConfig
): CategoryDonutLabel[] {
  const { maxY, minGap, minY } = config;

  if (labels.length <= 1) {
    return labels.map((label) => ({
      ...label,
      labelY: clamp(label.preferredY, minY, maxY),
    }));
  }

  const sorted = [...labels].sort((a, b) => a.preferredY - b.preferredY);
  const available = maxY - minY;
  const required = minGap * (sorted.length - 1);
  const effectiveGap =
    required > available
      ? Math.max(
          CATEGORY_DONUT_LABEL_MOBILE_ROW_GAP,
          available / (sorted.length - 1)
        )
      : minGap;
  let previousY = minY - effectiveGap;

  const placed = sorted.map((label) => {
    const labelY = clamp(
      Math.max(label.preferredY, previousY + effectiveGap),
      minY,
      maxY
    );
    previousY = labelY;
    return { ...label, labelY };
  });

  for (let index = placed.length - 2; index >= 0; index -= 1) {
    const next = placed[index + 1];
    const current = placed[index];
    if (current.labelY + effectiveGap > next.labelY) {
      placed[index] = {
        ...current,
        labelY: Math.max(minY, next.labelY - effectiveGap),
      };
    }
  }

  const preferredSpan =
    sorted[sorted.length - 1].preferredY - sorted[0].preferredY;
  const placedSpan = placed[placed.length - 1].labelY - placed[0].labelY;
  const visuallyCramped =
    sorted.length >= 3 &&
    available > required * 1.12 &&
    (preferredSpan < available * 0.48 || placedSpan < available * 0.58);

  if (!visuallyCramped) {
    return placed;
  }

  const evenGap = Math.min(48, Math.max(effectiveGap, available / (sorted.length - 1)));
  const evenSpan = evenGap * (sorted.length - 1);
  const preferredCenter =
    sorted.reduce((sum, label) => sum + label.preferredY, 0) / sorted.length;
  const startY = clamp(preferredCenter - evenSpan / 2, minY, maxY - evenSpan);

  return placed.map((label, index) => ({
    ...label,
    labelY: startY + evenGap * index,
  }));
}

function formatCategoryDonutName(name: string) {
  const compact = name.trim().replace(/\s+/g, " ");

  if (compact.length <= 15) {
    return compact;
  }

  const withoutVowels = compact
    .split(" ")
    .map((word, index) =>
      index === 0 ? word : word.replace(/[aeiou]/gi, "")
    )
    .join(" ");

  const candidate = withoutVowels.length < compact.length ? withoutVowels : compact;
  return candidate.length > 15 ? `${candidate.slice(0, 14)}.` : candidate;
}

function formatCategoryDonutXpLabel(value: number) {
  return `${formatCompactNumber(value)} XP`;
}

function SkillCategoryDetail({
  category,
  categories,
  totalXp,
  rangeLabel,
}: {
  category: VisibleSkillCategoryContribution | null;
  categories: VisibleSkillCategoryContribution[];
  totalXp: number;
  rangeLabel: string;
}) {
  if (!category) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-[#080b11] p-3">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              {rangeLabel} contribution
            </div>
            <div className="mt-1 text-base font-semibold text-zinc-50">
              Top categories
            </div>
          </div>
          <div className="text-right text-lg font-semibold text-zinc-50">
            +{formatCompactNumber(totalXp)} XP
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {categories.slice(0, 6).map((item, index) => (
            <RankedContributionRow
              key={item.categoryId}
              rank={index + 1}
              icon={item.categoryIcon ?? null}
              fallback={getSkillInitial(item.categoryName)}
              name={item.categoryName}
              xpGained={item.xpGained}
              primaryPercent={item.percentOfTotal}
              secondaryLabel="of total"
            />
          ))}
        </div>
      </div>
    );
  }

  const isOther = Boolean(category.groupedCategories?.length);
  const activeSkills = category.skills.filter((skill) => skill.isActiveInRange);
  const inactiveSkills = category.skills.filter((skill) => !skill.isActiveInRange);

  return (
    <div className="rounded-xl border border-zinc-800 bg-[#080b11] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            Selected category
          </div>
          <div className="mt-1 truncate text-base font-semibold text-zinc-50">
            {isOther ? category.categoryName : `Skills in ${category.categoryName}`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-zinc-50">
            +{formatCompactNumber(category.xpGained)} XP
          </div>
          <div className="text-xs text-zinc-500">
            {formatPercentLabel(category.percentOfTotal)} of total
          </div>
        </div>
      </div>

      {isOther ? (
        <div className="mt-3 space-y-2">
          {category.groupedCategories?.map((grouped, index) => (
            <RankedContributionRow
              key={grouped.categoryId}
              rank={index + 1}
              icon={grouped.categoryIcon ?? null}
              fallback={getSkillInitial(grouped.categoryName)}
              name={grouped.categoryName}
              xpGained={grouped.xpGained}
              primaryPercent={grouped.percentOfTotal}
              secondaryLabel="of total"
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {activeSkills.map((skill) => (
            <SkillContributionSkillRow
              key={skill.skillId}
              icon={normalizeSkillIcon(skill.skillIcon ?? null)}
              fallback={getSkillInitial(skill.skillName)}
              name={skill.skillName}
              xpGained={skill.xpGained}
              percentOfCategory={skill.percentOfCategory}
              percentOfTotal={totalXp > 0 ? skill.percentOfTotal : 0}
              isActiveInRange={skill.isActiveInRange}
              xpPercentChange={skill.xpPercentChange}
              xpTrend={skill.xpTrend ?? []}
            />
          ))}
          {inactiveSkills.length > 0 ? (
            <div className="pt-1">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-600">
                <span className="h-px flex-1 bg-zinc-800" />
                <span>No XP this range</span>
                <span className="h-px flex-1 bg-zinc-800" />
              </div>
              <div className="space-y-2">
                {inactiveSkills.map((skill) => (
                  <SkillContributionSkillRow
                    key={skill.skillId}
                    icon={normalizeSkillIcon(skill.skillIcon ?? null)}
                    fallback={getSkillInitial(skill.skillName)}
                    name={skill.skillName}
                    xpGained={skill.xpGained}
                    percentOfCategory={skill.percentOfCategory}
                    percentOfTotal={totalXp > 0 ? skill.percentOfTotal : 0}
                    isActiveInRange={skill.isActiveInRange}
                    xpPercentChange={skill.xpPercentChange}
                    xpTrend={skill.xpTrend ?? []}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SkillContributionSkillRow({
  icon,
  fallback,
  name,
  xpGained,
  percentOfCategory,
  percentOfTotal,
  isActiveInRange,
  xpPercentChange,
  xpTrend,
}: {
  icon: string | null;
  fallback: string;
  name: string;
  xpGained: number;
  percentOfCategory: number;
  percentOfTotal: number;
  isActiveInRange: boolean;
  xpPercentChange: number | null;
  xpTrend: Array<{ label: string; xp: number }>;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/55 px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <SkillIconBadge icon={icon} fallback={fallback} name={name} />
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-zinc-100">{name}</div>
          {isActiveInRange ? (
            <div className="text-[10px] text-zinc-500">
              {formatPercentLabel(percentOfCategory)} of category ·{" "}
              {formatPercentLabel(percentOfTotal)} total
            </div>
          ) : (
            <div className="text-[10px] text-zinc-600">0 XP this range</div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 text-right">
        <SkillXpSparkline
          trend={xpTrend}
          isActiveInRange={isActiveInRange}
          isFlatTrend={xpPercentChange === 0}
          isNegativeTrend={xpPercentChange != null && xpPercentChange < 0}
        />
        <div
          className={classNames(
            "text-xs font-semibold",
            isActiveInRange ? "text-emerald-300" : "text-zinc-500"
          )}
        >
          +{formatCompactNumber(xpGained)} XP
        </div>
      </div>
    </div>
  );
}

function SkillXpSparkline({
  trend,
  isActiveInRange,
  isFlatTrend,
  isNegativeTrend,
}: {
  trend: Array<{ label: string; xp: number }>;
  isActiveInRange: boolean;
  isFlatTrend: boolean;
  isNegativeTrend: boolean;
}) {
  const width = 24;
  const height = 12;
  const paddingX = 1.5;
  const paddingY = 2;
  const values = trend.map((point) =>
    Number.isFinite(point.xp) && point.xp > 0 ? point.xp : 0
  );
  const maxValue = Math.max(0, ...values);
  const points = values.length > 0 ? values : [0, 0];
  const drawableWidth = width - paddingX * 2;
  const drawableHeight = height - paddingY * 2;
  const path = points
    .map((value, index) => {
      const x =
        paddingX +
        (points.length === 1 ? drawableWidth / 2 : (index / (points.length - 1)) * drawableWidth);
      const y =
        maxValue > 0
          ? paddingY + drawableHeight - (value / maxValue) * drawableHeight
          : height / 2;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-3 w-6 shrink-0 grow-0 basis-auto"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={path}
        fill="none"
        stroke={
          isNegativeTrend
            ? "rgba(248,113,113,0.62)"
            : isFlatTrend
              ? "rgba(113,113,122,0.45)"
            : isActiveInRange
              ? "rgba(110,231,183,0.55)"
              : "rgba(113,113,122,0.45)"
        }
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1"
      />
    </svg>
  );
}

function RankedContributionRow({
  rank,
  icon,
  fallback,
  name,
  xpGained,
  primaryPercent,
  secondaryLabel,
}: {
  rank: number;
  icon: string | null;
  fallback: string;
  name: string;
  xpGained: number;
  primaryPercent: number;
  secondaryLabel: string;
}) {
  return (
    <div className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/55 px-2 py-1.5">
      <div className="text-center text-[10px] font-semibold text-zinc-500">
        {rank}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <SkillIconBadge icon={icon} fallback={fallback} name={name} />
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-zinc-100">{name}</div>
          <div className="text-[10px] text-zinc-500">
            {formatPercentLabel(primaryPercent)} {secondaryLabel}
          </div>
        </div>
      </div>
      <div className="text-right text-xs font-semibold text-zinc-100">
        +{formatCompactNumber(xpGained)}
      </div>
    </div>
  );
}

function buildVisibleSkillCategories(
  categories: AnalyticsSkillCategoryContribution[]
): VisibleSkillCategoryContribution[] {
  if (categories.length <= 8) {
    return categories;
  }

  const visible = categories.slice(0, 8);
  const groupedCategories = categories.slice(8);
  const otherXp = groupedCategories.reduce(
    (sum, category) => sum + category.xpGained,
    0
  );
  const totalXp = categories.reduce((sum, category) => sum + category.xpGained, 0);

  if (otherXp <= 0 || totalXp <= 0) {
    return visible;
  }

  return [
    ...visible,
    {
      categoryId: "__other_skill_categories",
      categoryName: "Other",
      categoryIcon: null,
      xpGained: otherXp,
      percentOfTotal: clampPercent((otherXp / totalXp) * 100),
      skills: [],
      groupedCategories,
    },
  ];
}

function describeDonutArc(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number
) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M",
    start.x.toFixed(3),
    start.y.toFixed(3),
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x.toFixed(3),
    end.y.toFixed(3),
  ].join(" ");
}

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function formatPercentLabel(value: number) {
  const clamped = clampPercent(value);
  return `${clamped}%`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function SkillIconBadge({
  icon,
  fallback,
  name,
}: {
  icon: string | null;
  fallback: string;
  name: string;
}) {
  const isImageIcon = icon != null && /^https?:\/\//i.test(icon);

  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-900 text-lg font-semibold leading-none text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:h-8 sm:w-8"
      aria-label={`${name} icon`}
    >
      {isImageIcon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          src={icon}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center leading-none" aria-hidden>
          {icon ?? fallback}
        </span>
      )}
    </div>
  );
}

function normalizeSkillIcon(icon: string | null) {
  const trimmed = icon?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function formatContributionIconLabel(icon: string | null, label: string) {
  const normalizedIcon = normalizeSkillIcon(icon);

  if (!normalizedIcon || /^https?:\/\//i.test(normalizedIcon)) {
    return label;
  }

  return `${normalizedIcon} ${label}`;
}

function getSkillInitial(name: string) {
  const trimmed = name.trim();
  return (trimmed[0] ?? "?").toUpperCase();
}

function RecentScheduleShowcase({
  items,
}: {
  items: AnalyticsScheduleCompletion[];
}) {
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const dayFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <ul className="space-y-2 sm:space-y-3">
      {items.map((item) => {
        const start = safeDate(item.startUtc);
        const end = safeDate(item.endUtc);
        const completed = safeDate(item.completedAt);
        const Icon = SCHEDULE_ICON_MAP[item.type];
        const timeRange =
          start && end
            ? `${timeFormatter.format(start)} to ${timeFormatter.format(end)}`
            : "Scheduled event";
        const completedLabel = completed ? dayFormatter.format(completed) : "N/A";
        return (
          <li
            key={item.id}
            className="flex flex-col gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950/80 p-2.5 shadow-[0_12px_24px_rgba(0,0,0,0.22)] sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:rounded-2xl sm:p-3"
          >
            <div className="flex flex-1 items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-300">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-white">
                    {item.title}
                  </span>
                  <span
                    className={classNames(
                      "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em]",
                      SCHEDULE_BADGE_STYLES[item.type]
                    )}
                  >
                    {item.type}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{timeRange}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-300">
                  <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-zinc-200">
                    {formatDurationLabel(item.durationMinutes)}
                  </span>
                  <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-zinc-200">
                    {formatEnergyLabel(item.energy)}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-xs text-zinc-500 sm:text-right">
              <div className="font-semibold text-white">{completedLabel}</div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-600">
                Completed
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function safeDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function OverviewDiagnosticsSection({
  points,
  comparison,
  range,
  selectedRange,
  isRefreshing,
  statusMessage,
}: {
  points: AnalyticsOverviewDailyPoint[];
  comparison?: AnalyticsOverviewComparison;
  range: AnalyticsRange;
  selectedRange: AnalyticsRange;
  isRefreshing: boolean;
  statusMessage: string | null;
}) {
  const totalXp = points.reduce((sum, point) => sum + point.xpGained, 0);
  const completedEvents = points.reduce(
    (sum, point) => sum + point.completedEvents,
    0
  );
  const totalCompletedMinutes = points.reduce(
    (sum, point) => sum + point.completedMinutes,
    0
  );
  const totalUsableWindowMinutes = points.reduce(
    (sum, point) => sum + point.usableWindowMinutes,
    0
  );
  const rangeEfficiencyRate =
    totalUsableWindowMinutes > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round((totalCompletedMinutes / totalUsableWindowMinutes) * 100)
          )
        )
      : 0;
  const peakXp = points.reduce(
    (max, point) => Math.max(max, point.xpGained),
    0
  );
  const completedProjects = points.reduce(
    (sum, point) => sum + point.completedProjects,
    0
  );
  const completedHabits = points.reduce(
    (sum, point) => sum + point.completedHabits,
    0
  );
  const completedTasks = points.reduce(
    (sum, point) => sum + point.completedTasks,
    0
  );
  const averageLabel = range === "1d" ? "Avg/hour" : "Avg/day";
  const averageValue =
    points.length > 0 ? totalXp / points.length : 0;

  return (
    <div
      className={classNames(
        "space-y-4 transition-opacity duration-200 sm:space-y-5",
        isRefreshing && "opacity-80"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-400/85">
            PROGRESS TREND
          </div>
          <div className="mt-2">
            <OverviewPanelStatus
              isRefreshing={isRefreshing}
              message={statusMessage}
            />
          </div>
        </div>
        <div className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-zinc-700/70 bg-zinc-800/45 px-3 text-sm font-semibold text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:h-11 sm:px-4 sm:text-base">
          <CalendarDays className="h-4 w-4 text-zinc-300" aria-hidden="true" />
          <span>{formatAnalyticsRangeLabel(selectedRange)}</span>
        </div>
      </div>

      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
        vs previous cycle
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <OverviewKpiRailItem
          label="XP"
          value={formatCompactNumber(totalXp)}
          comparison={comparison?.xp}
          sublabel={formatRangeSummary(range, points.length)}
          tone="green"
        />
        <OverviewKpiRailItem
          label={averageLabel.toUpperCase()}
          value={formatAverageXp(averageValue)}
          comparison={comparison?.avgPerDay}
          sublabel={`Peak ${formatCompactNumber(peakXp)} XP`}
        />
        <OverviewKpiRailItem
          label="COMPLETED"
          value={formatCompactNumber(completedEvents)}
          comparison={comparison?.completed}
          sublabel={`${formatCompactNumber(completedProjects)}P · ${formatCompactNumber(completedTasks)}T · ${formatCompactNumber(completedHabits)}H`}
          tone="green"
        />
        <OverviewKpiRailItem
          label="EFFICIENCY"
          value={`${rangeEfficiencyRate}%`}
          comparison={comparison?.efficiency}
          sublabel={`${totalCompletedMinutes}m / ${totalUsableWindowMinutes}m`}
          tone="green"
        />
      </div>

      <div className="overflow-hidden rounded-[20px] border border-zinc-700/50 bg-[linear-gradient(145deg,rgba(9,9,11,0.9),rgba(24,24,27,0.72))] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:rounded-[22px]">
        <OverviewLineChart points={points} range={range} />
      </div>
    </div>
  );
}

function OverviewPanelStatus({
  isRefreshing,
  message,
}: {
  isRefreshing: boolean;
  message: string | null;
}) {
  const toneClass = message
    ? "border-rose-500/20 bg-rose-500/10 text-rose-200"
    : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";

  if (!isRefreshing && !message) {
    return null;
  }

  return (
    <div className="mt-2 h-5">
      {isRefreshing ? (
        <div
          className={classNames(
            "inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]",
            toneClass
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {message ?? "Updating"}
        </div>
      ) : message ? (
        <div
          className={classNames(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]",
            toneClass
          )}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}

function AnalyticsRangeSelector({
  selectedRange,
  onRangeChange,
  isRefreshing,
}: {
  selectedRange: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  isRefreshing: boolean;
}) {
  return (
    <div className="min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <div className="inline-flex min-w-max items-center gap-px rounded-full border border-zinc-800 bg-zinc-950/80 p-px">
        {ANALYTICS_RANGE_OPTIONS.map((option) => {
          const isActive = option.value === selectedRange;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onRangeChange(option.value)}
              aria-pressed={isActive}
              aria-busy={isRefreshing && isActive}
              className={classNames(
                "h-[18px] rounded-full px-1.5 text-[9px] font-semibold uppercase leading-none tracking-[0.08em] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500/70 sm:h-6 sm:px-2 sm:text-[10px] sm:tracking-[0.1em]",
                isActive
                  ? "border border-zinc-700 bg-zinc-800/80 text-zinc-100"
                  : "border border-transparent text-zinc-500 hover:text-zinc-300",
                isRefreshing && isActive && "opacity-70"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OverviewKpiRailItem({
  label,
  value,
  comparison,
  sublabel,
  tone = "default",
}: {
  label: string;
  value: string;
  comparison?: AnalyticsOverviewComparisonMetric;
  sublabel: string;
  tone?: "default" | "green" | "amber";
}) {
  const accentClass =
    tone === "green"
      ? "before:bg-emerald-400/80"
      : tone === "amber"
        ? "before:bg-amber-400/75"
        : "before:bg-emerald-400/70";
  const valueClass =
    tone === "green"
      ? "text-zinc-50"
      : tone === "amber"
        ? "text-amber-100"
        : "text-zinc-50";

  return (
    <div
      className={classNames(
        "relative min-h-[104px] min-w-0 overflow-hidden rounded-2xl border border-zinc-700/45 bg-[linear-gradient(135deg,rgba(39,39,42,0.68),rgba(9,9,11,0.78))] p-3 pl-3.5 shadow-[0_14px_28px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.035)] before:absolute before:inset-y-4 before:left-0 before:w-0.5 before:rounded-full sm:min-h-[112px] sm:p-4 sm:pl-4",
        accentClass
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:text-[11px]">
          {label}
        </div>
        <div className="mt-2 flex min-w-0 items-baseline gap-2">
          <div
            className={classNames(
              "min-w-0 truncate text-[2rem] font-semibold leading-none tabular-nums sm:text-[2.35rem]",
              valueClass
            )}
          >
            {value}
          </div>
          {comparison ? (
            <div
              className={classNames(
                "shrink-0 text-[11px] font-semibold leading-none tabular-nums sm:text-xs",
                getOverviewComparisonClass(comparison.trend)
              )}
            >
              {formatOverviewComparisonDelta(comparison)}
            </div>
          ) : null}
        </div>
        <div className="mt-2 truncate text-xs leading-tight text-zinc-500 sm:text-sm">
          {sublabel}
        </div>
      </div>
    </div>
  );
}

function formatOverviewComparisonDelta(
  comparison: AnalyticsOverviewComparisonMetric
) {
  if (comparison.trend === "new") {
    return "new";
  }

  if (comparison.trend === "flat" || comparison.percentChange === 0) {
    return "flat";
  }

  if (comparison.percentChange == null) {
    return "flat";
  }

  return comparison.percentChange > 0
    ? `+${comparison.percentChange}%`
    : `${comparison.percentChange}%`;
}

function getOverviewComparisonClass(
  trend: AnalyticsOverviewComparisonMetric["trend"]
) {
  if (trend === "up" || trend === "new") {
    return "text-emerald-300/80";
  }

  if (trend === "down") {
    return "text-rose-300/80";
  }

  return "text-zinc-500";
}

function OverviewLineChart({
  points,
  range,
}: {
  points: AnalyticsOverviewDailyPoint[];
  range: AnalyticsRange;
}) {
  const [tooltip, setTooltip] = useState<{
    index: number;
    left: number;
    top: number;
    visible: boolean;
  }>({
    index: points.length - 1,
    left: 50,
    top: 50,
    visible: false,
  });

  useEffect(() => {
    setTooltip({
      index: points.length > 0 ? points.length - 1 : 0,
      left: 50,
      top: 50,
      visible: false,
    });
  }, [points, range]);

  const width = 720;
  const height = 330;
  const padding = { top: 16, right: 12, bottom: 56, left: 38 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const contextHeight = 58;
  const trendHeight = chartHeight - contextHeight;
  const trendBaselineY = padding.top + trendHeight;
  const contextTopY = trendBaselineY + 12;
  const contextBottomY = padding.top + chartHeight - 8;
  const values = points.map((point) => point.xpGained);
  const rawMaxValue = values.length > 0 ? Math.max(...values) : 0;
  const yMax = getTrendYAxisMax(rawMaxValue);
  const isEmpty = rawMaxValue <= 0;
  const hasEfficiencyBuckets = points.some(
    (point) => point.usableWindowMinutes > 0
  );
  const maxCompletedEvents = Math.max(
    1,
    ...points.map((point) => point.completedEvents)
  );
  const activeIndex = Math.min(tooltip.index, points.length - 1);
  const activePoint = tooltip.visible ? points[activeIndex] ?? null : null;
  const yTickValues = buildYTickValues(yMax);
  const svgPoints = points.map((point, index) => {
    const x =
      points.length === 1
        ? padding.left + chartWidth / 2
        : padding.left + (index / (points.length - 1)) * chartWidth;
    const y =
      padding.top + trendHeight - (point.xpGained / yMax) * trendHeight;
    return { x, y, point };
  });
  const bucketWidth = chartWidth / Math.max(points.length, 1);
  const completionBarWidth = Math.max(
    2,
    Math.min(12, bucketWidth * (points.length > 30 ? 0.42 : 0.52))
  );
  const linePath = svgPoints
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`
    )
    .join(" ");
  const areaPath = [
    `M${padding.left},${trendBaselineY}`,
    ...svgPoints.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`),
    `L${padding.left + chartWidth},${trendBaselineY}`,
    "Z",
  ].join(" ");
  const xLabels = getTrendAxisLabelIndices(range, points)
    .map((index) => ({
      x:
        points.length === 1
          ? padding.left + chartWidth / 2
          : padding.left + (index / (points.length - 1)) * chartWidth,
      label: formatTrendXAxisLabel(points[index]?.date, range),
      weekday: formatTrendWeekdayLabel(points[index]?.date, range),
    }));
  const showTooltip = (index: number, left: number, top: number) => {
    setTooltip({
      index,
      left: Math.max(8, Math.min(92, left)),
      top: Math.max(12, Math.min(88, top)),
      visible: true,
    });
  };
  const showTooltipAtPoint = (index: number) => {
    const point = svgPoints[index];
    if (!point) {
      return;
    }

    showTooltip(index, (point.x / width) * 100, (point.y / height) * 100);
  };
  const showTooltipAtPointer = (
    index: number,
    event: PointerEvent<HTMLButtonElement>
  ) => {
    const bounds = event.currentTarget
      .closest("[data-overview-line-chart]")
      ?.getBoundingClientRect();

    if (!bounds) {
      showTooltipAtPoint(index);
      return;
    }

    showTooltip(
      index,
      ((event.clientX - bounds.left) / bounds.width) * 100,
      ((event.clientY - bounds.top) / bounds.height) * 100
    );
  };
  const hideTooltip = () => {
    setTooltip((current) => ({ ...current, visible: false }));
  };

  return (
    <div className="px-3 py-3.5 sm:px-4 sm:py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-zinc-100 sm:text-base">
          XP over time
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-zinc-400 sm:text-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded-full bg-emerald-300/85 shadow-[0_0_10px_rgba(52,211,153,0.24)]" />
            Daily XP
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500/35" />
            Events
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="relative" data-overview-line-chart>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="h-[310px] w-full sm:h-[250px] md:h-[270px]"
          >
            <defs>
              <linearGradient id="overviewDailyArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(16,185,129,0.16)" />
                <stop offset="100%" stopColor="rgba(16,185,129,0.01)" />
              </linearGradient>
              <linearGradient id="overviewDailyLine" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#6ee7b7" />
              </linearGradient>
            </defs>

            {yTickValues.map((value) => {
              const ratio = yMax === 0 ? 0 : value / yMax;
              const y = padding.top + trendHeight - ratio * trendHeight;
              return (
                <g key={`grid-${value}`}>
                  <line
                    x1={padding.left}
                    x2={padding.left + chartWidth}
                    y1={y}
                    y2={y}
                    stroke="rgba(82,82,91,0.3)"
                    strokeDasharray="3 6"
                  />
                  <text
                    x={padding.left - 10}
                    y={y + 5}
                    textAnchor="end"
                    fill="rgba(161,161,170,0.76)"
                    fontSize="11"
                  >
                    {formatCompactNumber(value)}
                  </text>
                </g>
              );
            })}

            <line
              x1={padding.left}
              x2={padding.left + chartWidth}
              y1={trendBaselineY}
              y2={trendBaselineY}
              stroke="rgba(82,82,91,0.34)"
              strokeDasharray="3 6"
            />

            <line
              x1={padding.left}
              x2={padding.left + chartWidth}
              y1={contextTopY}
              y2={contextTopY}
              stroke="rgba(63,63,70,0.28)"
              strokeDasharray="3 6"
            />

            {points.map((point, index) => {
              const x =
                points.length === 1
                  ? padding.left + chartWidth / 2
                  : padding.left + (index / (points.length - 1)) * chartWidth;
              const barHeight =
                point.completedEvents > 0
                  ? Math.max(
                      2,
                      (point.completedEvents / maxCompletedEvents) *
                        (contextBottomY - contextTopY - 10)
                    )
                  : 0;
              const efficiencyWidth =
                hasEfficiencyBuckets && point.usableWindowMinutes > 0
                  ? Math.max(
                      1,
                      Math.min(
                        bucketWidth * 0.72,
                        bucketWidth * 0.72 * (point.efficiencyRate / 100)
                      )
                    )
                  : 0;

              return (
                <g key={`${point.date}-context`}>
                  {hasEfficiencyBuckets && point.usableWindowMinutes > 0 ? (
                    <rect
                      x={x - (bucketWidth * 0.72) / 2}
                      y={contextTopY + 4}
                      width={efficiencyWidth}
                      height={3}
                      rx={1.5}
                      fill="rgba(245,158,11,0.45)"
                    />
                  ) : null}
                  {barHeight > 0 ? (
                    <rect
                      x={x - completionBarWidth / 2}
                      y={contextBottomY - barHeight}
                      width={completionBarWidth}
                      height={barHeight}
                      rx={Math.min(2, completionBarWidth / 2)}
                      fill="rgba(52,211,153,0.24)"
                    />
                  ) : null}
                </g>
              );
            })}

            {!isEmpty ? (
              <>
                <path d={areaPath} fill="url(#overviewDailyArea)" />
                <path
                  d={linePath}
                  fill="none"
                  stroke="url(#overviewDailyLine)"
                  strokeWidth={2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {activePoint ? (
                  <line
                    x1={svgPoints[activeIndex]?.x ?? 0}
                    x2={svgPoints[activeIndex]?.x ?? 0}
                    y1={padding.top}
                    y2={contextBottomY}
                    stroke="rgba(113,113,122,0.38)"
                    strokeDasharray="3 5"
                  />
                ) : null}

                {svgPoints.map(({ x, y, point }, index) => {
                  const isActive = activePoint != null && index === activeIndex;
                  return (
                    <g key={`${point.date}-${index}`}>
                      <circle
                        cx={x}
                        cy={y}
                        r={isActive ? 3.8 : 2.3}
                        fill={isActive ? "#d1fae5" : "#6ee7b7"}
                        stroke="rgba(9,9,11,0.95)"
                        strokeWidth={isActive ? 1.5 : 1}
                      />
                    </g>
                  );
                })}
              </>
            ) : (
              <g>
                <line
                  x1={padding.left}
                  x2={padding.left + chartWidth}
                  y1={padding.top + trendHeight * 0.55}
                  y2={padding.top + trendHeight * 0.55}
                  stroke="rgba(63,63,70,0.55)"
                  strokeDasharray="4 6"
                />
                <text
                  x={padding.left + chartWidth / 2}
                  y={padding.top + trendHeight * 0.46}
                  textAnchor="middle"
                  fill="rgba(161,161,170,0.88)"
                  fontSize="13"
                >
                  No XP recorded in this range
                </text>
              </g>
            )}

            {xLabels.map((label, index) => (
              <text
                key={`${label.label}-${index}`}
                x={label.x}
                y={height - 34}
                textAnchor="middle"
                fill="rgba(161,161,170,0.9)"
                fontSize="11"
              >
                <tspan x={label.x} dy="0">
                  {label.label}
                </tspan>
                <tspan
                  x={label.x}
                  dy="12"
                  fill="rgba(113,113,122,0.92)"
                  fontSize="10"
                >
                  {label.weekday}
                </tspan>
              </text>
            ))}
          </svg>

          <div className="pointer-events-none absolute inset-0">
            <div className="relative h-full">
              {!isEmpty
                ? svgPoints.map((point, index) => (
                    <button
                      key={`${point.point.date}-hitbox`}
                      type="button"
                      onPointerEnter={(event) => showTooltipAtPointer(index, event)}
                      onPointerMove={(event) => showTooltipAtPointer(index, event)}
                      onPointerDown={(event) => {
                        if (event.pointerType === "touch") {
                          showTooltipAtPoint(index);
                        }
                      }}
                      onPointerLeave={(event) => {
                        if (event.pointerType !== "touch") {
                          hideTooltip();
                        }
                      }}
                      onFocus={() => showTooltipAtPoint(index)}
                      onBlur={hideTooltip}
                      onClick={() => showTooltipAtPoint(index)}
                      className="pointer-events-auto absolute bottom-0 top-0 -translate-x-1/2 focus:outline-none"
                      style={{
                        left: `${((point.x / width) * 100).toFixed(4)}%`,
                        width: `${Math.max(100 / Math.max(points.length, 1), 2)}%`,
                      }}
                      aria-label={formatOverviewPointAriaLabel(
                        point.point,
                        range,
                        hasEfficiencyBuckets
                      )}
                    />
                  ))
                : null}
            </div>
          </div>

          {activePoint ? (
            <div
              className={classNames(
                "pointer-events-none absolute z-10 min-w-[132px] rounded-lg border border-white/10 bg-zinc-950/85 px-2.5 py-2 text-[11px] text-zinc-300 shadow-2xl shadow-black/40 backdrop-blur-md",
                tooltip.left > 72
                  ? "-translate-x-full"
                  : tooltip.left < 28
                    ? "translate-x-0"
                    : "-translate-x-1/2",
                tooltip.top > 58 ? "-translate-y-full" : "translate-y-2"
              )}
              style={{
                left: `${tooltip.left}%`,
                top: `${tooltip.top}%`,
              }}
              role="tooltip"
            >
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="font-medium text-zinc-100">
                  {formatTrendActiveLabel(activePoint.date, range)}
                </span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-emerald-200">
                  XP
                </span>
              </div>
              <div className="text-base font-semibold leading-none text-zinc-50">
                {formatCompactNumber(activePoint.xpGained)}
              </div>
              <div className="mt-2 grid gap-1 border-t border-white/10 pt-1.5">
                <OverviewTooltipMetric
                  label="Completed"
                  value={activePoint.completedEvents}
                  tone="text-emerald-200"
                />
                <OverviewTooltipMetric
                  label="Scheduled"
                  value={activePoint.scheduledEvents}
                  tone="text-zinc-200"
                />
                <OverviewTooltipMetric
                  label="Missed"
                  value={activePoint.missedEvents}
                  tone="text-rose-200"
                />
                {hasEfficiencyBuckets && activePoint.usableWindowMinutes > 0 ? (
                  <OverviewTooltipMetric
                    label="Efficiency"
                    value={activePoint.efficiencyRate}
                    tone="text-amber-200"
                    suffix="%"
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 border-t border-white/[0.06] pt-2.5 text-xs text-zinc-500">
          <Info className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
          <span>All times shown in your local time zone</span>
        </div>
      </div>
    </div>
  );
}

function OverviewTooltipMetric({
  label,
  value,
  tone,
  suffix = "",
}: {
  label: string;
  value: number;
  tone: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </div>
      <div className={classNames("font-semibold tabular-nums", tone)}>
        {formatCompactNumber(value)}
        {suffix}
      </div>
    </div>
  );
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatAverageXp(value: number) {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(rounded);
}

function formatRangeSummary(range: AnalyticsRange, pointsCount: number) {
  if (range === "1d") {
    return `${pointsCount} hourly points`;
  }

  return `${pointsCount} daily points`;
}

function buildYTickValues(yMax: number) {
  const top = Math.max(1, Math.ceil(yMax));
  const mid = Math.round(top / 2);
  return [0, mid, top].filter(
    (value, index, values) => values.indexOf(value) === index
  );
}

function getTrendYAxisMax(maxValue: number) {
  if (maxValue <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(maxValue * 1.15));
}

function getTrendAxisLabelIndices(
  range: AnalyticsRange,
  points: AnalyticsOverviewDailyPoint[]
) {
  const length = points.length;
  if (length <= 1) {
    return [0];
  }

  if (range === "1d") {
    return [0, 6, 12, 18, length - 1].filter(
      (value, index, values) => value < length && values.indexOf(value) === index
    );
  }

  if (range === "7d") {
    return points.map((_, index) => index);
  }

  if (range === "30d") {
    return [0, 7, 14, 21, length - 1].filter(
      (value, index, values) => value < length && values.indexOf(value) === index
    );
  }

  const monthMarkers = points.reduce<number[]>((acc, point, index) => {
    const current = parseTrendDate(point.date, range);
    const previous = index > 0 ? parseTrendDate(points[index - 1].date, range) : null;
    if (
      index === 0 ||
      !previous ||
      current.getUTCMonth() !== previous.getUTCMonth()
    ) {
      acc.push(index);
    }
    return acc;
  }, []);

  const candidates = [...monthMarkers, length - 1];
  return candidates.filter(
    (value, index, values) => value < length && values.indexOf(value) === index
  );
}

function formatTrendXAxisLabel(value: string | null, range: AnalyticsRange) {
  if (!value) {
    return "";
  }

  const date = parseTrendDate(value, range);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  if (range === "1d") {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTrendWeekdayLabel(value: string | null, range: AnalyticsRange) {
  if (!value) {
    return "";
  }

  const date = parseTrendDate(value, range);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
  }).format(date);
}

function formatOverviewPointAriaLabel(
  point: AnalyticsOverviewDailyPoint,
  range: AnalyticsRange,
  hasEfficiencyBuckets: boolean
) {
  const parts = [
    formatTrendActiveLabel(point.date, range),
    `${formatCompactNumber(point.xpGained)} XP`,
    `${formatCompactNumber(point.completedEvents)} completed`,
    `${formatCompactNumber(point.scheduledEvents)} scheduled`,
    `${formatCompactNumber(point.missedEvents)} missed`,
  ];

  if (hasEfficiencyBuckets && point.usableWindowMinutes > 0) {
    parts.push(`${formatCompactNumber(point.efficiencyRate)}% efficiency`);
  }

  return parts.join(", ");
}

function formatTrendActiveLabel(value: string | null, range: AnalyticsRange) {
  if (!value) {
    return "No data";
  }

  const date = parseTrendDate(value, range);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  if (range === "1d") {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function parseTrendDate(value: string, range: AnalyticsRange) {
  return range === "1d" ? new Date(value) : new Date(`${value}T12:00:00Z`);
}

function formatDurationLabel(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "Flexible";
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (remainder === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${remainder}m`;
  }
  return `${minutes}m`;
}

function formatEnergyLabel(value: string | null) {
  if (!value) {
    return "Neutral energy";
  }
  const normalized = value.toLowerCase();
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)} energy`;
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-2.5 shadow-[0_12px_24px_rgba(0,0,0,0.22)] sm:rounded-2xl sm:p-3.5"
      aria-label={`${project.title} progress`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-white">
            {project.title}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {project.tasksDone}/{project.tasksTotal} tasks complete
          </div>
        </div>
        <span className="text-sm font-semibold text-zinc-300">
          {project.progress}%
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-zinc-300"
          style={{ width: `${project.progress}%` }}
        />
      </div>
    </div>
  );
}

function StreakTrendCard({
  currentStreak,
  longestStreak,
  history,
}: {
  currentStreak: number;
  longestStreak: number;
  history: { label: string; value: number }[];
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-2.5 text-xs text-zinc-400 sm:rounded-2xl sm:p-4 sm:text-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Streak momentum
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            See how your streak evolved over time.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Current streak
          </div>
          <div className="mt-1 text-2xl font-semibold text-white">
            {currentStreak} days
          </div>
        </div>
      </div>
      <div className="mt-4 sm:mt-6">
        <StreakSparkline data={history} />
      </div>
      <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-2.5 text-[11px] text-zinc-400 sm:mt-4 sm:p-3 sm:text-xs">
        <div className="flex items-center justify-between">
          <span className="uppercase tracking-[0.2em] text-zinc-500">
            Longest streak
          </span>
          <span className="text-lg font-semibold text-white">
            {longestStreak} days
          </span>
        </div>
        <p className="mt-2 text-[13px]">Use these momentum bursts to plan your next focus session.</p>
      </div>
    </div>
  );
}

function StreakSparkline({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/70 text-center text-xs text-zinc-500">
        Log more rituals to unlock streak trends.
      </div>
    );
  }

  const width = 280;
  const height = 120;
  const values = data.map((point) => point.value);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const verticalPadding = 12;
  const range = maxValue - minValue || 1;
  const points = data.map((point, index) => {
    const x =
      data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
    const normalized = (point.value - minValue) / range;
    const y =
      height - (normalized * (height - verticalPadding * 2) + verticalPadding);
    return { x, y };
  });

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`
    )
    .join(" ");

  const areaPath = [
    `M0,${height}`,
    ...points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`),
    `L${width},${height}`,
    "Z",
  ].join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full sm:h-32">
        <defs>
          <linearGradient id="streakGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(161,161,170,0.45)" />
            <stop offset="100%" stopColor="rgba(82,82,91,0.04)" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#streakGradient)" />
        <path
          d={linePath}
          fill="none"
          stroke="url(#streakGradient)"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </svg>
      <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
        <span>{data[0]?.label ?? ""}</span>
        <span>{data[data.length - 1]?.label ?? ""}</span>
      </div>
    </div>
  );
}

function RoutineHeatmap({
  routines,
}: {
  routines: { id: string; name: string; heatmap: number[][] }[];
}) {
  if (routines.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/70 px-3 text-center text-xs text-zinc-500 sm:min-h-[144px] sm:gap-3 sm:text-sm">
        No routine data yet.
        <span className="text-xs text-zinc-600">
          Log habits like exercise or journaling to reveal patterns.
        </span>
      </div>
    );
  }

  const weekCounts = routines.map((routine) => routine.heatmap.length);
  const weeks = weekCounts.length > 0 ? Math.max(...weekCounts) : 0;
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Routine trends
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Visualize which habits stay consistent week over week.
          </p>
        </div>
        {weeks > 0 ? (
          <span className="text-xs font-medium text-zinc-500">
            Past {weeks} week{weeks === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      <div className="mt-4 space-y-4 sm:mt-5 sm:space-y-5">
        {routines.map((routine) => {
          const flattened = routine.heatmap.flat();
          const totalDays = flattened.length;
          const total = flattened.reduce((sum, value) => sum + value, 0);
          const average =
            totalDays === 0 ? 0 : Math.round((total / totalDays) * 100);

          return (
            <div key={routine.id} className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-white">{routine.name}</span>
                <span className="text-xs text-zinc-500">
                  {average}% consistency
                </span>
              </div>
              <div className="grid grid-cols-[auto,1fr] gap-3">
                <div className="flex flex-col justify-between text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                  {dayLabels.map((label) => (
                    <span key={label} className="h-6">
                      {label}
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {routine.heatmap.map((week, weekIndex) => (
                    <div
                      key={`${routine.id}-week-${weekIndex}`}
                      className="grid grid-rows-7 gap-1.5"
                    >
                      {week.map((value, dayIndex) => {
                        const ratio =
                          value > 1
                            ? Math.min(value / 100, 1)
                            : Math.max(0, Math.min(value, 1));
                        const opacity =
                          ratio === 0 ? 0.12 : 0.25 + ratio * 0.55;
                        const backgroundColor =
                          ratio === 0
                            ? "#080808"
                            : `rgba(161,161,170,${opacity.toFixed(2)})`;
                        const boxShadow =
                          ratio === 0
                            ? undefined
                            : "0 3px 10px rgba(113,113,122,0.2)";
                        const percent = Math.round(ratio * 100);
                        return (
                          <span
                            key={`${routine.id}-week-${weekIndex}-day-${dayIndex}`}
                            className="h-6 w-6 rounded-md border border-zinc-800"
                            style={{ backgroundColor, boxShadow }}
                            title={`${dayLabels[dayIndex]} · ${percent}%`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StreakCalendar({
  days,
  completed,
}: {
  days: number;
  completed: number[];
}) {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - (days - 1));
  const cells = Array.from({ length: days }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const dayNumber = index + 1;
    const isComplete = completed.includes(dayNumber);
    return { key: dayNumber, date, isComplete };
  });
  const weekLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        {weekLabels.map((label) => (
          <span key={label} className="text-center">
            {label}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1.5" aria-label="Streak calendar">
        {cells.map(({ key, date, isComplete }) => (
          <div
            key={key}
            className={classNames(
              "flex h-7 w-full items-center justify-center rounded-lg border text-sm font-semibold transition sm:h-8",
              isComplete
                ? "border-zinc-600 bg-zinc-200 text-zinc-950"
                : "border-zinc-800 bg-[#080808] text-zinc-500"
            )}
            title={date.toDateString()}
          >
            <span>{date.getDate()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const hasHeader = Boolean(title || description || action);

  return (
    <section
      id={id}
      className={classNames(
        "rounded-xl border border-zinc-800 bg-zinc-950/85 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur sm:rounded-2xl sm:p-5",
        className
      )}
    >
      {hasHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-2.5 sm:gap-3">
          <div>
            {title ? (
              <h2 className="text-sm font-semibold text-white sm:text-lg">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
                {description}
              </p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={hasHeader ? "mt-3 sm:mt-4" : undefined}>{children}</div>
    </section>
  );
}

function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-2 sm:rounded-2xl sm:p-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold text-white sm:mt-1 sm:text-xl">{value}</div>
      {detail ? <div className="mt-1 text-xs text-zinc-400">{detail}</div> : null}
    </div>
  );
}

function DataNotice({ copy }: { copy: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-[11px] text-zinc-500 sm:px-3 sm:py-2 sm:text-xs">
      {copy}
    </div>
  );
}

function EmptyCopy({ copy }: { copy: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 px-3 py-4 text-center text-xs text-zinc-500 sm:px-4 sm:py-5 sm:text-sm">
      {copy}
    </div>
  );
}

function AnalyticsPaywallState({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-700/80 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.12),transparent_34%),linear-gradient(145deg,rgba(9,9,11,0.98),rgba(24,24,27,0.94))] p-4 shadow-[0_24px_64px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-6">
      <div className="max-w-2xl">
        <div className="mb-3 inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-amber-100">
          CREATOR Pro
        </div>
        <h3 className="text-lg font-semibold text-white sm:text-2xl">
          Unlock CREATOR Pro analytics
        </h3>
        <p className="mt-2 text-sm leading-6 text-zinc-300 sm:text-base">
          Analytics are part of CREATOR Pro. Upgrade to see your execution
          trends, schedule performance, skill progress, and system health in one
          place.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="button"
            onClick={onUpgrade}
            className="border border-amber-200/30 bg-amber-200 text-zinc-950 shadow-[0_10px_28px_rgba(250,204,21,0.18)] hover:bg-amber-100"
          >
            Upgrade to CREATOR Pro
          </Button>
          <p className="text-xs text-zinc-500">
            Built for users who want the full system view.
          </p>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-3 py-4 text-xs text-red-200 sm:rounded-2xl sm:px-4 sm:py-5 sm:text-sm">
      {message}
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={classNames(
        "animate-pulse rounded-2xl bg-zinc-900/80",
        className
      )}
    />
  );
}
function DailyConsistencyCard({ summary }: { summary: AnalyticsHabitSummary }) {
  const weeks = Math.ceil(summary.calendarDays / 7);
  const today = new Date();
  const currentFormatter = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Daily consistency
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Streak coverage for the last {summary.calendarDays} days.
          </p>
        </div>
        <div className="text-right text-xs font-medium text-zinc-500">
          <div>
            {weeks} week{weeks === 1 ? "" : "s"}
          </div>
          <div>{currentFormatter.format(today)}</div>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <StreakCalendar
          days={summary.calendarDays}
          completed={summary.calendarCompleted}
        />
      </div>
    </div>
  );
}
