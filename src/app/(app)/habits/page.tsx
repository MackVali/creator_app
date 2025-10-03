"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

const CARD_STYLES = [
  {
    iconBg: "bg-amber-500/15 text-amber-200",
    ctaClass: "bg-amber-500/20 text-amber-100 hover:bg-amber-500/30",
  },
  {
    iconBg: "bg-emerald-500/15 text-emerald-200",
    ctaClass: "bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30",
  },
  {
    iconBg: "bg-sky-500/15 text-sky-200",
    ctaClass: "bg-sky-500/20 text-sky-100 hover:bg-sky-500/30",
  },
  {
    iconBg: "bg-indigo-500/15 text-indigo-200",
    ctaClass: "bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30",
  },
  {
    iconBg: "bg-purple-500/15 text-purple-200",
    ctaClass: "bg-purple-500/20 text-purple-100 hover:bg-purple-500/30",
  },
  {
    iconBg: "bg-rose-500/15 text-rose-200",
    ctaClass: "bg-rose-500/20 text-rose-100 hover:bg-rose-500/30",
  },
];

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

function formatTimeLabel(value: string | null | undefined) {
  if (!value) return null;
  const [hour, minute] = value.split(":");
  if (typeof hour === "undefined" || typeof minute === "undefined") {
    return null;
  }

  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatWindowRange(
  start: string | null | undefined,
  end: string | null | undefined
) {
  const startLabel = formatTimeLabel(start);
  const endLabel = formatTimeLabel(end);
  if (!startLabel || !endLabel) return null;
  return `${startLabel} – ${endLabel}`;
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

  const summaryCards = useMemo(() => {
    const totalHabits = habits.length;
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
        detail: "Active routines",
        ...SUMMARY_STYLES[0],
      },
      {
        id: "daily",
        label: "Daily cadence",
        value: String(dailyHabits),
        detail: "Marked as daily",
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
  }, [habits]);

  const hasHabits = habits.length > 0;

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
            <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6"
                >
                  <Skeleton className="h-12 w-12 rounded-xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                  <Skeleton className="mt-2 h-3 w-24" />
                </div>
              ))}
            </div>
          ) : hasHabits ? (
            <>
              <SectionHeader
                title="Your daily rhythm"
                description="Track streaks, consistency, and the rituals that keep you moving."
                className="text-white"
              />

              <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
                {habits.map((habit, index) => {
                  const palette = CARD_STYLES[index % CARD_STYLES.length];
                  const initials = habit.name.charAt(0).toUpperCase();
                  const habitType = formatTitleCase(habit.habit_type);
                  const recurrence = formatTitleCase(habit.recurrence);
                  const hasDuration =
                    typeof habit.duration_minutes === "number" &&
                    habit.duration_minutes > 0;
                  const durationLabel = hasDuration
                    ? `${habit.duration_minutes} min`
                    : null;
                  const windowLabel = habit.window?.label ?? null;
                  const windowRange = formatWindowRange(
                    habit.window?.start_local,
                    habit.window?.end_local
                  );
                  const windowEnergy = formatTitleCase(habit.window?.energy);

                  return (
                    <article
                      key={habit.id}
                      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_18px_45px_-25px_rgba(15,23,42,0.6)] transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_28px_55px_-20px_rgba(15,23,42,0.7)]"
                    >
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),transparent_60%)] opacity-0 transition duration-300 group-hover:opacity-100" />
                      <div className="relative flex items-start justify-between gap-4">
                        <div
                          className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl font-semibold ${palette.iconBg}`}
                        >
                          {initials}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {habitType && (
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white/70">
                              {habitType}
                            </span>
                          )}
                          {recurrence && (
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white/70">
                              {recurrence}
                            </span>
                          )}
                          {durationLabel && (
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white/70">
                              {durationLabel}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="relative mt-6 space-y-3">
                        <h3 className="text-xl font-semibold tracking-tight text-white">
                          {habit.name}
                        </h3>
                        {habit.description && (
                          <p className="text-sm text-white/70">{habit.description}</p>
                        )}
                      </div>

                      <div className="relative mt-6 space-y-3 text-xs text-white/60">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🕒</span>
                          <span>Updated {formatRelativeTime(habit.updated_at)}</span>
                        </div>
                        {durationLabel && (
                          <div className="flex items-center gap-2">
                            <span className="text-base">⏱️</span>
                            <span>Planned for {durationLabel}</span>
                          </div>
                        )}
                        {windowLabel && (
                          <div className="flex items-center gap-2">
                            <span className="text-base">🪟</span>
                            <span>
                              {windowLabel}
                              {windowRange ? ` • ${windowRange}` : ""}
                              {windowEnergy ? ` • ${windowEnergy}` : ""}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-base">📅</span>
                          <span>Created {formatRelativeTime(habit.created_at)}</span>
                        </div>
                      </div>

                      <div className="relative mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-5 text-xs text-white/60">
                        <div className="flex items-center gap-2">
                          <span className="text-base">✨</span>
                          <span>Keep the streak going</span>
                        </div>
                        <button
                          type="button"
                          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${palette.ctaClass}`}
                          disabled
                        >
                          <span>Mark complete</span>
                          <span aria-hidden>→</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
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
