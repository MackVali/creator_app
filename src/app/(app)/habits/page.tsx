"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  SectionHeader,
  HabitsEmptyState,
  Skeleton,
} from "@/components/ui";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getHabits, type Habit } from "@/lib/queries/habits";

const SUMMARY_STYLES = [
  {
    accent: "from-emerald-500/25 via-emerald-500/5 to-transparent",
    glow: "bg-emerald-500/40",
  },
  {
    accent: "from-sky-500/25 via-sky-500/5 to-transparent",
    glow: "bg-sky-500/40",
  },
  {
    accent: "from-amber-500/25 via-amber-500/5 to-transparent",
    glow: "bg-amber-500/40",
  },
];

const RECURRENCE_FILTERS = [
  { value: "all", label: "ALL CADENCES" },
  { value: "none", label: "NO CADENCE" },
  { value: "daily", label: "DAILY" },
  { value: "weekly", label: "WEEKLY" },
  { value: "bi-weekly", label: "BI-WEEKLY" },
  { value: "monthly", label: "MONTHLY" },
  { value: "every 6 months", label: "6 MONTHS" },
  { value: "yearly", label: "YEARLY" },
  { value: "every x days", label: "EVERY X DAYS" },
];

type HabitRoutineGroup = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  habits: Habit[];
  latestHabitUpdate: string | null;
};

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

