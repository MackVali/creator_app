"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
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
} from "lucide-react";
import type {
  AnalyticsResponse,
  AnalyticsKpiId,
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

interface Kpi {
  id: string;
  label: string;
  value: number;
  delta: number;
  icon: ComponentType<{ className?: string }>;
}

interface Skill {
  id: string;
  name: string;
  level: number;
  progress: number; // 0-100
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
  const [dateRange, setDateRange] = useState<
    "7d" | "30d" | "90d" | "custom"
  >("30d");
  const [skillsView, setSkillsView] = useState<"grid" | "list">("grid");
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

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
  const habitSummary = analytics?.habit ?? {
    currentStreak: 0,
    longestStreak: 0,
    calendarDays: 28,
    calendarCompleted: [] as number[],
  };

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

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07080A] text-[#E6E6EB]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[-40%] h-[520px] bg-[radial-gradient(circle_at_top,rgba(126,107,255,0.35),transparent_65%)] blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl space-y-10 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <Header
          dateRange={dateRange}
          onRangeChange={setDateRange}
          lastUpdated={lastUpdated ?? undefined}
        />

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <SectionCard
            title="Performance snapshot"
            description="Key metrics from your current focus window."
          >
            {loading ? (
              <Skeleton className="h-32" />
            ) : error ? (
              <ErrorState message={error} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {kpis.map((k) => (
                  <KpiCard key={k.id} kpi={k} />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Focus insights"
            description="Quick cues for where to lean in next."
          >
            {loading ? (
              <Skeleton className="h-48" />
            ) : error ? (
              <ErrorState message={error} />
            ) : (
              <ul className="space-y-4">
                {focusInsights.map((insight) => (
                  <li
                    key={insight.id}
                    className="rounded-2xl border border-[#232A3A] bg-[#0B0F17]/80 p-4 shadow-[0_12px_30px_rgba(5,7,12,0.35)]"
                  >
                    <span className="text-xs uppercase tracking-[0.2em] text-[#6E7A96]">
                      {insight.title}
                    </span>
                    <div className="mt-2 text-lg font-semibold text-white">
                      {insight.metric}
                    </div>
                    <p className="mt-1 text-sm text-[#99A4BD]">{insight.helper}</p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <SectionCard
            title="Skill mastery"
            description="Track progress toward your next level-up across key disciplines."
            action={
              <div className="flex items-center gap-3">
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-[#262F45] bg-[#0B1018] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#7E8AA6]"
                  type="button"
                  onClick={() => setSkillsView(skillsView === "grid" ? "list" : "grid")}
                >
                  {skillsView === "grid" ? "List view" : "Grid view"}
                </button>
              </div>
            }
          >
            {loading ? (
              <Skeleton className="h-56" />
            ) : error ? (
              <ErrorState message={error} />
            ) : (
              <div className="space-y-6">
                <div
                  className={classNames(
                    "gap-4",
                    skillsView === "grid"
                      ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                      : "grid gap-4"
                  )}
                >
                  {skills.map((skill) => (
                    <SkillCard key={skill.id} skill={skill} view={skillsView} />
                  ))}
                </div>
                <div className="flex justify-end">
                  <Link
                    href="#"
                    className="inline-flex items-center gap-2 text-sm font-medium text-[#B19CFF] transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7E6BFF]"
                  >
                    View all skills<span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
            )}
          </SectionCard>

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
                <div className="rounded-2xl border border-[#232A3A] bg-[#0B0F17]/80 p-4">
                  <StreakCalendar
                    days={habitSummary.calendarDays}
                    completed={habitSummary.calendarCompleted}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[#232A3A] bg-[#0B0F17]/80 p-4 text-sm text-[#9DA6BB]">
                    <div className="text-xs uppercase tracking-[0.2em] text-[#6E7A96]">
                      Longest streak
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      {longestStreak} days
                    </div>
                    <p className="mt-1">Sustain this pace to unlock a new badge.</p>
                  </div>
                  <div className="rounded-2xl border border-[#232A3A] bg-[#0B0F17]/80 p-4 text-sm text-[#9DA6BB]">
                    <div className="text-xs uppercase tracking-[0.2em] text-[#6E7A96]">
                      Current streak
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      {currentStreak} days
                    </div>
                    <p className="mt-1">Log today’s habit to keep the momentum going.</p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Link
                    href="#"
                    className="inline-flex items-center gap-2 text-sm font-medium text-[#B19CFF] transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7E6BFF]"
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
                    className="inline-flex items-center gap-2 text-sm font-medium text-[#B19CFF] transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7E6BFF]"
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
            title="Windows & energy"
            description="Understand how your focus windows convert into energy states."
          >
            {loading ? (
              <Skeleton className="h-56" />
            ) : error ? (
              <ErrorState message={error} />
            ) : windows.heatmap.length === 0 ? (
              <EmptyState title="No windows yet" cta="Set up windows" />
            ) : (
              <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
                <Heatmap data={windows.heatmap} />
                <DonutChart data={windows.energy} />
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Activity feed"
            description="Highlights from tasks, projects, and rituals."
          >
            {loading ? (
              <Skeleton className="h-56" />
            ) : error ? (
              <ErrorState message={error} />
            ) : (
              <>
                <ActivityTimeline events={activity} />
                <div className="mt-6 flex justify-end">
                  <button className="inline-flex items-center gap-2 rounded-full border border-[#262F45] bg-[#0B1018] px-4 py-2 text-sm font-medium text-[#B19CFF] transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7E6BFF]">
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
    <header className="overflow-hidden rounded-3xl border border-[#1C2330] bg-gradient-to-br from-[#161C2C] via-[#0F131D] to-[#090C12] px-6 py-8 shadow-[0_30px_80px_rgba(7,10,16,0.55)]">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-6">
          <div className="flex items-start gap-4 sm:items-center">
            <button
              onClick={() => router.push("/dashboard")}
              aria-label="Back to dashboard"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#262F45] bg-[#0B1018] text-[#B19CFF] transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7E6BFF]"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <span className="text-xs uppercase tracking-[0.3em] text-[#6E7A96]">
                Insights hub
              </span>
              <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
                Analytics
              </h1>
              <p className="mt-2 max-w-xl text-sm text-[#9DA6BB]">
                An integrated view of how your skills, projects, and rituals are
                compounding.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-[#8A94AB]">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#262F45] bg-[#0B1018] px-3 py-1">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-[#6DD3A8]"
              />
              Systems nominal
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#262F45] bg-[#0B1018] px-3 py-1">
              Updated {new Intl.DateTimeFormat("en-US", {
                month: "long",
                day: "numeric",
              }).format(updatedAt)}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#262F45] bg-[#0B1018] px-3 py-1">
              Range: {rangeLabel(dateRange)}
            </span>
          </div>
        </div>
        <DateRangeSelector value={dateRange} onChange={onRangeChange} />
      </div>
    </header>
  );
}

function rangeLabel(range: "7d" | "30d" | "90d" | "custom") {
  switch (range) {
    case "7d":
      return "7 days";
    case "30d":
      return "30 days";
    case "90d":
      return "90 days";
    default:
      return "Custom";
  }
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
      <span className="text-xs uppercase tracking-[0.3em] text-[#6E7A96]">
        Timeframe
      </span>
      <div className="inline-flex items-center gap-1 rounded-full border border-[#273041] bg-[#0C111A] p-1 shadow-[0_12px_30px_rgba(7,9,14,0.45)]">
        {ranges.map((range) => {
          const active = value === range.value;
          return (
            <button
              key={range.value}
              type="button"
              onClick={() => onChange(range.value)}
              className={classNames(
                "min-w-[72px] rounded-full px-3 py-1.5 text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7E6BFF]/80",
                active
                  ? "bg-[#7E6BFF] text-white shadow-[0_12px_30px_rgba(126,107,255,0.45)]"
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

function KpiCard({ kpi }: { kpi: Kpi }) {
  const Icon = kpi.icon;
  const isPositive = kpi.delta >= 0;
  const deltaColor = isPositive ? "text-[#6DD3A8]" : "text-[#E87070]";
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[#1E2432] bg-gradient-to-br from-[#141A26] via-[#101521] to-[#0A0E15] p-5 transition-all hover:-translate-y-1 hover:border-[#7E6BFF]/70 hover:shadow-[0_20px_45px_rgba(8,10,16,0.45)]">
      <div className="flex items-start justify-between">
        <span className="text-xs uppercase tracking-[0.3em] text-[#6E7A96]">
          {kpi.label}
        </span>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#7E6BFF]/20 to-transparent text-[#B19CFF]">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div
        className="mt-5 text-3xl font-semibold text-white"
        aria-label={formatNumber(kpi.value)}
      >
        {formatNumber(kpi.value)}
      </div>
      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#273041] bg-[#0C111A] px-3 py-1 text-xs font-medium text-[#A1ADC7]">
        <span
          aria-hidden="true"
          className={classNames("text-base", deltaColor)}
        >
          {isPositive ? "▲" : "▼"}
        </span>
        <span className={classNames("font-semibold", deltaColor)}>
          {formatDelta(kpi.delta)}
        </span>
        <span className="text-[#6E7A96]">vs last period</span>
      </div>
    </div>
  );
}

function SkillCard({
  skill,
  view,
}: {
  skill: Skill;
  view: "grid" | "list";
}) {
  const size = view === "grid" ? 88 : 68;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (skill.progress / 100) * circumference;
  return (
    <div
      className={classNames(
        "group rounded-2xl border border-[#1E2432] bg-[#0F141D]/90 p-5 transition hover:border-[#7E6BFF]/60 hover:shadow-[0_18px_40px_rgba(8,10,16,0.4)]",
        view === "grid"
          ? "flex flex-col items-center gap-4 text-center"
          : "flex items-center justify-between gap-4"
      )}
      aria-label={`${skill.name} progress`}
    >
      <div
        className={classNames(
          "relative flex items-center justify-center rounded-full bg-[#0B1018]",
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
            stroke="#1F2736"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#7E6BFF"
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
            "mt-1 text-xs uppercase tracking-[0.2em] text-[#6E7A96]",
            view === "grid" ? "text-center" : "text-left"
          )}
        >
          Level {skill.level}
        </div>
        <div
          className={classNames(
            "mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#1F2736]",
            view === "grid" ? "mx-auto" : ""
          )}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#7E6BFF] via-[#B19CFF] to-[#6DD3A8]"
            style={{ width: `${skill.progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function BarChart({ data }: { data: number[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-[#1E2432] bg-[#0B1018] p-5 text-sm text-[#99A4BD] shadow-[0_18px_40px_rgba(8,10,16,0.4)]">
        No recent throughput recorded.
      </div>
    );
  }

  const max = Math.max(...data);
  const total = data.reduce((sum, value) => sum + value, 0);
  const average = Math.round(total / data.length);
  const defaultLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const labels =
    data.length === defaultLabels.length
      ? defaultLabels
      : data.map((_, index) => `D${index + 1}`);
  return (
    <div
      className="rounded-2xl border border-[#1E2432] bg-[#0B1018] p-5 shadow-[0_18px_40px_rgba(8,10,16,0.4)]"
      aria-label="Tasks completed per period"
    >
      <div
        className="grid h-44 items-end gap-3"
        style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}
      >
        {data.map((value, index) => {
          const height = max === 0 ? 0 : (value / max) * 100;
          return (
            <div key={index} className="flex h-full flex-col justify-end">
              <div
                className="rounded-t-lg bg-gradient-to-t from-[#7E6BFF]/30 via-[#7E6BFF]/70 to-[#B19CFF] shadow-[0_12px_24px_rgba(126,107,255,0.35)]"
                style={{ height: `${height}%` }}
              />
            <span className="mt-3 text-xs font-medium uppercase tracking-[0.2em] text-[#6E7A96]">
              {labels[index] ?? `D${index + 1}`}
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
      className="rounded-2xl border border-[#1E2432] bg-[#0B0F17]/80 p-4 shadow-[0_12px_32px_rgba(8,10,16,0.4)]"
      aria-label={`${project.title} progress`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{project.title}</div>
          <div className="mt-1 text-xs text-[#6E7A96]">
            {project.tasksDone}/{project.tasksTotal} tasks complete
          </div>
        </div>
        <span className="text-sm font-semibold text-[#B19CFF]">
          {project.progress}%
        </span>
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#1F2736]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#7E6BFF] to-[#6DD3A8]"
          style={{ width: `${project.progress}%` }}
        />
      </div>
    </div>
  );
}

function MonumentCard({ monument }: { monument: Monument }) {
  const size = 76;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (monument.progress / 100) * circumference;
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-2xl border border-[#1E2432] bg-[#0B0F17]/80 p-4 text-center shadow-[0_12px_32px_rgba(8,10,16,0.4)]"
      aria-label={`${monument.title} progress`}
    >
      <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#0B1018]">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#1F2736"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#6DD3A8"
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute text-sm font-semibold text-white">
          {monument.progress}%
        </span>
      </div>
      <div>
        <div className="text-sm font-semibold text-white">{monument.title}</div>
        <div className="mt-1 text-xs text-[#6E7A96]">
          {monument.goalCount} goal{monument.goalCount === 1 ? "" : "s"} linked
        </div>
      </div>
    </div>
  );
}

function Heatmap({ data }: { data: number[][] }) {
  const flattened = data.flat();
  const max = flattened.length > 0 ? Math.max(...flattened) : 0;
  const columns = data[0]?.length ?? 0;
  const timeLabels = ["Early", "Morning", "Afternoon", "Evening"];
  const labels = columns > 0 ? timeLabels.slice(0, columns) : [];
  return (
    <div className="rounded-2xl border border-[#1E2432] bg-[#0B1018] p-5 shadow-[0_18px_40px_rgba(8,10,16,0.4)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-white">Focus heatmap</div>
          <p className="mt-1 text-xs text-[#6E7A96]">
            Intensity across your scheduled windows
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[#273041] bg-[#0C111A] px-3 py-1 text-xs text-[#A1ADC7]">
          Peak
          <span
            aria-hidden="true"
            className="h-2 w-8 rounded-full bg-gradient-to-r from-transparent via-[#7E6BFF] to-[#7E6BFF]"
          />
        </span>
      </div>
      <div
        className="mt-4 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        aria-label="Window adherence heatmap"
      >
        {data.map((row, i) =>
          row.map((val, j) => {
            const intensity = max === 0 ? 0 : val / max;
            return (
              <div
                key={`${i}-${j}`}
                className="aspect-square w-full rounded-md"
                style={{
                  background:
                    intensity === 0
                      ? "rgba(32,38,49,0.85)"
                      : `rgba(126,107,255,${0.25 + intensity * 0.65})`,
                }}
              />
            );
          })
        )}
      </div>
      <div
        className="mt-3 grid gap-2 text-xs uppercase tracking-[0.2em] text-[#6E7A96]"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {labels.map((label) => (
          <span key={label} className="text-center">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function DonutChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const colors = ["#9966CC", "#7C838A", "#6DD3A8", "#E8C268", "#22262A"];
  let current = 0;
  const segments = data.map((d, i) => {
    const start = current;
    const portion = total === 0 ? 0 : d.value / total;
    const end = current + portion;
    current = end;
    return `${colors[i % colors.length]} ${start * 360}deg ${end * 360}deg`;
  });
  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-[#1E2432] bg-[#0B1018] p-5 text-center shadow-[0_18px_40px_rgba(8,10,16,0.4)]">
      <div
        className="relative h-36 w-36 rounded-full border border-[#273041] bg-[#0C111A]"
        style={{
          background:
            total === 0
              ? "#141A26"
              : `conic-gradient(${segments.join(",")})`,
        }}
        aria-label="Energy distribution"
      >
        <div className="absolute inset-6 rounded-full bg-[#070A12]" />
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
                <span className="h-3 w-3 rounded-full border border-[#7E6BFF] bg-[#0B1018]" />
              </span>
              {index !== events.length - 1 && (
                <span className="mt-1 h-full w-px bg-gradient-to-b from-[#7E6BFF]/60 to-transparent" />
              )}
            </div>
            <div className="flex-1 rounded-2xl border border-[#1E2432] bg-[#0B1018] px-4 py-3 shadow-[0_12px_24px_rgba(8,10,16,0.35)]">
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

function StreakCalendar({
  days,
  completed,
}: {
  days: number;
  completed: number[];
}) {
  const cells = Array.from({ length: days }, (_, i) => i + 1);
  return (
    <div className="grid grid-cols-7 gap-2" aria-label="Streak calendar">
      {cells.map((day) => {
        const isComplete = completed.includes(day);
        return (
          <div
            key={day}
            className={classNames(
              "aspect-square w-full rounded-lg border text-[10px] font-medium transition",
              isComplete
                ? "border-transparent bg-gradient-to-br from-[#7E6BFF] to-[#B19CFF] text-white shadow-[0_8px_18px_rgba(126,107,255,0.35)]"
                : "border-[#1E2432] bg-[#0B1018] text-[#6E7A96]"
            )}
          >
            <span className="flex h-full items-center justify-center">{day}</span>
          </div>
        );
      })}
    </div>
  );
}

function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={classNames(
        "rounded-3xl border border-[#1C2330] bg-[#11161F]/90 p-6 shadow-[0_30px_80px_rgba(7,10,16,0.55)] backdrop-blur",
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

function EmptyState({
  title,
  cta,
}: {
  title: string;
  cta: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-[#273041] bg-[#0B1018] px-6 py-8 text-center text-sm text-[#9DA6BB]"
      aria-label="Empty state"
    >
      <div>{title}</div>
      <button className="inline-flex items-center gap-2 rounded-full border border-[#262F45] bg-[#0C111A] px-4 py-2 text-sm font-medium text-[#B19CFF] transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7E6BFF]">
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
        "animate-pulse rounded-2xl bg-[#141A26]/80",
        className
      )}
    />
  );
}

