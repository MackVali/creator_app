"use client";

import { useState, type ComponentType } from "react";
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
  name: string;
  progress: number;
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
  const loading = false;

  const kpiData: Record<string, Kpi[]> = {
    "7d": [
      {
        id: "skills",
        label: "Skill XP",
        value: 420,
        delta: 56,
        icon: TrendingUp,
      },
      {
        id: "tasks",
        label: "Tasks",
        value: 32,
        delta: 4,
        icon: CheckSquare,
      },
      {
        id: "projects",
        label: "Projects",
        value: 3,
        delta: 1,
        icon: FolderKanban,
      },
      {
        id: "monuments",
        label: "Monuments",
        value: 72,
        delta: 5,
        icon: BatteryCharging,
      },
      {
        id: "windows",
        label: "Windows",
        value: 80,
        delta: -5,
        icon: Clock,
      },
      {
        id: "habits",
        label: "Habits",
        value: 6,
        delta: 0,
        icon: Flame,
      },
    ],
    "30d": [
      {
        id: "skills",
        label: "Skill XP",
        value: 1820,
        delta: 200,
        icon: TrendingUp,
      },
      {
        id: "tasks",
        label: "Tasks",
        value: 120,
        delta: 20,
        icon: CheckSquare,
      },
      {
        id: "projects",
        label: "Projects",
        value: 5,
        delta: 2,
        icon: FolderKanban,
      },
      {
        id: "monuments",
        label: "Monuments",
        value: 68,
        delta: 3,
        icon: BatteryCharging,
      },
      {
        id: "windows",
        label: "Windows",
        value: 84,
        delta: 2,
        icon: Clock,
      },
      {
        id: "habits",
        label: "Habits",
        value: 10,
        delta: 1,
        icon: Flame,
      },
    ],
    "90d": [
      {
        id: "skills",
        label: "Skill XP",
        value: 5020,
        delta: 600,
        icon: TrendingUp,
      },
      {
        id: "tasks",
        label: "Tasks",
        value: 340,
        delta: 30,
        icon: CheckSquare,
      },
      {
        id: "projects",
        label: "Projects",
        value: 8,
        delta: 3,
        icon: FolderKanban,
      },
      {
        id: "monuments",
        label: "Monuments",
        value: 70,
        delta: 4,
        icon: BatteryCharging,
      },
      {
        id: "windows",
        label: "Windows",
        value: 82,
        delta: -3,
        icon: Clock,
      },
      {
        id: "habits",
        label: "Habits",
        value: 12,
        delta: 2,
        icon: Flame,
      },
    ],
  };

  const skillData: Record<string, Skill[]> = {
    "7d": [
      { id: "1", name: "Coding", level: 5, progress: 70 },
      { id: "2", name: "Design", level: 4, progress: 50 },
      { id: "3", name: "Writing", level: 6, progress: 40 },
      { id: "4", name: "Music", level: 3, progress: 80 },
      { id: "5", name: "Art", level: 2, progress: 60 },
    ],
    "30d": [
      { id: "1", name: "Coding", level: 6, progress: 20 },
      { id: "2", name: "Design", level: 5, progress: 40 },
      { id: "3", name: "Writing", level: 6, progress: 60 },
      { id: "4", name: "Music", level: 4, progress: 30 },
      { id: "5", name: "Art", level: 3, progress: 10 },
    ],
    "90d": [
      { id: "1", name: "Coding", level: 7, progress: 10 },
      { id: "2", name: "Design", level: 6, progress: 20 },
      { id: "3", name: "Writing", level: 7, progress: 70 },
      { id: "4", name: "Music", level: 5, progress: 50 },
      { id: "5", name: "Art", level: 4, progress: 40 },
    ],
  };

  const projectData: Record<string, Project[]> = {
    "7d": [
      { id: "1", title: "Launch", progress: 60, tasksDone: 6, tasksTotal: 10 },
      { id: "2", title: "Website", progress: 30, tasksDone: 3, tasksTotal: 10 },
      { id: "3", title: "App", progress: 80, tasksDone: 8, tasksTotal: 10 },
    ],
    "30d": [
      { id: "1", title: "Launch", progress: 70, tasksDone: 7, tasksTotal: 10 },
      { id: "2", title: "Website", progress: 50, tasksDone: 5, tasksTotal: 10 },
      { id: "3", title: "App", progress: 90, tasksDone: 9, tasksTotal: 10 },
    ],
    "90d": [
      { id: "1", title: "Launch", progress: 80, tasksDone: 8, tasksTotal: 10 },
      { id: "2", title: "Website", progress: 60, tasksDone: 6, tasksTotal: 10 },
      { id: "3", title: "App", progress: 95, tasksDone: 9, tasksTotal: 10 },
    ],
  };

  const monumentData: Record<string, Monument[]> = {
    "7d": [
      { id: "1", name: "Pyramid", progress: 40 },
      { id: "2", name: "Colossus", progress: 20 },
    ],
    "30d": [
      { id: "1", name: "Pyramid", progress: 60 },
      { id: "2", name: "Colossus", progress: 30 },
    ],
    "90d": [
      { id: "1", name: "Pyramid", progress: 80 },
      { id: "2", name: "Colossus", progress: 50 },
    ],
  };

  const activityData: Record<string, ActivityEvent[]> = {
    "7d": [
      { id: "1", label: "Completed Task A", date: "2024-06-01" },
      { id: "2", label: "Started Project X", date: "2024-06-02" },
      { id: "3", label: "Linked Goal to Monument", date: "2024-06-03" },
    ],
    "30d": [
      { id: "1", label: "Completed Task A", date: "2024-05-15" },
      { id: "2", label: "Completed Task B", date: "2024-05-22" },
      { id: "3", label: "Started Project X", date: "2024-05-25" },
    ],
    "90d": [
      { id: "1", label: "Completed Task A", date: "2024-03-10" },
      { id: "2", label: "Completed Task B", date: "2024-04-12" },
      { id: "3", label: "Started Project X", date: "2024-05-05" },
    ],
  };

  const windowsData: Record<
    string,
    { heatmap: number[][]; energy: { label: string; value: number }[] }
  > = {
    "7d": {
      heatmap: [
        [80, 60, 0],
        [50, 90, 30],
        [40, 70, 20],
      ],
      energy: [
        { label: "High", value: 40 },
        { label: "Low", value: 60 },
      ],
    },
    "30d": {
      heatmap: [
        [80, 60, 0],
        [50, 90, 30],
        [40, 70, 20],
      ],
      energy: [
        { label: "High", value: 40 },
        { label: "Low", value: 60 },
      ],
    },
    "90d": {
      heatmap: [
        [80, 60, 0],
        [50, 90, 30],
        [40, 70, 20],
      ],
      energy: [
        { label: "High", value: 40 },
        { label: "Low", value: 60 },
      ],
    },
  };

  const range = dateRange === "custom" ? "30d" : dateRange;
  const kpis = kpiData[range];
  const skills = skillData[range];
  const projects = projectData[range];
  const monuments = monumentData[range];
  const activity = activityData[range];
  const windows = windowsData[range];

  return (
    <div className="bg-[#111315] text-[#E6E6E6] min-h-screen p-4 space-y-8">
      <Header dateRange={dateRange} onRangeChange={setDateRange} />

      <section aria-label="Key performance indicators">
        {loading ? (
          <Skeleton className="h-24" />
        ) : (
          <div className="flex space-x-4 overflow-x-auto">
            {kpis.map((k) => (
              <KpiCard key={k.id} kpi={k} />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Skills analytics" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Skills</h2>
          <Link
            href="#"
            className="text-sm text-[#9966CC] focus:outline-none focus:ring-2 focus:ring-[#9966CC] h-11 inline-flex items-center"
          >
            View All Skills
          </Link>
        </div>
        <div className="flex justify-end">
          <button
            className="h-11 px-4 bg-[#1C1F22] border border-[#2F343A] rounded focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
            onClick={() =>
              setSkillsView(skillsView === "grid" ? "list" : "grid")
            }
            aria-label="Toggle skill view"
          >
            {skillsView === "grid" ? "List" : "Grid"}
          </button>
        </div>
        {loading ? (
          <Skeleton className="h-40" />
        ) : (
          <div
            className={classNames(
              "gap-4 overflow-x-auto",
              skillsView === "grid"
                ? "grid grid-cols-2"
                : "flex space-x-4"
            )}
          >
            {skills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} view={skillsView} />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Tasks and projects" className="space-y-4">
        {loading ? (
          <Skeleton className="h-40" />
        ) : (
          <>
            <BarChart data={[5, 3, 4, 6, 2, 4, 5]} />
            <div className="grid gap-4">
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
            <Link
              href="/projects"
              className="text-sm text-[#9966CC] focus:outline-none focus:ring-2 focus:ring-[#9966CC] h-11 inline-flex items-center"
            >
              Go to Projects
            </Link>
          </>
        )}
      </section>

      <section aria-label="Monuments" className="space-y-4">
        {monuments.length === 0 ? (
          <EmptyState title="No monuments yet" cta="Add Monument" />
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {monuments.map((m) => (
              <MonumentCard key={m.id} monument={m} />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Windows and energy" className="space-y-4">
        {loading ? (
          <Skeleton className="h-40" />
        ) : windows.heatmap.length === 0 ? (
          <EmptyState title="No windows yet" cta="Set up windows" />
        ) : (
          <>
            <Heatmap data={windows.heatmap} />
            <DonutChart data={windows.energy} />
          </>
        )}
      </section>

      <section aria-label="Habits and streaks" className="space-y-4">
        {loading ? (
          <Skeleton className="h-40" />
        ) : (
          <>
            <StreakCalendar days={28} completed={[1, 2, 5, 6, 7, 9, 10]} />
            <div className="flex space-x-4">
              <div>Longest streak: 10</div>
              <div>Current streak: 3</div>
            </div>
          </>
        )}
      </section>

      <section aria-label="Activity feed" className="space-y-4">
        {loading ? (
          <Skeleton className="h-40" />
        ) : (
          <>
            <ActivityTimeline events={activity} />
            <button className="h-11 px-4 bg-[#1C1F22] border border-[#2F343A] rounded focus:outline-none focus:ring-2 focus:ring-[#9966CC]">
              Show more
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function Header({
  dateRange,
  onRangeChange,
}: {
  dateRange: "7d" | "30d" | "90d" | "custom";
  onRangeChange: (range: "7d" | "30d" | "90d" | "custom") => void;
}) {
  const router = useRouter();
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <button
          onClick={() => router.push("/dashboard")}
          aria-label="Back to dashboard"
          className="h-11 w-11 flex items-center justify-center rounded text-[#9966CC] focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
        >
          <ArrowLeft />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-[#A6A6A6]">Track your progress across the app</p>
        </div>
      </div>
      <DateRangeSelector value={dateRange} onChange={onRangeChange} />
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
  return (
    <select
      aria-label="Select date range"
      className="bg-[#1C1F22] border border-[#2F343A] rounded px-2 text-sm h-11 focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
      value={value}
      onChange={(e) =>
        onChange(e.target.value as "7d" | "30d" | "90d" | "custom")
      }
    >
      <option value="7d">Last 7 Days</option>
      <option value="30d">Last 30 Days</option>
      <option value="90d">Last 90 Days</option>
      <option value="custom">Custom</option>
    </select>
  );
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const Icon = kpi.icon;
  const deltaColor = kpi.delta >= 0 ? "text-[#6DD3A8]" : "text-[#E8C268]";
  return (
    <button
      className="h-24 min-w-[160px] p-4 bg-[#1C1F22] rounded shadow text-left focus:outline-none focus:ring-2 focus:ring-[#9966CC]"
      aria-label={kpi.label}
      onClick={() => {}}
    >
      <div className="flex items-center space-x-2">
        <Icon className="text-[#9966CC]" />
        <span className="text-sm text-[#A6A6A6]">{kpi.label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold" aria-label={formatNumber(kpi.value)}>
        {formatNumber(kpi.value)}
      </div>
      <div className={classNames("text-xs mt-1", deltaColor)}>{formatDelta(kpi.delta)}</div>
    </button>
  );
}

function SkillCard({
  skill,
  view,
}: {
  skill: Skill;
  view: "grid" | "list";
}) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (skill.progress / 100) * circumference;
  return (
    <div
      className={classNames(
        "bg-[#1C1F22] p-4 rounded",
        view === "grid" ? "flex flex-col items-center" : "flex items-center space-x-4"
      )}
    >
      <svg width="40" height="40" aria-label={`${skill.name} progress`}>
        <circle
          cx="20"
          cy="20"
          r={radius}
          stroke="#2F343A"
          strokeWidth="4"
          fill="none"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          stroke="#9966CC"
          strokeWidth="4"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className={classNames(view === "grid" ? "mt-2 text-center" : "")}> 
        <div className="font-semibold">{skill.name}</div>
        <div className="text-sm text-[#A6A6A6]">Lvl {skill.level}</div>
      </div>
    </div>
  );
}

function BarChart({ data }: { data: number[] }) {
  const max = Math.max(...data);
  return (
    <div
      className="flex items-end h-40 space-x-2 bg-[#1C1F22] p-4 rounded"
      aria-label="Tasks completed per period"
    >
      {data.map((v, i) => (
        <div
          key={i}
          className="w-6 bg-[#9966CC]"
          style={{ height: `${(v / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <div
      className="bg-[#1C1F22] p-4 rounded space-y-2"
      aria-label={`${project.title} progress`}
    >
      <div className="font-semibold">{project.title}</div>
      <div className="text-sm text-[#A6A6A6]">
        {project.tasksDone}/{project.tasksTotal} tasks
      </div>
      <div className="w-full bg-[#2F343A] h-2 rounded">
        <div
          className="bg-[#9966CC] h-2 rounded"
          style={{ width: `${project.progress}%` }}
        />
      </div>
    </div>
  );
}

function MonumentCard({ monument }: { monument: Monument }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (monument.progress / 100) * circumference;
  return (
    <div
      className="bg-[#1C1F22] p-4 rounded flex flex-col items-center"
      aria-label={`${monument.name} progress`}
    >
      <svg width="40" height="40">
        <circle
          cx="20"
          cy="20"
          r={radius}
          stroke="#2F343A"
          strokeWidth="4"
          fill="none"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          stroke="#9966CC"
          strokeWidth="4"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="mt-2 font-semibold">{monument.name}</div>
    </div>
  );
}

function Heatmap({ data }: { data: number[][] }) {
  const max = Math.max(...data.flat());
  return (
    <div className="grid grid-cols-7 gap-1" aria-label="Window adherence heatmap">
      {data.map((row, i) =>
        row.map((val, j) => (
          <div
            key={`${i}-${j}`}
            className="w-8 h-8"
            style={{
              backgroundColor: `rgba(153,102,204,${val / max})`,
            }}
          />
        ))
      )}
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
    const end = current + d.value / total;
    current = end;
    return `${colors[i % colors.length]} ${start * 360}deg ${end * 360}deg`;
  });
  return (
    <div
      className="w-32 h-32 rounded-full"
      style={{ background: `conic-gradient(${segments.join(",")})` }}
      aria-label="Energy distribution"
    />
  );
}

function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  return (
    <ul className="space-y-2" aria-label="Activity feed">
      {events.map((e) => (
        <li key={e.id} className="flex space-x-2">
          <span className="text-[#A6A6A6] text-sm w-24">{e.date}</span>
          <span className="flex-1">{e.label}</span>
        </li>
      ))}
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
    <div className="grid grid-cols-7 gap-1" aria-label="Streak calendar">
      {cells.map((d) => (
        <div
          key={d}
          className={classNames(
            "w-8 h-8 border border-[#2F343A] rounded",
            completed.includes(d) ? "bg-[#9966CC]" : "bg-[#1C1F22]"
          )}
        />
      ))}
    </div>
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
    <div className="flex flex-col items-center space-y-2" aria-label="Empty state">
      <div className="text-[#A6A6A6]">{title}</div>
      <button className="h-11 px-4 bg-[#1C1F22] border border-[#2F343A] rounded focus:outline-none focus:ring-2 focus:ring-[#9966CC]">
        {cta}
      </button>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={classNames(
        "animate-pulse rounded bg-[#22262A]",
        className
      )}
    />
  );
}

