"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Grid2X2,
  Layers3,
  PenLine,
  RefreshCcw,
  SlidersHorizontal,
  UsersRound,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { HabitsEmptyState } from "@/components/ui";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getHabits, type Habit } from "@/lib/queries/habits";

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

function normalizeStreakDays(value?: number | null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  return 0;
}

function formatStreakDays(days: number) {
  return `${days}x`;
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
  const progressWidth = `${Math.min(
    100,
    Math.max(18, (currentStreak / Math.max(longestStreak, currentStreak, 1)) * 100)
  )}%`;

  return (
    <article className="group relative flex min-h-[156px] flex-col overflow-hidden rounded-[20px] border border-blue-400/28 bg-[linear-gradient(145deg,rgba(12,28,64,0.96),rgba(5,11,26,0.98)_62%,rgba(7,15,33,0.98))] p-3 text-white shadow-[0_18px_44px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:-translate-y-0.5 hover:border-blue-300/55 hover:shadow-[0_22px_62px_rgba(22,82,210,0.24)] sm:min-h-[170px] sm:p-3.5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(69,132,255,0.34),transparent_42%)] opacity-80" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-200/60 to-transparent" />
      <div className="relative z-10 flex h-full flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div
              title={avatarLabel}
              aria-label={avatarLabel}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-400/55 bg-[radial-gradient(circle_at_35%_25%,rgba(126,190,255,0.38),rgba(11,31,75,0.92)_52%,rgba(3,7,18,0.98))] text-[15px] font-semibold text-white shadow-[0_0_22px_rgba(38,108,255,0.22),inset_0_0_16px_rgba(38,108,255,0.22)] sm:h-11 sm:w-11"
            >
              {avatarContent}
            </div>
            <div className="min-w-0">
              <p className="text-[8px] font-semibold uppercase tracking-[0.26em] text-blue-200/75 sm:text-[9px]">
                {routineName ? "Routine Habit" : "Solo Habit"}
              </p>
              <h3 className="mt-0.5 line-clamp-2 break-words text-[15px] font-semibold uppercase leading-[1.05] text-[#f4f7ff] sm:text-[17px]">
                {habit.name}
              </h3>
              {routineName && (
                <p className="mt-0.5 line-clamp-1 text-[10px] text-white/60">
                  {routineName}
                </p>
              )}
            </div>
          </div>
          <Link
            href={`/habits/${habit.id}/edit`}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-medium text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-blue-300/50 hover:bg-blue-400/10 hover:text-white"
          >
            Edit
            <PenLine className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
        {habit.description && (
          <p className="line-clamp-1 text-[10px] leading-snug text-white/60 sm:text-[11px]">
            {habit.description}
          </p>
        )}
        <div className="mt-auto border-t border-white/10 pt-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.22em] text-blue-200/75 sm:text-[9px]">
                <CalendarDays className="h-3 w-3 text-blue-400 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                Recurrence
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-tight text-white/90 sm:text-[12px]">
                {recurrenceDisplay}
              </p>
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.22em] text-blue-200/75 sm:text-[9px]">
                <Zap className="h-3 w-3 text-blue-400 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
                Streak
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-tight text-white/90 sm:text-[12px]">
                {formatStreakDays(currentStreak)} current
                <span aria-hidden className="px-1 text-blue-300/80">
                  ·
                </span>
                {formatStreakDays(longestStreak)} best
              </p>
            </div>
          </div>
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-400 via-sky-300 to-blue-500 shadow-[0_0_14px_rgba(59,130,246,0.85)]"
              style={{ width: progressWidth }}
            />
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
        icon: Layers3,
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
        icon: UsersRound,
      },
      {
        id: "recent",
        label: "Recently refreshed",
        value: formattedLatest,
        detail: "Last update",
        icon: RefreshCcw,
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
    for (let i = 0; i < sorted.length; i += 4) {
      pages.push(sorted.slice(i, i + 4));
    }
    return pages;
  }, [filteredHabits]);

  const hasHabits = habitPages.length > 0;

  return (
    <ProtectedRoute>
      <div className="relative min-h-screen overflow-hidden bg-[#030711] pb-[calc(6.75rem+env(safe-area-inset-bottom,0px))] text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,#030711_0%,#050914_44%,#010309_100%)]" />
          <div className="absolute -top-44 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-blue-700/22 blur-[170px]" />
          <div className="absolute top-28 right-[-9rem] h-[24rem] w-[24rem] rounded-full bg-cyan-500/10 blur-[150px]" />
          <div className="absolute bottom-0 left-[-7rem] h-[28rem] w-[28rem] rounded-full bg-indigo-600/12 blur-[170px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.08),transparent_42%)]" />
        </div>
        <div className="relative mx-auto flex w-full max-w-[59rem] flex-col gap-4 px-3.5 pb-3 pt-3 sm:gap-4 sm:px-5 sm:pt-4 lg:px-6">
          <StreakPulse stats={summaryCards} />
          <HabitFilters value={recurrenceFilter} onChange={setRecurrenceFilter} />

          {error && (
            <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-50 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
              {error}
            </div>
          )}

          {loading ? (
            <section className="space-y-2.5">
              <BrowseHeader />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`skeleton-${index}`}
                    className="h-[156px] rounded-[20px] border border-blue-300/15 bg-white/[0.035] shadow-[0_18px_45px_rgba(0,0,0,0.4)] sm:h-[170px]"
                  />
                ))}
              </div>
            </section>
          ) : hasHabits ? (
            <section className="space-y-2.5">
              <BrowseHeader />
              <div className="relative">
                <div className="grid auto-cols-[minmax(min(100%,calc(100vw_-_1.75rem)),1fr)] grid-flow-col gap-3 overflow-x-auto pb-2 pr-1 snap-x snap-mandatory [scrollbar-width:none] sm:auto-cols-auto sm:grid-cols-2 sm:grid-flow-row sm:overflow-visible sm:pb-0 sm:snap-none">
                  {habitPages.map((page, pageIndex) => (
                    <div
                      key={`habit-page-${pageIndex}`}
                      className="snap-start sm:contents sm:[scroll-snap-align:unset]"
                    >
                      <div className="grid grid-cols-2 gap-3 sm:contents">
                        {page.map((habit) => (
                          <HabitCompactCard key={habit.id} habit={habit} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <div className="rounded-[30px] border border-dashed border-blue-300/20 bg-white/[0.035] p-8 text-center shadow-[0_24px_70px_rgba(0,0,0,0.38)] backdrop-blur">
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
                    className="inline-flex items-center justify-center rounded-full border border-blue-300/35 bg-blue-500/15 px-4 py-2 text-sm font-semibold text-white transition hover:border-blue-200/60 hover:bg-blue-500/25"
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

type StreakPulseStat = {
  id: string;
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
};

interface StreakPulseProps {
  stats: StreakPulseStat[];
}

function StreakPulse({ stats }: StreakPulseProps) {
  return (
    <section className="rounded-[26px] border border-blue-200/14 bg-white/[0.035] p-4 shadow-[0_20px_58px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur sm:p-5">
      <div className="mb-3.5 flex items-center justify-between gap-3 px-0.5">
        <p className="text-[13px] font-semibold uppercase tracking-[0.36em] text-blue-300 sm:text-[14px]">
          Habit Hub
        </p>
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em] text-white/80 sm:text-[11px]">
          <span className="h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_14px_rgba(96,165,250,0.95)]" />
          Live
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <div
              key={stat.id}
              className="relative min-h-[104px] overflow-hidden rounded-[18px] border border-blue-300/20 bg-[linear-gradient(145deg,rgba(13,28,64,0.72),rgba(5,10,24,0.78))] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:min-h-[116px] sm:p-3"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(59,130,246,0.18),transparent_52%)]" />
              <div className="relative flex h-full flex-col justify-between gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-blue-400/45 bg-blue-500/10 text-blue-300 shadow-[inset_0_0_18px_rgba(59,130,246,0.18)] sm:h-9 sm:w-9">
                  <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="line-clamp-2 min-h-[22px] text-[8px] font-semibold uppercase leading-[1.35] tracking-[0.2em] text-blue-100/70 sm:text-[10px] sm:tracking-[0.26em]">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-[clamp(1.35rem,5.5vw,1.9rem)] font-semibold leading-none tracking-tight text-white sm:text-[2rem]">
                    {stat.value}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-white/60 sm:text-[11px]">
                    {stat.detail}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BrowseHeader() {
  return (
    <div className="flex items-center justify-between gap-3 px-0.5">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.36em] text-blue-400 sm:text-[12px]">
        <Grid2X2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
        Browse Habits
      </p>
      <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.3em] text-white/45 sm:text-[10px]">
        Swipe to browse
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </p>
    </div>
  );
}

interface HabitFiltersProps {
  value: string;
  onChange: (value: string) => void;
}

function HabitFilters({ value, onChange }: HabitFiltersProps) {
  const selected = RECURRENCE_FILTERS.find((option) => option.value === value);
  const cadenceOptions = RECURRENCE_FILTERS.filter((option) => option.value !== "all");
  const allCadencesOption = RECURRENCE_FILTERS.find((option) => option.value === "all");

  return (
    <section className="rounded-[22px] border border-blue-200/12 bg-white/[0.03] px-5 py-5 shadow-[0_14px_42px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur sm:px-7 sm:py-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-blue-400/30 bg-blue-500/10 text-blue-400">
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-blue-400 sm:text-[11px]">
              Recurrence
            </p>
            <p className="mt-0.5 max-w-[28rem] text-[11px] leading-[0.9rem] text-white/58 sm:text-[12px] sm:leading-4">
              Tune the habit deck by cadence so you can focus the streaks you need.
            </p>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 pt-0.5 text-[9px] font-semibold uppercase tracking-[0.24em] text-blue-300 sm:flex">
          {selected?.label ?? "All cadences"}
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {cadenceOptions.map((option) => {
          const isActive = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(option.value)}
              className={`inline-flex h-9 min-w-0 items-center justify-center rounded-full border px-1.5 text-center text-[0.58rem] font-semibold uppercase leading-none tracking-[0.06em] whitespace-nowrap transition sm:px-2 sm:text-[0.65rem] sm:tracking-[0.08em] ${
                isActive
                  ? "border-blue-200/55 bg-[linear-gradient(135deg,#3b82f6,#1d4ed8)] text-white shadow-[0_0_18px_rgba(59,130,246,0.4),inset_0_1px_0_rgba(255,255,255,0.22)]"
                  : "border-blue-200/16 bg-slate-950/26 text-white/68 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-blue-300/40 hover:bg-blue-500/10 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {allCadencesOption && (
        <button
          type="button"
          aria-pressed={allCadencesOption.value === value}
          onClick={() => onChange(allCadencesOption.value)}
          className={`mt-2 inline-flex h-9 w-full min-w-0 items-center justify-center rounded-full border px-2 text-center text-[0.65rem] font-semibold uppercase leading-none tracking-[0.08em] whitespace-nowrap transition ${
            allCadencesOption.value === value
              ? "border-blue-200/55 bg-[linear-gradient(135deg,#3b82f6,#1d4ed8)] text-white shadow-[0_0_18px_rgba(59,130,246,0.4),inset_0_1px_0_rgba(255,255,255,0.22)]"
              : "border-blue-200/16 bg-slate-950/26 text-white/68 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-blue-300/40 hover:bg-blue-500/10 hover:text-white"
          }`}
        >
          {allCadencesOption.label}
        </button>
      )}
    </section>
  );
}
