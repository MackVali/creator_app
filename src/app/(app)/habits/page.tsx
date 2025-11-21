"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  PageHeader,
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
  none: "No set cadence",
  daily: "Daily",
  weekly: "Weekly",
  "bi-weekly": "Bi-weekly",
  monthly: "Monthly",
  "bi-monthly": "Bi-monthly",
  yearly: "Yearly",
  "every x days": "Every X days",
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
    <article className="relative flex h-full min-h-[140px] w-full flex-col gap-1 overflow-hidden rounded-2xl border border-white/10 bg-[#150700]/90 px-3 py-2 text-white shadow-[0_18px_45px_-25px_rgba(0,0,0,0.9)] transition hover:border-white/30 hover:bg-[#1f0c04] sm:px-3 sm:py-3">
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_80%)] opacity-70"
        aria-hidden
      />
      <div className="relative z-10 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-1">
          <div className="flex items-center gap-1">
            <div
              title={avatarLabel}
              aria-label={avatarLabel}
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-base font-semibold text-amber-100 shadow-[inset_0_-1px_0_rgba(255,255,255,0.2)]"
            >
              {avatarContent}
            </div>
            <div>
              <p className="text-[0.35rem] uppercase tracking-[0.4em] text-amber-100/70">
                {routineName ? "Routine" : "Solo habit"}
              </p>
              <h3 className="text-[0.85rem] font-semibold leading-tight text-white line-clamp-2">
                {habit.name}
              </h3>
              {routineName && (
                <p className="text-[0.55rem] text-amber-100/80">{routineName}</p>
              )}
            </div>
          </div>
          <Link
            href={`/habits/${habit.id}/edit`}
            className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/[0.05] px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.3em] text-white/80 transition hover:border-white/40 hover:bg-white/[0.15]"
          >
            Edit
            <span aria-hidden>→</span>
          </Link>
        </div>
        {habit.description && (
          <p className="text-[0.55rem] text-white/70 line-clamp-2">
            {habit.description}
          </p>
        )}
        <div className="mt-auto flex flex-col gap-2 text-white/80">
          <p className="text-[0.7rem] font-semibold text-white">{recurrenceDisplay}</p>
          <div className="mt-auto space-y-0.5">
            <p className="text-[0.55rem] uppercase tracking-[0.35em] text-amber-50/80">
              Streak
            </p>
            <p className="text-[0.75rem] font-semibold text-white">
              {formatStreakDays(currentStreak)} ·{" "}
              <span aria-hidden="true">🔥</span>
              <span className="sr-only"> best streak </span>
              {formatStreakDays(longestStreak)}
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

  const habitPages = useMemo(() => {
    const sorted = [...habits].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
    const pages: Habit[][] = [];
    for (let i = 0; i < sorted.length; i += 6) {
      pages.push(sorted.slice(i, i + 6));
    }
    return pages;
  }, [habits]);

  const hasHabits = habitPages.length > 0;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#05070c] pb-16 text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          <PageHeader
            title={<span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">Habits</span>}
            description="Design your routines, track the streaks that matter, and celebrate the momentum you are building."
          >
            <Link
              href="/habits/new"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              <span className="text-lg leading-none">＋</span>
              <span>Create habit</span>
            </Link>
          </PageHeader>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {loading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6"
                  >
                    <Skeleton className="h-5 w-32" />
                    <div className="mt-4 space-y-3">
                      <Skeleton className="h-8 w-1/2" />
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-1 w-full" />
                    </div>
                  </div>
                ))
              : summaryCards.map((card) => (
                  <div
                    key={card.id}
                    className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_35px_-25px_rgba(15,23,42,0.65)]"
                  >
                    <div
                      className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.accent} opacity-80`}
                      aria-hidden
                    />
                    <div className="relative flex flex-col gap-4">
                      <div className="flex items-center gap-3 text-sm font-medium uppercase tracking-[0.2em] text-white/60">
                        <span className="h-1.5 w-1.5 rounded-full bg-white/70 shadow-[0_0_20px_6px_rgba(255,255,255,0.15)]" />
                        {card.label}
                      </div>
                      <div className="flex items-end justify-between">
                        <span className="text-3xl font-semibold tracking-tight text-white">{card.value}</span>
                        <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/70">{card.detail}</span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                        <div className={`h-full w-1/3 ${card.glow} blur-md`} aria-hidden />
                      </div>
                    </div>
                  </div>
                ))}
          </div>

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
              <SectionHeader
                title="Habit stream"
                description="Scroll through these compact streak cards to keep tabs on every routine."
                className="text-white"
              />
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
            <div className="rounded-2xl border border-white/10 bg-white/[0.03]">
              <HabitsEmptyState onAction={() => router.push("/habits/new")} />
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