function formatTitleCase(value: string | null | undefined) {
  if (!value) return null;
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getHabitLocationLabel(habit: Habit) {
  const label = habit.location_context?.label?.trim();
  if (label) return label;

  const rawValue = habit.location_context?.value?.trim();
  if (rawValue) {
    const formatted = formatTitleCase(rawValue);
    return formatted ?? rawValue;
  }

  if (habit.location_context_id) {
    return "Custom location";
  }

  return "Anywhere";
}

type HabitStreakPill = {
  icon: string;
  text: string;
};

function normalizeStreakDays(value?: number | null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  return 0;
}

function formatStreakDays(days: number) {
  return `${days}x`;
}

function formatLastCompletionLabel(value?: string | null) {
  if (!value) {
    return "No check-ins yet";
  }
  const relative = formatRelativeTime(value);
  if (!relative || relative === "—") {
    return "No check-ins yet";
  }
  return `Last log ${relative}`;
}

function buildHabitStreakPills(habit: Habit): HabitStreakPill[] {
  const currentStreak = normalizeStreakDays(habit.current_streak_days);
  const longestStreak = normalizeStreakDays(habit.longest_streak_days);
  const lastLog = formatLastCompletionLabel(habit.last_completed_at);

  return [
    { icon: "🔥", text: `${formatStreakDays(currentStreak)} current` },
    { icon: "🏆", text: `${formatStreakDays(longestStreak)} best` },
    { icon: "🕒", text: lastLog },
  ];
}

const RECURRENCE_LABELS: Record<string, string> = {
  none: "NO SET CADENCE",
  daily: "DAILY",
  weekly: "WEEKLY",
  "bi-weekly": "BI-WEEKLY",
  monthly: "MONTHLY",
  "every 6 months": "6 MONTHS",
  "bi-monthly": "BI-MONTHLY",
  yearly: "YEARLY",
  "every x days": "EVERY X DAYS",
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getHabitRecurrenceLabel(value?: string | null) {
  const normalized = value?.toLowerCase().trim() ?? "";
  if (normalized && RECURRENCE_LABELS[normalized]) {
    return RECURRENCE_LABELS[normalized];
  }
  if (normalized) {
    return formatTitleCase(normalized) ?? normalized;
  }
  return RECURRENCE_LABELS["none"];
}

function formatHabitRecurrenceDays(days?: number[] | null) {
  if (!days || days.length === 0) {
    return null;
  }

  const normalized = Array.from(
    new Set(
      days
        .map((day) => Number(day))
        .filter((day): day is number => Number.isFinite(day))
        .map((day) => {
          const remainder = day % 7;
          return remainder < 0 ? remainder + 7 : remainder;
        })
    )
  );

  if (normalized.length === 0) {
    return null;
  }

  return normalized
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_LABELS[day])
    .join(" · ");
}

type HabitCompactCardProps = {
  habit: Habit;
};

function HabitCompactCard({ habit }: HabitCompactCardProps) {
  const routineName = habit.routine?.name?.trim() ?? null;
  const currentStreak = normalizeStreakDays(habit.current_streak_days);
  const longestStreak = normalizeStreakDays(habit.longest_streak_days);
  const skillIcon = habit.skill?.icon?.trim();
  const initials = habit.name.charAt(0).toUpperCase();
  const avatarContent = skillIcon || initials;
  const avatarLabel = skillIcon
    ? `${habit.skill?.name ?? "Related skill"} icon`
    : `${habit.name} initial`;
  const recurrenceLabel = getHabitRecurrenceLabel(habit.recurrence);
  const recurrenceDaysLabel = formatHabitRecurrenceDays(habit.recurrence_days);
  const recurrenceDisplay = recurrenceDaysLabel
    ? `${recurrenceLabel} · ${recurrenceDaysLabel}`
    : recurrenceLabel;

  return (
    <article className="group relative flex aspect-square flex-col overflow-hidden rounded-[18px] border border-[#3f7bff]/80 bg-gradient-to-br from-[#0f1c46] via-[#122a6a] to-[#1c3f8c] p-4 text-white shadow-[0_30px_70px_rgba(5,10,24,0.55)] transition hover:-translate-y-1 hover:shadow-[0_40px_90px_rgba(5,10,24,0.65)] sm:p-5">
      <div className="pointer-events-none absolute inset-0 rounded-[18px] bg-[radial-gradient(circle_at_top,_rgba(72,136,255,0.55),_transparent_60%)] opacity-100 mix-blend-screen transition group-hover:opacity-100" />
      <div className="pointer-events-none absolute inset-x-1 top-0 h-1/2 rounded-full bg-gradient-to-br from-[#bcdcff]/70 via-transparent to-transparent blur-[40px]" />
      <div className="relative z-10 flex h-full flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              title={avatarLabel}
              aria-label={avatarLabel}
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[#2d364a] bg-gradient-to-br from-[#0b1c38] via-[#111f42] to-[#1a2f5f] text-sm font-semibold text-white shadow-[inset_0_-2px_4px_rgba(18,38,82,0.45)]"
            >
              {avatarContent}
            </div>
            <div>
              <p className="text-[8px] uppercase tracking-[0.25em] text-white/60 whitespace-nowrap">
                {routineName ? "Routine" : "Solo habit"}
              </p>
              <h3 className="text-base font-semibold leading-tight text-[#e2e6ff] break-words">
                {habit.name}
              </h3>
              {routineName && (
                <p className="text-[11px] text-white/70">{routineName}</p>
              )}
            </div>
          </div>
          <Link
            href={`/habits/${habit.id}/edit`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#2d364a] bg-gradient-to-br from-[#0a1a33] via-[#102549] to-[#1a386f] px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white shadow-[0_6px_18px_rgba(8,16,35,0.55)] transition hover:brightness-110"
          >
            Edit
            <span aria-hidden>→</span>
          </Link>
        </div>
        {habit.description && (
          <p className="text-[11px] leading-snug text-white/75 line-clamp-2">
            {habit.description}
          </p>
        )}
        <div className="mt-auto space-y-2.5 text-white">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/65">
              Recurrence
            </p>
            <p className="text-[12px] font-bold uppercase text-black">{recurrenceDisplay}</p>
          </div>
          <div className="rounded-lg border border-[#2d364a] bg-[#152a58]/85 p-2 text-white shadow-[0_6px_18px_rgba(5,10,24,0.5)]">
            <p className="text-[8px] uppercase tracking-[0.35em] text-white/65">
              Streak
            </p>
            <p className="flex items-center gap-1 text-sm font-semibold">
              {formatStreakDays(currentStreak)} current
              <span aria-hidden className="text-[#7ec8ff]">•</span>
              {formatStreakDays(longestStreak)} best
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function HabitsPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recurrenceFilter, setRecurrenceFilter] = useState<string>("all");

  useEffect(() => {
    let isMounted = true;

    const fetchHabits = async () => {
      if (!supabase) {
        if (isMounted) {
          setError("Supabase client not available");
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;
        if (!user) {
          if (isMounted) {
            setHabits([]);
            setError("You need to be signed in to view habits.");
          }
          return;
        }

        const data = await getHabits(user.id);
        if (isMounted) {
          setHabits(data);
          setError(null);
        }
      } catch (err) {
        console.error("Failed to load habits:", err);
        if (isMounted) {
          setError("Unable to load habits right now.");
          setHabits([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchHabits();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const { routines, standaloneHabits } = useMemo(() => {
    const routineMap = new Map<string, HabitRoutineGroup>();
    const ungrouped: Habit[] = [];

    for (const habit of habits) {
      const routine = habit.routine;
      if (routine && routine.id) {
        const existing = routineMap.get(routine.id);

        if (existing) {
          existing.habits = [...existing.habits, habit];
          const existingTimestamp = existing.latestHabitUpdate ?? existing.updated_at;
          const shouldUpdate =
            new Date(habit.updated_at).getTime() >
            new Date(existingTimestamp).getTime();

          if (shouldUpdate) {
            existing.latestHabitUpdate = habit.updated_at;
          }
        } else {
          routineMap.set(routine.id, {
            id: routine.id,
            name: routine.name,
            description: routine.description,
            created_at: routine.created_at,
            updated_at: routine.updated_at,
            habits: [habit],
            latestHabitUpdate: habit.updated_at,
          });
        }
      } else {
        ungrouped.push(habit);
      }
    }

    const routineGroups = Array.from(routineMap.values())
      .map((group) => {
        const sortedHabits = [...group.habits].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
        const latestFromHabits = sortedHabits.reduce<string | null>((latest, current) => {
          if (!latest) return current.updated_at;
          return new Date(current.updated_at).getTime() > new Date(latest).getTime()
            ? current.updated_at
            : latest;
        }, group.latestHabitUpdate ?? null);

        return {
          ...group,
          habits: sortedHabits,
          latestHabitUpdate: latestFromHabits ?? group.updated_at,
        } satisfies HabitRoutineGroup;
      })
      .sort((a, b) => {
        const aDate = new Date((a.latestHabitUpdate ?? a.updated_at) || a.updated_at).getTime();
        const bDate = new Date((b.latestHabitUpdate ?? b.updated_at) || b.updated_at).getTime();
        return bDate - aDate;
      });

    return {
      routines: routineGroups,
      standaloneHabits: ungrouped,
    };
  }, [habits]);

  const summaryCards = useMemo(() => {
    const totalHabits = habits.length;
    const routineCount = routines.length;
    const groupedHabits = Math.max(totalHabits - standaloneHabits.length, 0);
    const dailyHabits = habits.filter(
      (habit) => habit.recurrence?.toLowerCase() === "daily"
    ).length;
    const latestUpdate = habits.reduce<string | null>((latest, habit) => {
      if (!latest) return habit.updated_at;
      return new Date(habit.updated_at) > new Date(latest)
        ? habit.updated_at
        : latest;
    }, null);

    const formattedLatest = latestUpdate ? formatRelativeTime(latestUpdate) : "—";

    return [
      {
        id: "total",
        label: "Total habits",
        value: String(totalHabits),
        detail:
          routineCount > 0
            ? `${routineCount} routine${routineCount === 1 ? "" : "s"}`
            : "No routines yet",
        ...SUMMARY_STYLES[0],
      },
      {
        id: "grouped",
        label: "Grouped habits",
        value: String(groupedHabits),
        detail:
          totalHabits === 0
            ? "Add your first habit"
            : `${
                routineCount > 0
                  ? `${groupedHabits} grouped`
                  : "All habits standalone"
              }${
                dailyHabits > 0
                  ? ` · ${dailyHabits} daily`
                  : ""
              }`,
        ...SUMMARY_STYLES[1],
      },
      {
        id: "recent",
        label: "Recently refreshed",
        value: formattedLatest,
        detail: "Last update",
        ...SUMMARY_STYLES[2],
      },
    ];
  }, [habits, routines, standaloneHabits]);

  const filteredHabits = useMemo(() => {
    if (recurrenceFilter === "all") {
      return habits;
    }
    const target = recurrenceFilter.toLowerCase();
    return habits.filter(habit => {
      const normalized = habit.recurrence?.toLowerCase().trim() || "none";
      return normalized === target;
    });
  }, [habits, recurrenceFilter]);

  const habitPages = useMemo(() => {
    const sorted = [...filteredHabits].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
    const pages: Habit[][] = [];
    for (let i = 0; i < sorted.length; i += 6) {
      pages.push(sorted.slice(i, i + 6));
    }
    return pages;
  }, [filteredHabits]);

  const hasHabits = habitPages.length > 0;

  return (
    <ProtectedRoute>
      <div className="relative min-h-screen overflow-hidden bg-[#05040b] pb-20 text-white">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-[#12040b] via-[#080304] to-[#010000]" />
          <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-rose-600/35 blur-[200px]" />
          <div className="absolute bottom-0 right-0 h-[460px] w-[460px] translate-x-1/4 rounded-full bg-red-500/25 blur-[220px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,80,80,0.12),_transparent_55%)] opacity-60" />
        </div>
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
          <HabitsHeader onCreate={() => router.push("/habits/new")} stats={summaryCards} />

          <HabitFilters value={recurrenceFilter} onChange={setRecurrenceFilter} />

          {error && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-4">
              <SectionHeader
                title="Habits & rituals"
                description="Pull your habits into a swipeable deck and keep streaks visible at a glance."
                className="text-white"
              />
              <div className="grid auto-cols-[minmax(220px,1fr)] grid-flow-col gap-5 overflow-hidden pb-6 sm:auto-cols-auto sm:grid-cols-2 sm:grid-flow-row sm:overflow-visible sm:pb-0 lg:grid-cols-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`skeleton-${index}`}
                    className="h-[240px] min-w-[200px] rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_20px_40px_-20px_rgba(0,0,0,0.85)]"
                  />
                ))}
              </div>
            </div>
          ) : hasHabits ? (
            <div className="space-y-4">
              <div className="relative">
                <div className="pointer-events-none absolute -top-8 right-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-white/60 sm:hidden">
                  Swipe to browse
                  <ArrowRight className="h-3 w-3" />
                </div>
                <div className="grid auto-cols-[minmax(640px,1fr)] grid-flow-col gap-5 overflow-x-auto pb-6 pr-1 snap-x snap-mandatory sm:auto-cols-auto sm:grid-cols-2 sm:grid-flow-row sm:overflow-visible sm:pb-0 sm:snap-none lg:grid-cols-3">
                  {habitPages.map((page, pageIndex) => (
                    <div
                      key={`habit-page-${pageIndex}`}
                      className="snap-start sm:[scroll-snap-align:unset]"
                      style={{ minWidth: "min(100vw-2rem, 720px)" }}
                    >
                      <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        {page.map((habit) => (
                          <HabitCompactCard key={habit.id} habit={habit} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[32px] border border-dashed border-white/15 bg-white/[0.02] p-10 text-center backdrop-blur">
              {recurrenceFilter === "all" ? (
                <HabitsEmptyState onAction={() => router.push("/habits/new")} />
              ) : (
                <div className="space-y-3 text-white/70">
                  <p className="text-lg font-semibold text-white">No habits match this cadence.</p>
                  <p className="text-sm">
                    Try another recurrence filter or create a new habit for this rhythm.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push("/habits/new")}
                    className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/[0.08]"
                  >
                    Add habit
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

interface HabitsHeaderProps {
  onCreate(): void;
  stats: Array<{
    id: string;
    label: string;
    value: string;
    detail: string;
  }>;
}

function HabitsHeader({ onCreate, stats }: HabitsHeaderProps) {
  const heroStats = stats.slice(0, 3);

  return (
    <header className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] p-8 shadow-[0_40px_120px_-60px_rgba(37,99,235,0.6)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.18),_transparent_65%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 mix-blend-screen">
        <div className="h-full w-full bg-[linear-gradient(120deg,rgba(255,255,255,0.18),transparent)]" />
      </div>
      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-white/60">Habits hub</p>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-[46px]">
              My Habits
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              Design routines, track streaks, and keep your cadences in sync with your energy.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex items-center gap-3 rounded-full border border-blue-500/60 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_15px_45px_rgba(37,99,235,0.45)] transition hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              style={{
                background: "linear-gradient(120deg, #4ea9ff, #1f69ff, #040404)",
              }}
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white">
                <Plus className="h-4 w-4" />
              </span>
              Add Habit
            </button>
          </div>
        </div>
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-black/30 p-5 backdrop-blur">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.35em] text-white/50">
            <span>Streak pulse</span>
            <span className="text-white">Live</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {heroStats.map(stat => (
              <div
                key={stat.id}
                className="min-w-[120px] flex-1 rounded-2xl border border-white/10 bg-white/[0.08] p-2.5 text-center"
              >
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">{stat.label}</p>
                <p className="mt-1 text-xl font-semibold text-white">{stat.value}</p>
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">{stat.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

interface HabitFiltersProps {
  value: string;
  onChange: (value: string) => void;
}

function HabitFilters({ value, onChange }: HabitFiltersProps) {
  const selected = RECURRENCE_FILTERS.find(option => option.value === value);
  return (
    <section className="rounded-[32px] border border-white/10 bg-white/[0.02] p-5 shadow-[0_25px_60px_rgba(5,6,12,0.55)] backdrop-blur">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-white/50">Recurrence</p>
          <p className="text-sm text-white/75">Tune the habit deck by cadence so you can focus the streaks you need.</p>
        </div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">
          {selected?.label ?? "All cadences"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {RECURRENCE_FILTERS.map(option => {
          const isActive = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(option.value)}
              className={`flex-1 min-w-[140px] rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                isActive
                  ? "border-white bg-white text-black shadow-[0_10px_30px_rgba(255,255,255,0.3)]"
                  : "border-white/15 bg-white/5 text-white/75 hover:border-white/40 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
