"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  CheckSquare,
  FolderKanban,
  BatteryCharging,
  Clock,
  Flame,
  ArrowLeft,
  Bookmark,
  PenLine,
  Share2,
  Sparkles,
} from "lucide-react";
import { CircularProgress } from "@/components/visuals/CircularProgress";
import { SkillMasterySection } from "@/app/analytics/_sections/SkillMasterySection";
import type {
  AnalyticsResponse,
  AnalyticsKpiId,
  AnalyticsHabitSummary,
  AnalyticsHabitRoutine,
  AnalyticsHabitPerformance,
  AnalyticsHabitStreakPoint,
  AnalyticsHabitWeeklyReflection,
  AnalyticsScheduleCompletion,
} from "@/types/analytics";

const KPI_ICON_MAP: Record<
  AnalyticsKpiId,
  ComponentType<{ className?: string }>
> = {
  skill_xp: TrendingUp,
  tasks: CheckSquare,
  projects: FolderKanban,
  monuments: BatteryCharging,
  windows: Clock,
  habits: Flame,
};

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

function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num);
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}`;
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
        .map((item, index) => {
          if (!item || typeof item !== "object") {
            return null;
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
            typeof reflection.bestDay === "string" ? reflection.bestDay : "—";
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

          return {
            id,
            weekLabel,
            streak,
            bestDay,
            lesson,
            pinned,
            recommendation,
          } satisfies AnalyticsHabitWeeklyReflection;
        })
        .filter(
          (entry): entry is AnalyticsHabitWeeklyReflection => entry !== null
        )
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

interface Skill {
  id: string;
  name: string;
  level: number;
  progress: number; // 0-100
  xpGained: number;
}

interface Project {
  id: string;
  title: string;
  progress: number;
  tasksDone: number;
  tasksTotal: number;
}

interface Monument {
  id: string;
  title: string;
  progress: number;
  goalCount: number;
}

interface ActivityEvent {
  id: string;
  label: string;
  date: string;
}

export default function AnalyticsDashboard() {
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d" | "custom">(
    "30d"
  );
  const [skillsView, setSkillsView] = useState<"grid" | "list">("grid");
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const focusInsightsRef = useRef<HTMLUListElement | null>(null);
  const [tickerPaused, setTickerPaused] = useState(false);
  const [tickerLayoutVersion, setTickerLayoutVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const load = async () => {
      const rangeParam = dateRange === "custom" ? "30d" : dateRange;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/analytics?range=${rangeParam}`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) {
          const message =
            response.status === 401
              ? "Sign in to view analytics."
              : "Unable to load analytics data.";
          if (!cancelled) {
            setAnalytics(null);
            setError(message);
          }
          return;
        }
        const payload = (await response.json()) as AnalyticsResponse;
        if (!cancelled) {
          setAnalytics(payload);
          setLastUpdated(payload.generatedAt);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        console.error("Failed to load analytics data", err);
        setAnalytics(null);
        setError("Unable to load analytics data.");
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
  }, [dateRange]);

  const kpis = (analytics?.kpis ?? []).map((kpi) => ({
    ...kpi,
    icon: KPI_ICON_MAP[kpi.id],
  }));
  const skills = analytics?.skills ?? [];
  const projects = analytics?.projects ?? [];
  const monuments = analytics?.monuments ?? [];
  const windows = analytics?.windows ?? { heatmap: [], energy: [] };
  const activity = analytics?.activity ?? [];
  const projectVelocity = analytics?.projectVelocity ?? [];
  const habitSummary = normalizeHabitSummary(analytics?.habit);
  const recentSchedules = analytics?.recentSchedules ?? [];

  const bestSkill =
    skills.length > 0
      ? skills.reduce((prev, curr) =>
          curr.progress > prev.progress ? curr : prev
        )
      : null;
  const leadProject =
    projects.length > 0
      ? projects.reduce((prev, curr) =>
          curr.progress > prev.progress ? curr : prev
        )
      : null;
  const strongestKpi =
    kpis.length > 0
      ? kpis.reduce((prev, curr) =>
          Math.abs(curr.delta) > Math.abs(prev.delta) ? curr : prev
        )
      : null;
  const totalEnergy = windows.energy.reduce(
    (sum, entry) => sum + (entry.value ?? 0),
    0
  );
  const dominantEnergy =
    windows.energy.length > 0
      ? windows.energy.reduce((prev, curr) =>
          curr.value > prev.value ? curr : prev
        )
      : null;
  const dominantEnergyShare =
    dominantEnergy && totalEnergy > 0
      ? Math.round((dominantEnergy.value / totalEnergy) * 100)
      : 0;

  const longestStreak = habitSummary.longestStreak;
  const currentStreak = habitSummary.currentStreak;
  const routineTrends = habitSummary.routines;
  const streakHistory = habitSummary.streakHistory;
  const bestTimes = habitSummary.bestTimes;
  const bestDays = habitSummary.bestDays;
  const weeklyReflections = habitSummary.weeklyReflections;

  const focusInsights = [
    {
      id: "skill",
      title: "Momentum skill",
      metric: bestSkill?.name ?? "—",
      helper:
        bestSkill != null
          ? `${bestSkill.progress}% toward next level`
          : "Track progress as you add skills",
    },
    {
      id: "project",
      title: "Lead project",
      metric: leadProject?.title ?? "—",
      helper:
        leadProject != null
          ? `${leadProject.tasksDone}/${leadProject.tasksTotal} tasks complete`
          : "Kick off a project to see insights",
    },
    {
      id: "energy",
      title: "Dominant energy",
      metric: dominantEnergy?.label ?? "—",
      helper:
        dominantEnergy != null
          ? `${dominantEnergyShare}% of focus windows`
          : "Log windows to unlock energy data",
    },
    {
      id: "growth",
      title: "Biggest delta",
      metric: strongestKpi?.label ?? "—",
      helper:
        strongestKpi != null
          ? `${formatDelta(strongestKpi.delta)} vs last period`
          : "No KPIs yet",
    },
  ];
  const tickerInsights =
    focusInsights.length > 0 ? [...focusInsights, ...focusInsights] : [];

  useEffect(() => {
    const track = focusInsightsRef.current;
    if (!track || tickerInsights.length === 0) {
      return;
    }

    const container = track.parentElement;
    const containerWidth = container?.clientWidth ?? track.clientWidth;
    const perSetCount = focusInsights.length;
    const markerChild =
      perSetCount > 0
        ? (track.children.item(perSetCount) as HTMLElement | null)
        : null;
    const loopWidth = markerChild?.offsetLeft ?? track.scrollWidth / 2;

    if (!loopWidth || loopWidth <= containerWidth + 8) {
      track.style.transform = "translateX(0)";
      return;
    }

    let animationFrame: number;
    let lastTimestamp: number | null = null;
    let offset = 0;
    const SPEED_PX_PER_SEC = 60;

    const tick = (timestamp: number) => {
      if (tickerPaused) {
        lastTimestamp = timestamp;
        animationFrame = window.requestAnimationFrame(tick);
        return;
      }

      if (lastTimestamp != null) {
        const deltaSeconds = (timestamp - lastTimestamp) / 1000;
        offset += deltaSeconds * SPEED_PX_PER_SEC;
        if (loopWidth > 0) {
          offset = offset % loopWidth;
        }
        track.style.transform = `translateX(-${offset}px)`;
      }
      lastTimestamp = timestamp;
      animationFrame = window.requestAnimationFrame(tick);
    };

    track.style.transform = "translateX(0)";
    animationFrame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      track.style.transform = "";
    };
  }, [
    loading,
    error,
    tickerInsights.length,
    tickerPaused,
    tickerLayoutVersion,
    focusInsights.length,
  ]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const track = focusInsightsRef.current;
    if (!track) {
      return;
    }
    const observer = new ResizeObserver(() => {
      setTickerLayoutVersion((version) => version + 1);
    });
    observer.observe(track);
    if (track.parentElement) {
      observer.observe(track.parentElement);
    }
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#050505] via-[#080808] to-[#050505] text-[#E6E6EB]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[-40%] h-[520px] bg-[radial-gradient(circle_at_top,rgba(248,113,113,0.35),transparent_65%)] blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl space-y-10 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <Header
          dateRange={dateRange}
          onRangeChange={setDateRange}
          lastUpdated={lastUpdated ?? undefined}
        />

        <SectionCard
          title="Focus insights"
          description="Quick cues for where to lean in next."
          className="scroll-mt-8"
          id="planning"
        >
          {loading ? (
            <Skeleton className="h-48" />
          ) : error ? (
            <ErrorState message={error} />
          ) : (
            <div className="relative overflow-hidden">
              <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#050505] via-[#050505]/60 to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#050505] via-[#050505]/60 to-transparent" />
              <ul
                ref={focusInsightsRef}
                className="flex flex-nowrap gap-4 pb-2 will-change-transform"
                onMouseEnter={() => setTickerPaused(true)}
                onMouseLeave={() => setTickerPaused(false)}
                onFocusCapture={() => setTickerPaused(true)}
                onBlurCapture={() => setTickerPaused(false)}
                aria-live="off"
              >
                {tickerInsights.map((insight, index) => (
                  <li
                    key={`${insight.id}-${index}`}
                    className="min-w-[240px] shrink-0 rounded-2xl border border-[#1F1F1F] bg-gradient-to-br from-[#1A1A1A]/80 via-[#0D0D0D]/80 to-[#050505]/80 p-4 shadow-[0_12px_30px_rgba(5,7,12,0.35)]"
                  >
                    <span className="text-xs uppercase tracking-[0.2em] text-[#6E7A96]">
                      {insight.title}
                    </span>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {insight.metric}
                    </div>
                    <p className="mt-1 text-sm text-[#99A4BD]">
                      {insight.helper}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <SkillMasterySection
              skills={skills}
              loading={loading}
              error={error}
              defaultExpanded={false}
            />

            <SectionCard
              title="Recently completed"
              description="A snapshot of the latest schedule blocks you crossed off."
            >
              {loading ? (
                <Skeleton className="h-56" />
              ) : error ? (
                <ErrorState message={error} />
              ) : recentSchedules.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#2B2B2B] bg-gradient-to-br from-[#1A1A1A] via-[#0D0D0D] to-[#050505] p-6 text-center text-sm text-[#6E7A96]">
                  Wrap a scheduled task, project, or habit to see it showcased
                  here.
                </div>
              ) : (
                <RecentScheduleShowcase items={recentSchedules} />
              )}
            </SectionCard>
          </div>

          <SectionCard
            title="Habits & streaks"
            description="Consistency builds momentum across your routines."
          >
            {loading ? (
              <Skeleton className="h-56" />
            ) : error ? (
              <ErrorState message={error} />
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                  <DailyConsistencyCard summary={habitSummary} />
                  <StreakTrendCard
                    currentStreak={currentStreak}
                    longestStreak={longestStreak}
                    history={streakHistory}
                  />
                </div>
                <div className="rounded-2xl border border-[#1F1F1F] bg-gradient-to-br from-[#1A1A1A]/80 via-[#0D0D0D]/80 to-[#050505]/80 p-4 sm:p-5">
                  <RoutineHeatmap routines={routineTrends} />
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <BestPerformanceList
                    title="Best time slots"
                    emptyLabel="Log routines to surface timing insights."
                    data={bestTimes}
                  />
                  <BestPerformanceList
                    title="Most consistent days"
                    emptyLabel="Add more entries to reveal pattern days."
                    data={bestDays}
                  />
                </div>
                <div className="rounded-2xl border border-[#1F1F1F] bg-gradient-to-br from-[#1A1A1A]/80 via-[#0D0D0D]/80 to-[#050505]/80 p-4 sm:p-5">
                  <WeeklyReflectionPanel reflections={weeklyReflections} />
                </div>
                <div className="flex justify-end">
                  <Link
                    href="#"
                    className="inline-flex items-center gap-2 text-sm font-medium text-[#FECACA] transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F87171]"
                  >
                    Review rituals<span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <SectionCard
            title="Project delivery"
            description="Ship work by keeping throughput steady across weeks."
          >
            {loading ? (
              <Skeleton className="h-56" />
            ) : error ? (
              <ErrorState message={error} />
            ) : (
              <div className="space-y-6">
                <BarChart data={projectVelocity} />
                <div className="grid gap-4 sm:grid-cols-2">
                  {projects.map((p) => (
                    <ProjectCard key={p.id} project={p} />
                  ))}
                </div>
                <div className="flex justify-end">
                  <Link
                    href="/projects"
                    className="inline-flex items-center gap-2 text-sm font-medium text-[#FECACA] transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F87171]"
                  >
                    Open projects<span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Monument progress"
            description="Big-picture milestones that anchor your goals."
          >
            {loading ? (
              <Skeleton className="h-56" />
            ) : error ? (
              <ErrorState message={error} />
            ) : monuments.length === 0 ? (
              <EmptyState title="No monuments yet" cta="Add Monument" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {monuments.map((m) => (
                  <MonumentCard key={m.id} monument={m} />
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <SectionCard
            title="Window energy mix"
            description="Where you’re investing your scheduled focus time."
          >
            {loading ? (
              <Skeleton className="h-56" />
            ) : error ? (
              <ErrorState message={error} />
            ) : windows.energy.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#2B2B2B] bg-gradient-to-br from-[#1A1A1A] via-[#0D0D0D] to-[#050505] p-6 text-center text-sm text-[#6E7A96]">
                Log a few focus windows to see the energy breakdown.
              </div>
            ) : (
              <DonutChart data={windows.energy} />
            )}
          </SectionCard>

          <SectionCard
            title="Activity feed"
            description="Highlights from tasks, projects, and rituals."
            id="logs"
          >
            {loading ? (
              <Skeleton className="h-56" />
            ) : error ? (
              <ErrorState message={error} />
            ) : (
              <>
                <ActivityTimeline events={activity} />
                <div className="mt-6 flex justify-end">
                  <button className="inline-flex items-center gap-2 rounded-full border border-[#272727] bg-[#080808] px-4 py-2 text-sm font-medium text-[#FECACA] transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F87171]">
                    Show more
                  </button>
                </div>
              </>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function Header({
  dateRange,
  onRangeChange,
  lastUpdated,
}: {
  dateRange: "7d" | "30d" | "90d" | "custom";
  onRangeChange: (range: "7d" | "30d" | "90d" | "custom") => void;
  lastUpdated?: string;
}) {
  const router = useRouter();
  const updatedAt = lastUpdated ? new Date(lastUpdated) : new Date();
  return (
    <header className="overflow-hidden rounded-3xl border border-[#191919] bg-gradient-to-br from-[#1F1F1F] via-[#0F0F0F] to-[#050505] px-4 py-5 shadow-[0_30px_80px_rgba(7,10,16,0.55)] sm:px-6 sm:py-8">
      <div className="flex flex-col gap-5 sm:gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="space-y-4 sm:space-y-6">
          <div className="flex items-start gap-3 sm:items-center sm:gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              aria-label="Back to dashboard"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#272727] bg-[#080808] text-[#FECACA] transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F87171] sm:h-11 sm:w-11"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="mt-2 text-2xl font-semibold text-white sm:mt-3 sm:text-4xl">
                Analytics
              </h1>
              <p className="mt-2 max-w-xl text-xs text-[#9DA6BB] sm:text-sm">
                An integrated view of how your skills, projects, and rituals are
                compounding.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-[#8A94AB] sm:gap-3 sm:text-xs">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#272727] bg-[#080808] px-3 py-1">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-[#6DD3A8]"
              />
              Systems nominal
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#272727] bg-[#080808] px-3 py-1">
              Updated{" "}
              {new Intl.DateTimeFormat("en-US", {
                month: "long",
                day: "numeric",
              }).format(updatedAt)}
            </span>
          </div>
        </div>
        <DateRangeSelector value={dateRange} onChange={onRangeChange} />
      </div>
    </header>
  );
}

function DateRangeSelector({
  value,
  onChange,
}: {
  value: "7d" | "30d" | "90d" | "custom";
  onChange: (range: "7d" | "30d" | "90d" | "custom") => void;
}) {
  const ranges: { value: "7d" | "30d" | "90d" | "custom"; label: string }[] = [
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    { value: "90d", label: "90 days" },
    { value: "custom", label: "Custom" },
  ];
  return (
    <div className="flex flex-col items-end gap-3 text-right">
      <div className="inline-flex items-center gap-1 rounded-full border border-[#2B2B2B] bg-[#0A0A0A] p-1 shadow-[0_12px_30px_rgba(7,9,14,0.45)]">
        {ranges.map((range) => {
          const active = value === range.value;
          return (
            <button
              key={range.value}
              type="button"
              onClick={() => onChange(range.value)}
              className={classNames(
                "min-w-[72px] rounded-full px-3 py-1.5 text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F87171]/80",
                active
                  ? "bg-[#F87171] text-white shadow-[0_12px_30px_rgba(248,113,113,0.45)]"
                  : "text-[#A1ADC7] hover:text-white"
              )}
            >
              {range.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SkillCard({ skill, view }: { skill: Skill; view: "grid" | "list" }) {
  const size = view === "grid" ? 88 : 68;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (skill.progress / 100) * circumference;
  return (
    <div
      className={classNames(
        "group rounded-2xl border border-[#1B1B1B] bg-[#101010]/90 p-5 transition hover:border-[#F87171]/60 hover:shadow-[0_18px_40px_rgba(8,10,16,0.4)]",
        view === "grid"
          ? "flex flex-col items-center gap-4 text-center"
          : "flex items-center justify-between gap-4"
      )}
      aria-label={`${skill.name} progress`}
    >
      <div
        className={classNames(
          "relative flex items-center justify-center rounded-full bg-[#080808]",
          view === "grid" ? "h-20 w-20" : "h-16 w-16"
        )}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
          className="h-full w-full"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#222222"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#F87171"
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <span className="absolute text-xs font-semibold text-white">
          {skill.progress}%
        </span>
      </div>
      <div
        className={classNames(
          "flex-1",
          view === "grid" ? "w-full max-w-[180px]" : "w-full"
        )}
      >
        <div
          className={classNames(
            "text-sm font-semibold text-white",
            view === "grid" ? "text-center" : "text-left"
          )}
        >
          {skill.name}
        </div>
        <div
          className={classNames(
            "mt-1 text-xs text-[#6E7A96]",
            view === "grid" ? "text-center" : "text-left"
          )}
        >
          Level {skill.level} · +{formatNumber(skill.xpGained)} XP
        </div>
        <div
          className={classNames(
            "mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#222222]",
            view === "grid" ? "mx-auto" : ""
          )}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#F87171] via-[#FECACA] to-[#6DD3A8]"
            style={{ width: `${skill.progress}%` }}
          />
        </div>
      </div>
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
    <ul className="space-y-4">
      {items.map((item) => {
        const start = safeDate(item.startUtc);
        const end = safeDate(item.endUtc);
        const completed = safeDate(item.completedAt);
        const Icon = SCHEDULE_ICON_MAP[item.type];
        const timeRange =
          start && end
            ? `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`
            : "Scheduled block";
        const completedLabel = completed ? dayFormatter.format(completed) : "—";
        return (
          <li
            key={item.id}
            className="flex flex-col gap-4 rounded-2xl border border-[#1F1F1F] bg-gradient-to-br from-[#1A1A1A]/80 via-[#0D0D0D]/80 to-[#050505]/80 p-4 shadow-[0_12px_30px_rgba(5,7,12,0.35)] sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-1 items-start gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#272727] bg-[#0B0B0B] text-[#FECACA]">
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
                <p className="mt-1 text-xs text-[#8A94AB]">{timeRange}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#C4CBDC]">
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-white/80">
                    {formatDurationLabel(item.durationMinutes)}
                  </span>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-white/80">
                    {formatEnergyLabel(item.energy)}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-xs text-[#8A94AB] sm:text-right">
              <div className="font-semibold text-white">{completedLabel}</div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#5F6783]">
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

function BarChart({ data }: { data: number[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-[#1B1B1B] bg-gradient-to-br from-[#1A1A1A] via-[#0D0D0D] to-[#050505] p-5 text-sm text-[#99A4BD] shadow-[0_18px_40px_rgba(8,10,16,0.4)]">
        No recent throughput recorded.
      </div>
    );
  }

  const today = new Date();
  const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
  });
  const headerFormatter = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  });
  const points = data.map((value, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (data.length - 1 - index));
    return { value, date, weekday: date.getDay() };
  });
  const pointByWeekday = new Map<number, { value: number; date: Date }>();
  points.forEach((point) => pointByWeekday.set(point.weekday, point));
  const getFallbackDateForWeekday = (weekday: number) => {
    const date = new Date(today);
    const diff = (today.getDay() - weekday + 7) % 7;
    date.setDate(today.getDate() - diff);
    return date;
  };
  const orderedPoints = [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const point = pointByWeekday.get(weekday);
    if (point) return point;
    return { value: 0, date: getFallbackDateForWeekday(weekday) };
  });
  const values = orderedPoints.map((point) => point.value);
  const max = Math.max(...values);
  const total = values.reduce((sum, value) => sum + value, 0);
  const average = Math.round(total / values.length);

  return (
    <div
      className="rounded-2xl border border-[#1B1B1B] bg-gradient-to-br from-[#1A1A1A] via-[#0D0D0D] to-[#050505] p-5 shadow-[0_18px_40px_rgba(8,10,16,0.4)]"
      aria-label="Tasks completed per period"
    >
      <div className="flex items-center justify-between text-sm text-white">
        <span className="font-semibold">Project completions</span>
        <span className="text-xs text-[#6E7A96]">
          {headerFormatter.format(today)}
        </span>
      </div>
      <div
        className="grid h-44 items-end gap-3"
        style={{
          gridTemplateColumns: `repeat(${orderedPoints.length}, minmax(0, 1fr))`,
        }}
      >
        {orderedPoints.map((point, index) => {
          const { value, date } = point;
          const heightPercent = max === 0 ? 0 : (value / max) * 100;
          const barHeight =
            max === 0 ? "6px" : `${Math.max(heightPercent, 6)}%`;
          const isZero = value === 0;
          return (
            <div
              key={`${date.toISOString()}-${index}`}
              className="flex h-full flex-col items-center justify-end gap-2"
            >
              <span className="text-xs font-semibold text-[#A1ADC7]">
                {value}
              </span>
              <div
                className={classNames(
                  "w-full rounded-t-lg shadow-[0_12px_24px_rgba(248,113,113,0.35)]",
                  isZero
                    ? "bg-[#222222]"
                    : "bg-gradient-to-t from-[#F87171]/30 via-[#F87171]/70 to-[#FECACA]"
                )}
                style={{ height: barHeight }}
              />
              <span className="text-center text-xs font-medium uppercase tracking-[0.2em] text-[#6E7A96]">
                {weekdayFormatter.format(date)}
                <br />
                <span className="text-[10px] font-normal text-[#8A94AB]">
                  {date.getDate()}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-[#8A94AB]">
        <span>Weekly throughput</span>
        <span>Avg {average}/day</span>
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <div
      className="rounded-2xl border border-[#1B1B1B] bg-gradient-to-br from-[#1A1A1A]/80 via-[#0D0D0D]/80 to-[#050505]/80 p-4 shadow-[0_12px_32px_rgba(8,10,16,0.4)]"
      aria-label={`${project.title} progress`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-white">
            {project.title}
          </div>
          <div className="mt-1 text-xs text-[#6E7A96]">
            {project.tasksDone}/{project.tasksTotal} tasks complete
          </div>
        </div>
        <span className="text-sm font-semibold text-[#FECACA]">
          {project.progress}%
        </span>
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#222222]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#F87171] to-[#6DD3A8]"
          style={{ width: `${project.progress}%` }}
        />
      </div>
    </div>
  );
}

function MonumentCard({ monument }: { monument: Monument }) {
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-2xl border border-[#1B1B1B] bg-gradient-to-br from-[#1A1A1A]/80 via-[#0D0D0D]/80 to-[#050505]/80 p-4 text-center shadow-[0_12px_32px_rgba(8,10,16,0.4)]"
      aria-label={`${monument.title} progress`}
    >
      <CircularProgress
        size={76}
        progress={monument.progress}
        trackClassName="stroke-gray-700"
        progressClassName="stroke-green-400"
        label={`${monument.progress}%`}
      />
      <div>
        <div className="text-sm font-semibold text-white">{monument.title}</div>
        <div className="mt-1 text-xs text-[#6E7A96]">
          {monument.goalCount} goal{monument.goalCount === 1 ? "" : "s"} linked
        </div>
      </div>
    </div>
  );
}

function DonutChart({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const colors = ["#FB7185", "#7C838A", "#6DD3A8", "#E8C268", "#22262A"];
  let current = 0;
  const segments = data.map((d, i) => {
    const start = current;
    const portion = total === 0 ? 0 : d.value / total;
    const end = current + portion;
    current = end;
    return `${colors[i % colors.length]} ${start * 360}deg ${end * 360}deg`;
  });
  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-[#1B1B1B] bg-gradient-to-br from-[#1A1A1A] via-[#0D0D0D] to-[#050505] p-5 text-center shadow-[0_18px_40px_rgba(8,10,16,0.4)]">
      <div
        className="relative h-36 w-36 rounded-full border border-[#2B2B2B] bg-[#0A0A0A]"
        style={{
          background:
            total === 0 ? "#151515" : `conic-gradient(${segments.join(",")})`,
        }}
        aria-label="Energy distribution"
      >
        <div className="absolute inset-6 rounded-full bg-[#050505]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="text-[10px] uppercase tracking-[0.3em] text-[#6E7A96]">
            Focus
          </span>
          <span className="text-lg font-semibold text-white">{total}%</span>
        </div>
      </div>
      <div className="w-full space-y-3 text-left">
        {data.map((d, i) => {
          const percent = total === 0 ? 0 : Math.round((d.value / total) * 100);
          return (
            <div
              key={d.label}
              className="flex items-center justify-between text-xs text-[#9DA6BB]"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: colors[i % colors.length] }}
                />
                {d.label}
              </span>
              <span className="text-white">{percent}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  return (
    <ul className="relative space-y-6" aria-label="Activity feed">
      {events.map((event, index) => {
        const formattedDate = new Date(event.date);
        const dateLabel = new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
        }).format(formattedDate);
        return (
          <li key={event.id} className="relative flex gap-4">
            <div className="flex flex-col items-center">
              <span className="relative z-10 flex h-4 w-4 items-center justify-center">
                <span className="h-3 w-3 rounded-full border border-[#F87171] bg-[#080808]" />
              </span>
              {index !== events.length - 1 && (
                <span className="mt-1 h-full w-px bg-gradient-to-b from-[#F87171]/60 to-transparent" />
              )}
            </div>
            <div className="flex-1 rounded-2xl border border-[#1B1B1B] bg-gradient-to-br from-[#1A1A1A] via-[#0D0D0D] to-[#050505] px-4 py-3 shadow-[0_12px_24px_rgba(8,10,16,0.35)]">
              <div className="text-xs uppercase tracking-[0.2em] text-[#6E7A96]">
                {dateLabel}
              </div>
              <div className="mt-2 text-sm text-white">{event.label}</div>
            </div>
          </li>
        );
      })}
    </ul>
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
    <div className="rounded-2xl border border-[#1F1F1F] bg-gradient-to-br from-[#1A1A1A]/80 via-[#0D0D0D]/80 to-[#050505]/80 p-4 text-sm text-[#9DA6BB] sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[#6E7A96]">
            Streak momentum
          </div>
          <p className="mt-1 text-sm text-[#9DA6BB]">
            See how your streak evolved over time.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-[0.2em] text-[#6E7A96]">
            Current streak
          </div>
          <div className="mt-1 text-2xl font-semibold text-white">
            {currentStreak} days
          </div>
        </div>
      </div>
      <div className="mt-6">
        <StreakSparkline data={history} />
      </div>
      <div className="mt-4 rounded-xl border border-[#222222] bg-[#121212] p-4 text-xs text-[#9DA6BB]">
        <div className="flex items-center justify-between">
          <span className="uppercase tracking-[0.2em] text-[#6E7A96]">
            Longest streak
          </span>
          <span className="text-lg font-semibold text-white">
            {longestStreak} days
          </span>
        </div>
        <p className="mt-2 text-[13px]">
          Use these momentum bursts to plan your next focus block.
        </p>
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
      <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-[#2B2B2B] bg-gradient-to-br from-[#1A1A1A] via-[#0D0D0D] to-[#050505] text-center text-xs text-[#6E7A96]">
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
      <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full">
        <defs>
          <linearGradient id="streakGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(254,202,202,0.6)" />
            <stop offset="100%" stopColor="rgba(248,113,113,0.05)" />
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
      <div className="mt-2 flex items-center justify-between text-xs text-[#6E7A96]">
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
      <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#2B2B2B] bg-gradient-to-br from-[#1A1A1A] via-[#0D0D0D] to-[#050505] text-center text-sm text-[#6E7A96]">
        No routine data yet.
        <span className="text-xs text-[#4E5A73]">
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
          <div className="text-xs uppercase tracking-[0.2em] text-[#6E7A96]">
            Routine trends
          </div>
          <p className="mt-1 text-sm text-[#9DA6BB]">
            Visualize which habits stay consistent week over week.
          </p>
        </div>
        {weeks > 0 ? (
          <span className="text-xs font-medium text-[#6E7A96]">
            Past {weeks} week{weeks === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      <div className="mt-5 space-y-5">
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
                <span className="text-xs text-[#6E7A96]">
                  {average}% consistency
                </span>
              </div>
              <div className="grid grid-cols-[auto,1fr] gap-3">
                <div className="flex flex-col justify-between text-[10px] uppercase tracking-[0.2em] text-[#465066]">
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
                            : `rgba(248,113,113,${opacity.toFixed(2)})`;
                        const boxShadow =
                          ratio === 0
                            ? undefined
                            : "0 3px 10px rgba(248,113,113,0.35)";
                        const percent = Math.round(ratio * 100);
                        return (
                          <span
                            key={`${routine.id}-week-${weekIndex}-day-${dayIndex}`}
                            className="h-6 w-6 rounded-md border border-[#222222]"
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

function BestPerformanceList({
  title,
  data,
  emptyLabel,
}: {
  title: string;
  data: { label: string; successRate: number }[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-[#1F1F1F] bg-gradient-to-br from-[#1A1A1A]/80 via-[#0D0D0D]/80 to-[#050505]/80 p-4 text-sm text-[#9DA6BB] sm:p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-[#6E7A96]">
        {title}
      </div>
      {data.length === 0 ? (
        <p className="mt-3 text-sm text-[#6E7A96]">{emptyLabel}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.map((item) => {
            const percent =
              item.successRate > 1
                ? Math.round(item.successRate)
                : Math.round(item.successRate * 100);
            return (
              <li key={item.label} className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[#6E7A96]">
                  <span className="text-sm font-medium text-white">
                    {item.label}
                  </span>
                  <span>{percent}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#222222]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#F87171] via-[#FECACA] to-[#6DD3A8]"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function WeeklyReflectionPanel({
  reflections,
}: {
  reflections: AnalyticsHabitWeeklyReflection[];
}) {
  const [pinnedState, setPinnedState] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<
    Record<string, "idle" | "saved">
  >({});
  const [shareStatus, setShareStatus] = useState<
    Record<string, "idle" | "copied" | "error">
  >({});

  useEffect(() => {
    setPinnedState((prev) => {
      const next: Record<string, boolean> = {};
      reflections.forEach((reflection) => {
        next[reflection.id] = prev[reflection.id] ?? reflection.pinned;
      });
      return next;
    });
    setNotes((prev) => {
      const next: Record<string, string> = {};
      reflections.forEach((reflection) => {
        next[reflection.id] = prev[reflection.id] ?? "";
      });
      return next;
    });
    setSaveStatus((prev) => {
      const next: Record<string, "idle" | "saved"> = {};
      reflections.forEach((reflection) => {
        next[reflection.id] = prev[reflection.id] ?? "idle";
      });
      return next;
    });
    setShareStatus((prev) => {
      const next: Record<string, "idle" | "copied" | "error"> = {};
      reflections.forEach((reflection) => {
        next[reflection.id] = prev[reflection.id] ?? "idle";
      });
      return next;
    });
  }, [reflections]);

  if (reflections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#2B2B2B] bg-gradient-to-br from-[#1A1A1A] via-[#0D0D0D] to-[#050505] p-6 text-center text-sm text-[#6E7A96]">
        Weekly reflections will appear once you build a streak.
        <span className="text-xs text-[#4E5A73]">
          Capture highlights to train smarter recommendations.
        </span>
      </div>
    );
  }

  const handleTogglePin = (id: string) => {
    setPinnedState((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSave = (id: string) => {
    setSaveStatus((prev) => ({ ...prev, [id]: "saved" }));
    window.setTimeout(() => {
      setSaveStatus((prev) => ({ ...prev, [id]: "idle" }));
    }, 3000);
  };

  const handleShare = async (id: string) => {
    const reflection = reflections.find((entry) => entry.id === id);
    if (!reflection) {
      return;
    }

    const summary = `Week: ${reflection.weekLabel}\nStreak: ${reflection.streak} days\nBest day: ${reflection.bestDay}\nLesson: ${reflection.lesson}`;

    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(summary);
        setShareStatus((prev) => ({ ...prev, [id]: "copied" }));
        window.setTimeout(() => {
          setShareStatus((prev) => ({ ...prev, [id]: "idle" }));
        }, 3000);
      } else {
        throw new Error("Clipboard unavailable");
      }
    } catch (error) {
      console.error("Unable to copy weekly reflection", error);
      setShareStatus((prev) => ({ ...prev, [id]: "error" }));
      window.setTimeout(() => {
        setShareStatus((prev) => ({ ...prev, [id]: "idle" }));
      }, 4000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-[#6E7A96]">
        <span>Weekly reflection</span>
        <span className="text-[11px] normal-case tracking-normal text-[#9DA6BB]">
          Summaries feed your future habit recommendations.
        </span>
      </div>
      <div className="space-y-5">
        {reflections.map((reflection) => {
          const pinned = pinnedState[reflection.id] ?? reflection.pinned;
          const note = notes[reflection.id] ?? "";
          const saved = saveStatus[reflection.id] ?? "idle";
          const shared = shareStatus[reflection.id] ?? "idle";
          return (
            <div
              key={reflection.id}
              className="space-y-4 rounded-2xl border border-[#222222] bg-gradient-to-br from-[#1A1A1A] via-[#0D0D0D] to-[#050505] p-5 shadow-[0_16px_36px_rgba(7,9,14,0.45)]"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-[#6E7A96]">
                    <Sparkles className="h-4 w-4 text-[#FECACA]" />
                    {reflection.weekLabel}
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-white">
                    {reflection.streak} day streak snapshot
                  </h3>
                  <dl className="mt-3 grid gap-3 text-sm text-[#9DA6BB] sm:grid-cols-2">
                    <div className="rounded-xl border border-[#222222] bg-[#080808] p-3">
                      <dt className="text-[11px] uppercase tracking-[0.2em] text-[#6E7A96]">
                        Best day
                      </dt>
                      <dd className="mt-1 text-white">{reflection.bestDay}</dd>
                    </div>
                    <div className="rounded-xl border border-[#222222] bg-[#080808] p-3">
                      <dt className="text-[11px] uppercase tracking-[0.2em] text-[#6E7A96]">
                        Lesson learned
                      </dt>
                      <dd className="mt-1 text-white">{reflection.lesson}</dd>
                    </div>
                  </dl>
                  {reflection.recommendation ? (
                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#292929] bg-[#121212] p-3 text-sm text-[#9DA6BB]">
                      <PenLine className="h-4 w-4 text-[#6DD3A8]" />
                      <span>{reflection.recommendation}</span>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => handleTogglePin(reflection.id)}
                  className={classNames(
                    "inline-flex items-center gap-2 self-end rounded-full border px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F87171]/80",
                    pinned
                      ? "border-[#F87171] bg-[#F87171]/10 text-[#FECACA]"
                      : "border-[#2B2B2B] text-[#9DA6BB] hover:text-white"
                  )}
                >
                  <Bookmark className="h-4 w-4" />
                  {pinned ? "Pinned for insights" : "Pin this week"}
                </button>
              </div>
              <div className="space-y-3">
                <label className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[#6E7A96]">
                  <span>Journal prompt</span>
                  <span className="text-[11px] normal-case tracking-normal text-[#4E5A73]">
                    What made this week so consistent?
                  </span>
                </label>
                <textarea
                  value={note}
                  onChange={(event) =>
                    setNotes((prev) => ({
                      ...prev,
                      [reflection.id]: event.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full resize-none rounded-xl border border-[#2B2B2B] bg-[#050505] p-3 text-sm text-white placeholder:text-[#3F4A63] focus:border-[#F87171] focus:outline-none focus:ring-2 focus:ring-[#F87171]/50"
                  placeholder="Capture the habits, supports, or rituals that unlocked momentum."
                />
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleSave(reflection.id)}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F87171] to-[#FECACA] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_12px_30px_rgba(248,113,113,0.45)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F87171]/80"
                  >
                    <PenLine className="h-4 w-4" />
                    Save reflection
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShare(reflection.id)}
                    className="inline-flex items-center gap-2 rounded-full border border-[#2B2B2B] px-4 py-1.5 text-xs font-medium text-[#9DA6BB] transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F87171]/80"
                  >
                    <Share2 className="h-4 w-4" />
                    Share snapshot
                  </button>
                  <div className="flex items-center text-xs text-[#6E7A96]">
                    {saved === "saved" ? (
                      <span className="text-[#6DD3A8]">
                        Saved! We’ll tailor future nudges.
                      </span>
                    ) : shared === "copied" ? (
                      <span className="text-[#FECACA]">
                        Copied summary to clipboard.
                      </span>
                    ) : shared === "error" ? (
                      <span className="text-[#FFB4A2]">
                        Clipboard unavailable—share manually.
                      </span>
                    ) : pinned ? (
                      <span>
                        Pinned weeks guide your habit recommendations.
                      </span>
                    ) : null}
                  </div>
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
      <div className="grid grid-cols-7 gap-2 text-[10px] uppercase tracking-[0.2em] text-[#6E7A96]">
        {weekLabels.map((label) => (
          <span key={label} className="text-center">
            {label}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-7 gap-2" aria-label="Streak calendar">
        {cells.map(({ key, date, isComplete }) => (
          <div
            key={key}
            className={classNames(
              "flex h-8 w-full items-center justify-center rounded-lg border text-sm font-semibold transition",
              isComplete
                ? "border-transparent bg-gradient-to-br from-[#F87171] to-[#FECACA] text-white shadow-[0_8px_18px_rgba(248,113,113,0.35)]"
                : "border-[#1B1B1B] bg-[#080808] text-[#6E7A96]"
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
      className={classNames(
        "rounded-3xl border border-[#191919] bg-gradient-to-br from-[#1C1C1C]/90 via-[#0F0F0F]/90 to-[#050505]/90 p-6 shadow-[0_30px_80px_rgba(7,10,16,0.55)] backdrop-blur",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-[#95A1B6]">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function EmptyState({ title, cta }: { title: string; cta: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-[#2B2B2B] bg-[#080808] px-6 py-8 text-center text-sm text-[#9DA6BB]"
      aria-label="Empty state"
    >
      <div>{title}</div>
      <button className="inline-flex items-center gap-2 rounded-full border border-[#272727] bg-[#0A0A0A] px-4 py-2 text-sm font-medium text-[#FECACA] transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F87171]">
        {cta}
      </button>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-[#3C1E2A] bg-[#160E12] px-4 py-6 text-sm text-[#F5B8C9]">
      {message}
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={classNames(
        "animate-pulse rounded-2xl bg-[#151515]/80",
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
    <div className="rounded-2xl border border-[#1F1F1F] bg-gradient-to-br from-[#1A1A1A]/80 via-[#0D0D0D]/80 to-[#050505]/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[#6E7A96]">
            Daily consistency
          </div>
          <p className="mt-1 text-sm text-[#9DA6BB]">
            Streak coverage for the last {summary.calendarDays} days.
          </p>
        </div>
        <div className="text-right text-xs font-medium text-[#6E7A96]">
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
