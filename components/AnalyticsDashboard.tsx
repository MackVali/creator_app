"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { CheckSquare, FolderKanban, Flame, ArrowLeft } from "lucide-react";
import type {
  AnalyticsOverviewDailyPoint,
  AnalyticsOverviewEfficiencyDebug,
  AnalyticsRange,
  AnalyticsResponse,
  AnalyticsHabitSummary,
  AnalyticsHabitRoutine,
  AnalyticsHabitPerformance,
  AnalyticsHabitStreakPoint,
  AnalyticsHabitWeeklyReflection,
  AnalyticsScheduleCompletion,
  AnalyticsTimeBlockPerformance,
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

const OVERVIEW_RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
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
    throw new Error(response.status === 401 ? "unauthorized" : "fetch_failed");
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
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overviewRange, setOverviewRange] = useState<AnalyticsRange>("30d");
  const [overviewAnalytics, setOverviewAnalytics] =
    useState<AnalyticsResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewRefreshing, setOverviewRefreshing] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewCache, setOverviewCache] = useState<
    Partial<Record<AnalyticsRange, AnalyticsResponse>>
  >({});
  const previousViewRef = useRef<AnalyticsView>(activeView);
  const overviewRequestIdRef = useRef(0);
  const overviewAbortRef = useRef<AbortController | null>(null);
  const [slideDirection, setSlideDirection] = useState(1);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchAnalyticsRange("30d", controller.signal);
        if (!cancelled) {
          setAnalytics(payload);
          setOverviewCache((current) => ({ ...current, "30d": payload }));
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        const message =
          err instanceof Error && err.message === "unauthorized"
            ? "Sign in to view analytics."
            : "Unable to load analytics data.";
        console.error("Failed to load analytics data", err);
        setAnalytics(null);
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const sharedThirtyDayAnalytics = overviewRange === "30d" ? analytics : null;
    const cachedAnalytics = overviewCache[overviewRange] ?? null;
    const nextAnalytics = sharedThirtyDayAnalytics ?? cachedAnalytics;
    const hasVisibleOverviewData = overviewAnalytics !== null;

    if (nextAnalytics) {
      setOverviewAnalytics(nextAnalytics);
      setOverviewError(null);
      setOverviewLoading(false);
      setOverviewRefreshing(false);
      return;
    }

    if (overviewRange === "30d" && loading && !analytics) {
      setOverviewLoading(true);
      setOverviewRefreshing(false);
      return;
    }

    overviewAbortRef.current?.abort();
    const controller = new AbortController();
    overviewAbortRef.current = controller;
    const requestId = overviewRequestIdRef.current + 1;
    overviewRequestIdRef.current = requestId;

    setOverviewError(null);
    setOverviewLoading(!hasVisibleOverviewData);
    setOverviewRefreshing(hasVisibleOverviewData);

    const load = async () => {
      try {
        const payload = await fetchAnalyticsRange(overviewRange, controller.signal);
        if (
          controller.signal.aborted ||
          overviewRequestIdRef.current !== requestId
        ) {
          return;
        }

        setOverviewCache((current) => ({ ...current, [overviewRange]: payload }));
        setOverviewAnalytics(payload);
        setOverviewError(null);
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return;
        }

        console.error("Failed to load overview analytics data", err);
        setOverviewError(
          err instanceof Error && err.message === "unauthorized"
            ? "Sign in to view analytics."
            : hasVisibleOverviewData
              ? "Unable to update analytics."
              : "Unable to load analytics data."
        );
      } finally {
        if (overviewRequestIdRef.current === requestId) {
          setOverviewLoading(false);
          setOverviewRefreshing(false);
        }
      }
    };

    void load();

    return () => {
      controller.abort();
      if (overviewAbortRef.current === controller) {
        overviewAbortRef.current = null;
      }
    };
  }, [overviewRange, analytics, loading, overviewAnalytics, overviewCache]);

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
  const habitSummary = normalizeHabitSummary(analytics?.habit);
  const recentSchedules = analytics?.recentSchedules ?? [];
  const scheduleSummary = analytics?.scheduleSummary;
  const timeBlockPerformance = analytics?.timeBlockPerformance ?? [];
  const overviewTrend = overviewAnalytics?.overviewDaily ?? [];
  const hasOverviewData = overviewAnalytics !== null;

  const longestStreak = habitSummary.longestStreak;
  const currentStreak = habitSummary.currentStreak;
  const routineTrends = habitSummary.routines;
  const streakHistory = habitSummary.streakHistory;
  const activeTabLabel =
    ANALYTICS_TABS.find((tab) => tab.id === activeView)?.label ?? "Analytics";

  let activeContent: ReactNode = null;

  if (activeView === "overview") {
    activeContent = (
      <div className="space-y-4 xl:space-y-5">
        <SectionCard
          className="rounded-[22px]"
        >
          {!hasOverviewData && overviewLoading ? (
            <Skeleton className="h-64" />
          ) : !hasOverviewData && overviewError ? (
            <ErrorState message={overviewError} />
          ) : overviewTrend.length === 0 ? (
            <div
              className={classNames(
                "transition-opacity duration-200",
                overviewRefreshing && "opacity-80"
              )}
            >
              <OverviewPanelStatus
                isRefreshing={overviewRefreshing}
                message={overviewError}
              />
              <EmptyCopy copy="No execution trend data in this range yet." />
            </div>
          ) : (
            <OverviewDiagnosticsSection
              points={overviewTrend}
              efficiencyDebug={overviewAnalytics?.overviewEfficiencyDebug}
              range={overviewAnalytics?.range ?? overviewRange}
              selectedRange={overviewRange}
              onRangeChange={setOverviewRange}
              isRefreshing={overviewRefreshing}
              statusMessage={overviewError}
            />
          )}
        </SectionCard>
      </div>
    );
  } else if (activeView === "execution") {
    activeContent = (
      <div className="space-y-4 xl:space-y-6">
        <SectionCard
          title="Recently completed"
          description="Latest completed events."
        >
          {loading ? (
            <Skeleton className="h-40" />
          ) : error ? (
            <ErrorState message={error} />
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
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr] xl:gap-6">
        <SectionCard
          title="Event status"
          description="Observed scheduled events in the selected range."
        >
          {loading ? (
            <Skeleton className="h-44" />
          ) : error ? (
            <ErrorState message={error} />
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

        <SectionCard
          title="Time Block performance"
          description="How scheduled events are performing inside each Time Block."
        >
          {loading ? (
            <Skeleton className="h-44" />
          ) : error ? (
            <ErrorState message={error} />
          ) : timeBlockPerformance.length === 0 ? (
            <EmptyCopy copy="No Time Block event data in this range yet." />
          ) : (
            <TimeBlockPerformanceList items={timeBlockPerformance} />
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
            <ErrorState message={error} />
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
            <ErrorState message={error} />
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
        <Header activeView={activeView} onViewChange={onViewChange} />
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
}: {
  activeView: AnalyticsView;
  onViewChange: (view: AnalyticsView) => void;
}) {
  const router = useRouter();
  return (
    <header className="mb-3 flex flex-col gap-1.5 sm:mb-5 sm:gap-3">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          onClick={() => router.push("/dashboard")}
          aria-label="Back to dashboard"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-zinc-300 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600 sm:h-9 sm:w-9"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="w-full min-w-0 overflow-x-auto lg:flex lg:justify-center">
          <div className="-mx-1 w-max min-w-full px-1 pb-1 lg:min-w-0">
            <AnalyticsTabs activeView={activeView} onViewChange={onViewChange} />
          </div>
        </div>
      </div>
    </header>
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
    <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/80 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:rounded-xl">
      {ANALYTICS_TABS.map((tab) => {
        const isActive = activeView === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onViewChange(tab.id)}
            aria-pressed={isActive}
            className={classNames(
              "h-7 shrink-0 rounded-md px-2.5 text-[11px] font-medium text-zinc-400 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 motion-reduce:transition-none sm:h-8 sm:rounded-lg sm:px-3.5 sm:text-xs",
              isActive
                ? "border border-zinc-200/90 bg-zinc-100 text-zinc-950 shadow-[0_8px_18px_rgba(0,0,0,0.22)]"
                : "hover:bg-zinc-900/70 hover:text-zinc-100"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
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
  efficiencyDebug,
  range,
  selectedRange,
  onRangeChange,
  isRefreshing,
  statusMessage,
}: {
  points: AnalyticsOverviewDailyPoint[];
  efficiencyDebug?: AnalyticsOverviewEfficiencyDebug;
  range: AnalyticsRange;
  selectedRange: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
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
  const unusedUsableMinutes = Math.max(
    0,
    totalUsableWindowMinutes - totalCompletedMinutes
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
        "space-y-3 transition-opacity duration-200 sm:space-y-5",
        isRefreshing && "opacity-80"
      )}
    >
      <div className="flex flex-col gap-2.5 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">
            Progress Trend
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Range-based XP and usable-time conversion diagnostics.
          </p>
          <OverviewPanelStatus
            isRefreshing={isRefreshing}
            message={statusMessage}
          />
        </div>
        <OverviewRangeSelector
          selectedRange={selectedRange}
          onRangeChange={onRangeChange}
          isRefreshing={isRefreshing}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <OverviewKpiTile
          label="XP"
          value={formatCompactNumber(totalXp)}
          detail={formatRangeSummary(range, points.length)}
        />
        <OverviewKpiTile
          label={averageLabel}
          value={formatAverageXp(averageValue)}
          detail={`Peak ${formatCompactNumber(peakXp)} XP`}
        />
        <OverviewKpiTile
          label="Completed"
          value={formatCompactNumber(completedEvents)}
          detail={`${formatCompactNumber(completedProjects)} projects · ${formatCompactNumber(completedTasks)} tasks · ${formatCompactNumber(completedHabits)} habits`}
        />
        <div className="space-y-1.5">
          <OverviewKpiTile
            label="Efficiency"
            value={`${rangeEfficiencyRate}%`}
            detail={`${totalCompletedMinutes}m / ${totalUsableWindowMinutes}m utilized`}
            secondaryDetail={
              unusedUsableMinutes > 0 ? `${unusedUsableMinutes}m unused` : null
            }
            tone={getEfficiencyTone(rangeEfficiencyRate)}
          />
          {process.env.NODE_ENV !== "production" && efficiencyDebug ? (
            <EfficiencyDebugPanel debug={efficiencyDebug} />
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-[18px] border border-zinc-800 bg-zinc-950/85 sm:rounded-[22px]">
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

function EfficiencyDebugPanel({
  debug,
}: {
  debug: AnalyticsOverviewEfficiencyDebug;
}) {
  return (
    <details className="rounded-md border border-zinc-800 bg-zinc-950/90 px-2 py-1 text-[10px] text-zinc-400">
      <summary className="cursor-pointer select-none uppercase tracking-[0.16em] text-zinc-500">
        Efficiency debug
      </summary>
      <div className="mt-2 space-y-2">
        <div>
          <div>range: {debug.selectedRange}</div>
          <div>start: {debug.startIso}</div>
          <div>end: {debug.endIso}</div>
          <div>completed: {debug.totalCompletedMinutes}m</div>
          <div>usable: {debug.totalUsableWindowMinutes}m</div>
          <div>rate: {debug.rangeEfficiencyRate}%</div>
        </div>
        <div className="space-y-2">
          {debug.perDay.map((day) => (
            <div
              key={`${day.dayKey}:${day.dayStartUtc}`}
              className="border-t border-zinc-900 pt-2 first:border-t-0 first:pt-0"
            >
              <div className="text-zinc-200">
                {day.dayKey}: {day.usableWindowMinutes}m usable,{" "}
                {day.completedMinutes}m completed
              </div>
              <div>capacity source: {day.capacitySource}</div>
              <div>assigned day type: {day.assignedDayTypeId ?? "none"}</div>
              <div>
                merge: {day.intervalsBeforeMergeCount} before /{" "}
                {day.mergedIntervalCount} after
              </div>
              {day.includedSources.length > 0 ? (
                <div className="space-y-0.5">
                  {day.includedSources.map((source) => (
                    <div
                      key={`${day.dayKey}:${source.sourceKind}:${source.sourceId}`}
                    >
                      + {source.label} ({source.sourceKind}){" "}
                      {source.minutesAfterClipping}m
                    </div>
                  ))}
                </div>
              ) : (
                <div>+ no included sources</div>
              )}
              {day.excludedSources.length > 0 ? (
                <div className="space-y-0.5 text-zinc-500">
                  {day.excludedSources.map((source) => (
                    <div
                      key={`${day.dayKey}:excluded:${source.sourceKind}:${source.sourceId}:${source.reason}`}
                    >
                      - {source.label} ({source.sourceKind}) {source.reason}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function OverviewRangeSelector({
  selectedRange,
  onRangeChange,
  isRefreshing,
}: {
  selectedRange: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  isRefreshing: boolean;
}) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex min-w-max items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950/95 p-0.5 sm:rounded-2xl sm:p-1">
        {OVERVIEW_RANGE_OPTIONS.map((option) => {
          const isActive = option.value === selectedRange;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onRangeChange(option.value)}
              aria-pressed={isActive}
              aria-busy={isRefreshing && isActive}
              className={classNames(
                "rounded-lg px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 sm:rounded-xl sm:px-3 sm:py-2 sm:text-[11px] sm:tracking-[0.18em]",
                isActive
                  ? "border border-emerald-500/25 bg-emerald-500/12 text-zinc-50"
                  : "text-zinc-500 hover:bg-zinc-900/90 hover:text-zinc-200",
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

function OverviewKpiTile({
  label,
  value,
  detail,
  secondaryDetail = null,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  secondaryDetail?: string | null;
  tone?: "default" | "good" | "neutral" | "low";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-500/25 bg-emerald-500/10"
      : tone === "low"
        ? "border-amber-500/25 bg-amber-500/10"
        : tone === "neutral"
          ? "border-zinc-700 bg-zinc-950/90"
          : "border-zinc-800 bg-zinc-950/80";
  const valueClass =
    tone === "good"
      ? "text-emerald-100"
      : tone === "low"
        ? "text-amber-100"
        : "text-zinc-50";

  return (
    <div
      className={classNames(
        "rounded-[14px] border px-3 py-2.5 sm:rounded-[18px] sm:px-4 sm:py-3",
        toneClass
      )}
    >
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </div>
      <div
        className={classNames(
          "mt-1 text-lg font-semibold sm:mt-1.5 sm:text-2xl",
          valueClass
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-zinc-500 sm:mt-1 sm:text-xs">{detail}</div>
      {secondaryDetail ? (
        <div className="mt-0.5 text-[10px] text-zinc-600 sm:text-[11px]">
          {secondaryDetail}
        </div>
      ) : null}
    </div>
  );
}

function OverviewLineChart({
  points,
  range,
}: {
  points: AnalyticsOverviewDailyPoint[];
  range: AnalyticsRange;
}) {
  const [activeIndex, setActiveIndex] = useState(points.length - 1);

  useEffect(() => {
    setActiveIndex(points.length > 0 ? points.length - 1 : 0);
  }, [points, range]);

  const width = 720;
  const height = 320;
  const padding = { top: 16, right: 12, bottom: 42, left: 38 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = points.map((point) => point.xpGained);
  const totalXp = values.reduce((sum, value) => sum + value, 0);
  const rawMaxValue = values.length > 0 ? Math.max(...values) : 0;
  const yMax = getTrendYAxisMax(rawMaxValue);
  const isEmpty = rawMaxValue <= 0;
  const activePoint = points[Math.min(activeIndex, points.length - 1)] ?? null;
  const yTickValues = buildYTickValues(yMax);
  const svgPoints = points.map((point, index) => {
    const x =
      points.length === 1
        ? padding.left + chartWidth / 2
        : padding.left + (index / (points.length - 1)) * chartWidth;
    const y =
      padding.top + chartHeight - (point.xpGained / yMax) * chartHeight;
    return { x, y, point };
  });
  const linePath = svgPoints
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`
    )
    .join(" ");
  const areaPath = [
    `M${padding.left},${padding.top + chartHeight}`,
    ...svgPoints.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`),
    `L${padding.left + chartWidth},${padding.top + chartHeight}`,
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
  const peakPoint = getTrendPeakPoint(points);
  const lowPoint = getTrendLowPoint(points);

  return (
    <div className="space-y-0">
      <div className="flex flex-col gap-2.5 border-b border-zinc-800 px-3 py-3 sm:px-4 sm:py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">
            XP
          </div>
          <div className="mt-1 text-xl font-semibold text-zinc-50 sm:mt-1.5 sm:text-3xl">
            {formatCompactNumber(activePoint?.xpGained ?? 0)}
          </div>
          <div className="mt-1 text-sm text-zinc-500">
            {formatTrendActiveLabel(activePoint?.date ?? null, range)}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-right text-[11px] sm:gap-2 sm:text-xs lg:min-w-[260px]">
          <ActiveTrendMetric
            label="Completed"
            value={formatCompactNumber(activePoint?.completedEvents ?? 0)}
            tone="completed"
          />
          <ActiveTrendMetric
            label="Scheduled"
            value={formatCompactNumber(activePoint?.scheduledEvents ?? 0)}
            tone="scheduled"
          />
          <ActiveTrendMetric
            label="Missed"
            value={formatCompactNumber(activePoint?.missedEvents ?? 0)}
            tone="missed"
          />
        </div>
      </div>

      <div className="space-y-2.5 px-3 py-3 sm:px-4 sm:py-4">
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          <ChartMetaTile
            label="Peak"
            value={formatCompactNumber(peakPoint?.xpGained ?? 0)}
            detail={formatTrendPointSummary(peakPoint, range)}
          />
          <ChartMetaTile
            label="Low"
            value={formatCompactNumber(lowPoint?.xpGained ?? 0)}
            detail={formatTrendPointSummary(lowPoint, range)}
          />
          <ChartMetaTile
            label="Total XP"
            value={formatCompactNumber(totalXp)}
            detail={formatRangeSummary(range, points.length)}
          />
        </div>

        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-[190px] w-full sm:h-[248px] md:h-[300px] lg:h-[320px]"
          >
            <defs>
              <linearGradient id="overviewDailyArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(16,185,129,0.22)" />
                <stop offset="100%" stopColor="rgba(16,185,129,0.01)" />
              </linearGradient>
              <linearGradient id="overviewDailyLine" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#34d399" />
              </linearGradient>
            </defs>

            {yTickValues.map((value) => {
              const ratio = yMax === 0 ? 0 : value / yMax;
              const y = padding.top + chartHeight - ratio * chartHeight;
              return (
                <g key={`grid-${value}`}>
                  <line
                    x1={padding.left}
                    x2={padding.left + chartWidth}
                    y1={y}
                    y2={y}
                    stroke="rgba(63,63,70,0.42)"
                  />
                  <text
                    x={padding.left - 10}
                    y={y + 5}
                    textAnchor="end"
                    fill="rgba(161,161,170,0.82)"
                    fontSize="12"
                  >
                    {formatCompactNumber(value)}
                  </text>
                </g>
              );
            })}

            <line
              x1={padding.left}
              x2={padding.left + chartWidth}
              y1={padding.top + chartHeight}
              y2={padding.top + chartHeight}
              stroke="rgba(82,82,91,0.6)"
            />

            {!isEmpty ? (
              <>
                <path d={areaPath} fill="url(#overviewDailyArea)" />
                <path
                  d={linePath}
                  fill="none"
                  stroke="url(#overviewDailyLine)"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {activePoint ? (
                  <line
                    x1={svgPoints[activeIndex]?.x ?? 0}
                    x2={svgPoints[activeIndex]?.x ?? 0}
                    y1={padding.top}
                    y2={padding.top + chartHeight}
                    stroke="rgba(113,113,122,0.45)"
                    strokeDasharray="3 5"
                  />
                ) : null}

                {svgPoints.map(({ x, y, point }, index) => {
                  const isActive = index === activeIndex;
                  return (
                    <g key={`${point.date}-${index}`}>
                      <circle
                        cx={x}
                        cy={y}
                        r={isActive ? 4 : 2.5}
                        fill={isActive ? "#d1fae5" : "#34d399"}
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
                  y1={padding.top + chartHeight * 0.55}
                  y2={padding.top + chartHeight * 0.55}
                  stroke="rgba(63,63,70,0.55)"
                  strokeDasharray="4 6"
                />
                <text
                  x={padding.left + chartWidth / 2}
                  y={padding.top + chartHeight * 0.46}
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
                y={height - 20}
                textAnchor="middle"
                fill="rgba(161,161,170,0.9)"
                fontSize="12"
              >
                <tspan x={label.x} dy="0">
                  {label.label}
                </tspan>
                <tspan
                  x={label.x}
                  dy="14"
                  fill="rgba(113,113,122,0.92)"
                  fontSize="11"
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
                      onMouseEnter={() => setActiveIndex(index)}
                      onFocus={() => setActiveIndex(index)}
                      onClick={() => setActiveIndex(index)}
                      className="pointer-events-auto absolute bottom-0 top-0 -translate-x-1/2 focus:outline-none"
                      style={{
                        left: `${((point.x / width) * 100).toFixed(4)}%`,
                        width: `${Math.max(100 / Math.max(points.length, 1), 2)}%`,
                      }}
                      aria-label={`${formatTrendActiveLabel(point.point.date, range)} ${point.point.xpGained} XP`}
                    />
                  ))
                : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActiveTrendMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "completed" | "scheduled" | "missed";
}) {
  const toneClass =
    tone === "completed"
      ? "border-emerald-500/18 text-emerald-100"
      : tone === "missed"
        ? "border-rose-500/18 text-rose-100"
        : "border-zinc-800 text-zinc-200";

  return (
    <div
      className={classNames(
        "rounded-xl border bg-zinc-950/75 px-2 py-1.5 sm:rounded-2xl sm:px-3 sm:py-2",
        toneClass
      )}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
        {label}
      </div>
      <div className="mt-0.5 text-xs font-semibold sm:mt-1 sm:text-base">{value}</div>
    </div>
  );
}

function ChartMetaTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[12px] border border-zinc-800 bg-zinc-950/55 px-2.5 py-2 sm:rounded-[16px] sm:px-3 sm:py-2.5">
      <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-600">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-zinc-100 sm:mt-1 sm:text-lg">
        {value}
      </div>
      <div className="truncate text-xs text-zinc-500">{detail}</div>
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
    return `${pointsCount} hourly buckets`;
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

function formatTrendPointSummary(
  point: AnalyticsOverviewDailyPoint | null,
  range: AnalyticsRange
) {
  if (!point) {
    return "No data";
  }
  return formatTrendActiveLabel(point.date, range);
}

function getEfficiencyTone(efficiencyRate: number) {
  if (efficiencyRate >= 70) {
    return "good" as const;
  }
  if (efficiencyRate >= 45) {
    return "neutral" as const;
  }
  return "low" as const;
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

function getTrendPeakPoint(points: AnalyticsOverviewDailyPoint[]) {
  return points.reduce<AnalyticsOverviewDailyPoint | null>(
    (best, point) => {
      if (!best || point.xpGained > best.xpGained) {
        return point;
      }
      return best;
    },
    null
  );
}

function getTrendLowPoint(points: AnalyticsOverviewDailyPoint[]) {
  return points.reduce<AnalyticsOverviewDailyPoint | null>(
    (lowest, point) => {
      if (!lowest || point.xpGained < lowest.xpGained) {
        return point;
      }
      return lowest;
    },
    null
  );
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

function TimeBlockPerformanceList({
  items,
}: {
  items: AnalyticsTimeBlockPerformance[];
}) {
  const parseStartTime = (value: string | null) => {
    if (!value) {
      return null;
    }

    const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) {
      return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] ?? "0");

    if (
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes) ||
      !Number.isInteger(seconds) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59 ||
      seconds < 0 ||
      seconds > 59
    ) {
      return null;
    }

    return hours * 3600 + minutes * 60 + seconds;
  };

  const formatStartTime = (value: string | null) =>
    formatLocalTime(value) ?? "Anytime";

  const formatMinutesText = (completedMinutes: number, totalMinutes: number) =>
    `${completedMinutes}/${totalMinutes} min`;

  const getPercentText = (value: number) => `${Math.round(value)}%`;

  const getTimeBlockReadout = (item: (typeof items)[number]) => {
    if (item.plannedEvents === 0) {
      return {
        title: "No Events planned",
        detail: "This Time Block has no scheduled Events yet.",
        tone: "idle",
      } as const;
    }
    if (item.completedEvents === 0 && item.missedEvents > 0) {
      return {
        title: "No completions",
        detail: `${item.missedEvents} of ${item.plannedEvents} Events were missed.`,
        tone: "missed",
      } as const;
    }
    if (item.completionRate >= 80 && item.missedEvents === 0) {
      return {
        title: "Strong block",
        detail: `${item.completedEvents} of ${item.plannedEvents} Events completed with no misses.`,
        tone: "completed",
      } as const;
    }
    if (item.missedRate >= 40) {
      return {
        title: "Too much planned",
        detail: `${item.missedEvents} of ${item.plannedEvents} Events were missed.`,
        tone: "missed",
      } as const;
    }
    if (item.scheduledEvents > 0) {
      return {
        title: "Still active",
        detail: `${item.scheduledEvents} Events remain Scheduled.`,
        tone: "scheduled",
      } as const;
    }
    return {
      title: "Partial completion",
      detail: `${item.completedEvents} of ${item.plannedEvents} Events completed.`,
      tone: "partial",
    } as const;
  };

  const sortedItems = useMemo(() => {
    return [...items].sort((left, right) => {
      const leftStart = parseStartTime(left.startLocal);
      const rightStart = parseStartTime(right.startLocal);

      if (leftStart == null && rightStart == null) {
        return left.label.localeCompare(right.label);
      }
      if (leftStart == null) {
        return 1;
      }
      if (rightStart == null) {
        return -1;
      }
      if (leftStart !== rightStart) {
        return leftStart - rightStart;
      }
      return left.label.localeCompare(right.label);
    });
  }, [items]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex((currentIndex) => {
      if (sortedItems.length === 0) {
        return 0;
      }

      return Math.min(Math.max(currentIndex, 0), sortedItems.length - 1);
    });
  }, [sortedItems]);

  const selectedItem = sortedItems[selectedIndex];

  if (!selectedItem) {
    return null;
  }

  const readout = getTimeBlockReadout(selectedItem);
  const timeRange =
    formatLocalTimeRange(selectedItem.startLocal, selectedItem.endLocal) ??
    "Anytime";
  const completedRatioText = `${selectedItem.completedEvents}/${selectedItem.plannedEvents}`;
  const completionPercentText = getPercentText(selectedItem.completionRate);
  const missedPercentText = getPercentText(selectedItem.missedRate);
  const timeText = formatMinutesText(
    selectedItem.completedMinutes,
    selectedItem.totalMinutes
  );
  const minuteCompletionRate =
    selectedItem.totalMinutes > 0
      ? (selectedItem.completedMinutes / selectedItem.totalMinutes) * 100
      : 0;
  const breakdownMax = Math.max(
    selectedItem.completedEvents,
    selectedItem.scheduledEvents,
    selectedItem.missedEvents
  );
  const breakdownSegments = [
    {
      key: "completed",
      label: "Completed",
      value: selectedItem.completedEvents,
      className: "bg-teal-400/75",
    },
    {
      key: "scheduled",
      label: "Scheduled",
      value: selectedItem.scheduledEvents,
      className: "bg-violet-400/60",
    },
    {
      key: "missed",
      label: "Missed",
      value: selectedItem.missedEvents,
      className: "bg-rose-400/65",
    },
  ] as const;
  const readoutToneClass = {
    idle: "text-zinc-400",
    completed: "text-teal-300",
    scheduled: "text-violet-300",
    missed: "text-rose-300",
    partial: "text-zinc-300",
  }[readout.tone];
  const rowBarWidth = (value: number) =>
    value <= 0 ? "0%" : `${Math.max(4, Math.min(value, 100))}%`;

  return (
    <div className="space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 sm:space-y-3 sm:p-4">
      <div className="flex min-h-9 items-center justify-between gap-2.5 border-b border-zinc-800 pb-2.5 sm:min-h-10 sm:gap-3 sm:pb-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-100">
            Time Block Analytics
          </div>
          <div className="text-xs text-zinc-400">Scheduled Events by block</div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="hidden text-zinc-400 sm:block">{timeRange}</div>
          <button
            type="button"
            onClick={() =>
              setSelectedIndex((currentIndex) => Math.max(0, currentIndex - 1))
            }
            disabled={selectedIndex === 0}
            className="rounded-md border border-zinc-800 bg-zinc-900/40 px-2 py-1 text-zinc-300 transition hover:bg-zinc-900/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Prev
          </button>
          <div className="min-w-[34px] text-center text-zinc-500">
            {selectedIndex + 1} / {sortedItems.length}
          </div>
          <button
            type="button"
            onClick={() =>
              setSelectedIndex((currentIndex) =>
                Math.min(sortedItems.length - 1, currentIndex + 1)
              )
            }
            disabled={selectedIndex === sortedItems.length - 1}
            className="rounded-md border border-zinc-800 bg-zinc-900/40 px-2 py-1 text-zinc-300 transition hover:bg-zinc-900/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      <div className="grid rounded-xl border border-zinc-800 bg-zinc-900/35 sm:grid-cols-4">
        {[
          {
            label: "Completion",
            value: completedRatioText,
            helper: `${selectedItem.plannedEvents} Scheduled`,
          },
          {
            label: "Rate",
            value: completionPercentText,
            helper:
              selectedItem.scheduledEvents > 0
                ? `${selectedItem.scheduledEvents} Scheduled`
                : "No Scheduled left",
          },
          {
            label: "Missed",
            value: `${selectedItem.missedEvents}`,
            helper:
              selectedItem.missedEvents > 0
                ? missedPercentText
                : "No Missed Events",
          },
          {
            label: "Time",
            value: timeText,
            helper:
              selectedItem.totalMinutes > 0
                ? getPercentText(minuteCompletionRate)
                : "No minutes tracked",
          },
        ].map((metric, index) => (
          <div
            key={metric.label}
            className={classNames(
              "px-3 py-2.5 sm:px-4 sm:py-3",
              index > 0 && "border-t border-zinc-800 sm:border-l sm:border-t-0"
            )}
          >
            <div className="text-xs text-zinc-400">{metric.label}</div>
            <div className="mt-1 text-lg font-semibold text-zinc-100">
              {metric.value}
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500">{metric.helper}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
        <div className="grid grid-cols-[76px_minmax(0,1.1fr)_minmax(120px,1fr)_56px_72px] gap-3 border-b border-zinc-800 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
          <span>Start</span>
          <span>Time Block</span>
          <span>Completed</span>
          <span className="text-right">Rate</span>
          <span className="text-right">Missed</span>
        </div>
        <div className="divide-y divide-zinc-800">
          {sortedItems.map((item, index) => {
            const isSelected = index === selectedIndex;
            const timeLabel = formatStartTime(item.startLocal);
            const ratioText = `${item.completedEvents}/${item.plannedEvents}`;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedIndex(index)}
                aria-pressed={isSelected}
                title={item.label}
                className={classNames(
                  "grid h-10 w-full grid-cols-[76px_minmax(0,1.1fr)_minmax(120px,1fr)_56px_72px] items-center gap-3 px-3 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/50",
                  isSelected
                    ? "bg-violet-500/10 text-zinc-50"
                    : "bg-transparent text-zinc-300 hover:bg-zinc-900/70"
                )}
              >
                <span className="text-xs text-zinc-400">{timeLabel}</span>
                <div className="truncate text-sm font-medium text-zinc-100">
                  {item.label}
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="relative h-full rounded-full bg-violet-300/75"
                      style={{ width: rowBarWidth(item.completionRate) }}
                    >
                      {item.missedEvents > 0 ? (
                        <span className="absolute right-0 top-0 h-full w-1 rounded-full bg-rose-300/80" />
                      ) : null}
                    </div>
                  </div>
                  <span className="hidden text-[11px] text-zinc-500 sm:inline">
                    {ratioText}
                  </span>
                </div>
                <span className="text-right text-xs text-zinc-300">
                  {getPercentText(item.completionRate)}
                </span>
                <span className="text-right text-xs text-zinc-400">
                  {item.missedEvents > 0 ? `${item.missedEvents} missed` : "0"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            Outcome Breakdown
          </div>
          {breakdownMax === 0 ? (
            <div className="mt-3 space-y-2">
              <div className="h-1.5 rounded-full bg-zinc-800" />
              <div className="text-xs text-zinc-500">No Events in this Time Block.</div>
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {breakdownSegments.map((segment) => (
                <div
                  key={segment.key}
                  className="grid grid-cols-[68px_minmax(0,1fr)_20px] items-center gap-2 text-xs"
                >
                  <span className="text-zinc-400">{segment.label}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={classNames("h-full rounded-full", segment.className)}
                      style={{
                        width: `${(segment.value / breakdownMax) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-right text-zinc-100">{segment.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            Readout
          </div>
          <div className="mt-3 space-y-2">
            <div className="text-sm font-medium text-zinc-100">{readout.title}</div>
            <div className="text-xs leading-5 text-zinc-400">{readout.detail}</div>
            <div className={classNames("text-xs font-medium", readoutToneClass)}>
              {selectedItem.label}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            Time Utilization
          </div>
          <div className="mt-3 space-y-2">
            {selectedItem.totalMinutes > 0 ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-zinc-400">Minutes</span>
                  <span className="text-sm font-medium text-zinc-100">
                    {timeText}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-zinc-400">Completed</span>
                  <span className="text-sm text-zinc-300">
                    {getPercentText(minuteCompletionRate)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-violet-300/75"
                    style={{ width: `${Math.max(0, Math.min(minuteCompletionRate, 100))}%` }}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <div className="h-1.5 rounded-full bg-zinc-800" />
                <div className="text-xs text-zinc-500">No minutes in this Time Block.</div>
              </div>
            )}
            <div className="border-t border-zinc-800 pt-2 text-xs text-zinc-500">
              {timeRange}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatLocalTimeRange(
  startLocal: string | null,
  endLocal: string | null
) {
  const startLabel = formatLocalTime(startLocal);
  const endLabel = formatLocalTime(endLocal);

  if (startLabel && endLabel) {
    return `${startLabel} to ${endLabel}`;
  }
  return null;
}

function formatLocalTime(value: string | null) {
  if (!value) {
    return null;
  }
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = match[2];
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) {
    return null;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes} ${period}`;
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
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={classNames(
        "rounded-xl border border-zinc-800 bg-zinc-950/85 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur sm:rounded-2xl sm:p-5",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2.5 sm:gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white sm:text-lg">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs text-zinc-400 sm:text-sm">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-3 sm:mt-4">{children}</div>
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
