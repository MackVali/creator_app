"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CalendarDays, Clock3, Target, ArrowLeft, Award } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { FilteredGoalsGrid } from "@/components/goals/FilteredGoalsGrid";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NotesGrid } from "@/components/notes/NotesGrid";
import { Button } from "@/components/ui/button";
import { evaluateHabitDueOnDate } from "@/lib/scheduler/habitRecurrence";
import { normalizeTimeZone } from "@/lib/scheduler/timezone";
import type { HabitScheduleItem } from "@/lib/scheduler/habits";
import {
  mapRowToProgress,
  type SkillProgressData,
  type SkillProgressRow,
} from "@/lib/skills/skillProgress";

interface Skill {
  id: string;
  name: string;
  icon: string | null;
  level: number;
  created_at: string;
}

interface HabitSummary {
  id: string;
  name: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastCompletedAt: string | null;
  recurrence: string | null;
  recurrenceDays: number[] | null;
  habitType: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_LOOKAHEAD_DAYS = 365;

function normalizeRecurrenceDays(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = Array.from(
    new Set(
      value
        .map((day) => {
          if (typeof day === "number") return day;
          const parsed = Number(day);
          return Number.isFinite(parsed) ? parsed : null;
        })
        .filter((day): day is number => day !== null)
        .map((day) => {
          const remainder = day % 7;
          return remainder < 0 ? remainder + 7 : remainder;
        })
    )
  );

  return normalized.length > 0 ? normalized : null;
}

function buildScheduleHabit(habit: HabitSummary): HabitScheduleItem {
  return {
    id: habit.id,
    name: habit.name,
    durationMinutes: null,
    createdAt: habit.createdAt,
    updatedAt: habit.updatedAt,
    lastCompletedAt: habit.lastCompletedAt,
    habitType: (habit.habitType ?? "HABIT").toUpperCase(),
    windowId: null,
    energy: null,
    recurrence: habit.recurrence,
    recurrenceDays: habit.recurrenceDays,
    skillId: null,
    goalId: null,
    completionTarget: null,
    locationContextId: null,
    locationContextValue: null,
    locationContextName: null,
    daylightPreference: null,
    windowEdgePreference: null,
    window: null,
  } satisfies HabitScheduleItem;
}

function computeHabitDueLabel(habit: HabitSummary, timeZone: string): string {
  const normalizedZone = normalizeTimeZone(timeZone);
  const scheduleHabit = buildScheduleHabit(habit);
  const today = new Date();

  const todayEvaluation = evaluateHabitDueOnDate({
    habit: scheduleHabit,
    date: today,
    timeZone: normalizedZone,
  });

  if (todayEvaluation.isDue) {
    return "Due Now";
  }

  for (let dayOffset = 1; dayOffset <= MAX_LOOKAHEAD_DAYS; dayOffset += 1) {
    const futureDate = new Date(today.getTime() + dayOffset * MS_PER_DAY);
    const evaluation = evaluateHabitDueOnDate({
      habit: scheduleHabit,
      date: futureDate,
      timeZone: normalizedZone,
    });

    if (evaluation.isDue) {
      if (dayOffset === 1) {
        return "Due in 1 Day";
      }
      return `Due in ${dayOffset} Days`;
    }
  }

  return "Due Now";
}

function describeLevel(level: number): string {
  if (level >= 10) {
    return "Mastery in motion.";
  }
  if (level >= 6) {
    return "Building serious momentum.";
  }
  if (level >= 3) {
    return "Solidifying the fundamentals.";
  }
  return "Laying the groundwork for growth.";
}

export default function SkillDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SkillProgressData | null>(null);
  const [relatedHabits, setRelatedHabits] = useState<HabitSummary[]>([]);
  const [habitsLoading, setHabitsLoading] = useState(true);
  const [habitsError, setHabitsError] = useState<string | null>(null);
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  const timeZone = useMemo(() => {
    try {
      return normalizeTimeZone(
        Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"
      );
    } catch (err) {
      console.error("Failed to determine user timezone", err);
      return "UTC";
    }
  }, []);
  const decoratedHabits = useMemo(
    () =>
      relatedHabits.map((habit) => ({
        ...habit,
        dueLabel: computeHabitDueLabel(habit, timeZone),
      })),
    [relatedHabits, timeZone]
  );

  useEffect(() => {
    let cancelled = false;

    const fetchRelatedHabits = async (userId: string | null) => {
      if (!supabase || !userId) {
        if (!cancelled) {
          setRelatedHabits([]);
          setHabitsLoading(false);
        }
        return;
      }

      try {
        const { data: habitsData, error: habitsError } = await supabase
          .from("habits")
          .select(
            "id, name, created_at, updated_at, recurrence, recurrence_days, habit_type"
          )
          .eq("user_id", userId)
          .eq("skill_id", id)
          .order("name", { ascending: true });

        if (habitsError) {
          throw habitsError;
        }

        if (!cancelled) {
          const formattedHabits = (habitsData ?? [])
            .map((habit) => {
              if (!habit) return null;

              const habitRecord = habit as {
                id?: unknown;
                name?: unknown;
                created_at?: unknown;
                updated_at?: unknown;
                recurrence?: unknown;
                recurrence_days?: unknown;
                habit_type?: unknown;
              };

              const habitId =
                typeof habitRecord.id === "string" ? habitRecord.id : null;
              if (!habitId) return null;

              const habitName =
                typeof habitRecord.name === "string" && habitRecord.name.trim().length > 0
                  ? habitRecord.name.trim()
                  : "Untitled habit";

              const createdAt =
                typeof habitRecord.created_at === "string"
                  ? habitRecord.created_at
                  : null;
              const updatedAt =
                typeof habitRecord.updated_at === "string"
                  ? habitRecord.updated_at
                  : null;
              const recurrence =
                typeof habitRecord.recurrence === "string" && habitRecord.recurrence.trim().length > 0
                  ? habitRecord.recurrence
                  : null;
              const recurrenceDays = normalizeRecurrenceDays(
                habitRecord.recurrence_days
              );
              const habitType =
                typeof habitRecord.habit_type === "string" && habitRecord.habit_type.trim().length > 0
                  ? habitRecord.habit_type
                  : null;
              const lastCompletedAt = updatedAt ?? createdAt;

              return {
                id: habitId,
                name: habitName,
                createdAt,
                updatedAt,
                lastCompletedAt,
                recurrence,
                recurrenceDays,
                habitType,
              } satisfies HabitSummary;
            })
            .filter((habit): habit is HabitSummary => habit !== null);

          setRelatedHabits(formattedHabits);
        }
      } catch (habitErr) {
        if (!cancelled) {
          console.error("Error fetching related habits:", habitErr);
          setRelatedHabits([]);
          setHabitsError("Unable to load related habits right now.");
        }
      } finally {
        if (!cancelled) {
          setHabitsLoading(false);
        }
      }
    };

    const fetchSkillProgress = async (userId: string | null) => {
      if (!supabase || !userId) {
        if (!cancelled) {
          setProgress(null);
        }
        return;
      }

      try {
        const { data: progressRow, error: progressError } = await supabase
          .from("skill_progress")
          .select(
            `
              skill_id,
              level,
              prestige,
              xp_into_level,
              skill_badges (
                id,
                badge_id,
                badges (
                  level,
                  emoji,
                  label,
                  description
                )
              )
            `,
          )
          .eq("user_id", userId)
          .eq("skill_id", id)
          .maybeSingle();

        if (!cancelled) {
          if (progressError && progressError.code !== "PGRST116") {
            console.error("Error fetching skill progress:", progressError);
          }

          const mapped = mapRowToProgress((progressRow ?? null) as SkillProgressRow | null);
          setProgress(mapped);
        }
      } catch (progressErr) {
        if (!cancelled) {
          console.error("Unexpected error fetching skill progress:", progressErr);
          setProgress(null);
        }
      }
    };

    async function load() {
      if (!supabase || !id) return;

      setLoading(true);
      setError(null);
      setHabitsError(null);
      setRelatedHabits([]);
      setHabitsLoading(true);
      setProgress(null);

      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        const userId = authData.user?.id ?? null;

        let skillQuery = supabase
          .from("skills")
          .select("id,name,icon,level,created_at")
          .eq("id", id);

        if (userId) {
          skillQuery = skillQuery.eq("user_id", userId);
        }

        const { data, error } = await skillQuery.single();

        if (!cancelled) {
          if (error) {
            console.error("Error fetching skill:", error);
            setError("Failed to load skill");
            setHabitsLoading(false);
          } else {
            setSkill(data);
            await Promise.all([
              fetchRelatedHabits(userId),
              fetchSkillProgress(userId),
            ]);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Error loading skill:", err);
          setError("Failed to load skill");
          setHabitsLoading(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, id]);

  if (loading) {
    return (
      <main className="px-4 pb-16 pt-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-10">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 p-8 shadow-[0_30px_60px_rgba(15,23,42,0.45)]">
            <div className="flex flex-col items-center gap-6 md:flex-row md:items-center md:gap-10">
              <Skeleton className="h-28 w-28 rounded-2xl" />
              <div className="flex w-full flex-1 flex-col gap-4">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex flex-wrap gap-3">
                  <Skeleton className="h-8 w-24 rounded-full" />
                  <Skeleton className="h-8 w-28 rounded-full" />
                  <Skeleton className="h-8 w-32 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-60 rounded-2xl border border-white/5 bg-slate-900/40" />
          </div>

          <div className="space-y-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-60 rounded-2xl border border-white/5 bg-slate-900/40" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !skill) {
    return (
      <main className="px-4 pb-16 pt-10">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-3xl border border-red-500/30 bg-red-500/10 px-8 py-12 text-center shadow-[0_25px_60px_rgba(220,38,38,0.35)]">
            <h1 className="text-2xl font-semibold text-red-100">
              {error || "Skill not found"}
            </h1>
            <p className="mt-4 text-sm text-red-100/80">
              {error
                ? "Please try again later."
                : "This skill doesn't exist or you don't have access to it."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const createdAt = skill.created_at ? new Date(skill.created_at) : null;
  const hasValidDate = createdAt && !Number.isNaN(createdAt.getTime());
  const formattedCreatedAt = hasValidDate ? formatDate(skill.created_at) : null;
  const daysTracked = hasValidDate
    ? Math.max(
        0,
        Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
      )
    : null;
  const createdRelativeText = hasValidDate
    ? daysTracked === 0
      ? "Added today."
      : `Added ${daysTracked} day${daysTracked === 1 ? "" : "s"} ago.`
    : "Creation date unavailable.";

  const skillBadges = progress?.badges ?? [];
  const skillBadgeCount = skillBadges.length;

  const stats = [
    {
      label: "Skill level",
      value: `Lv ${skill.level}`,
      description: describeLevel(skill.level),
      icon: Target,
    },
    {
      label: "Badges",
      value:
        skillBadgeCount > 0
          ? `${skillBadgeCount} badge${skillBadgeCount === 1 ? "" : "s"}`
          : "No badges yet",
      description:
        skillBadgeCount > 0
          ? `Unlocked ${skillBadgeCount} badge${
              skillBadgeCount === 1 ? "" : "s"
            } for ${skill.name}.`
          : "Level milestones and prestige resets unlock badges for this skill.",
      icon: Award,
    },
    {
      label: "Added to timeline",
      value: formattedCreatedAt ?? "Not available",
      description: createdRelativeText,
      icon: CalendarDays,
    },
    {
      label: "Days tracked",
      value:
        daysTracked !== null
          ? `${daysTracked} day${daysTracked === 1 ? "" : "s"}`
          : "Not tracked",
      description:
        daysTracked !== null
          ? `Time since you logged ${skill.name}.`
          : "Tracking duration unavailable.",
      icon: Clock3,
    },
  ];

  const icon = skill.icon || "💡";
  

  const handleCreateGoal = () => {
    router.push("/goals/new");
  };

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="w-fit gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-medium text-white/70 backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
        >
          <Link href="/skills">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to skills
          </Link>
        </Button>

        <section aria-labelledby="skill-overview" className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#05060a] via-[#11121a] to-[#1a1c27] p-6 shadow-[0_35px_120px_-45px_rgba(15,23,42,0.8)] sm:p-8">
          <div className="absolute inset-0">
            <div className="absolute inset-x-10 -top-28 h-64 rounded-full bg-[radial-gradient(circle,_rgba(129,140,248,0.28),_transparent_70%)] blur-3xl" />
            <div className="absolute -bottom-24 -right-16 h-60 w-60 rounded-full bg-[radial-gradient(circle,_rgba(56,189,248,0.25),_transparent_65%)] blur-3xl" />
          </div>
          <div className="relative flex flex-col gap-8 md:flex-row md:items-center">
            <div className="flex items-start gap-5">
              <span
                className="flex h-[88px] w-[88px] items-center justify-center rounded-3xl bg-white/10 text-5xl text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-white/20"
                role="img"
                aria-label={`Skill: ${skill.name}`}
              >
                {icon}
              </span>
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/80 backdrop-blur">
                  Skill overview
                </div>
                <h1 id="skill-overview" className="text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl">
                  {skill.name}
                </h1>
                <p className="max-w-xl text-sm text-white/70 sm:text-base">
                  Everything connected to {skill.name} lives here — goals, notes, and the progress you&apos;re making along the way.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <div className="flex items-center gap-1 text-lg leading-none">
                    {skillBadges.length > 0 ? (
                      skillBadges.map((badge) => (
                        <span
                          key={badge.id}
                          role="img"
                          aria-label={badge.label}
                          title={badge.label}
                          className="drop-shadow-[0_0_6px_rgba(255,255,255,0.35)]"
                        >
                          {badge.emoji}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/35">
                        No badges yet
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <dl className="relative mt-8 grid gap-3 sm:grid-cols-3">
            {stats.map(({ label, value, description, icon: Icon }) => (
              <div
                key={label}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur transition hover:border-white/20 hover:bg-white/10"
              >
                <div className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.14),_transparent_60%)] opacity-0 transition group-hover:opacity-100" />
                <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/60">
                  <span className="flex size-7 items-center justify-center rounded-full bg-white/10 text-white/70">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  {label}
                </dt>
                <dd className="mt-2 text-lg font-semibold text-white">{value}</dd>
                <p className="mt-2 text-xs text-white/60">{description}</p>
              </div>
            ))}
          </dl>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#060608] via-[#10121a] to-[#1a1d28] p-6 shadow-[0_28px_90px_-48px_rgba(15,23,42,0.75)] sm:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(129,140,248,0.18),_transparent_60%)]" />
            <header className="relative flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.3em] text-white/60">Goals</p>
                <h2 className="text-lg font-semibold text-white sm:text-xl">Projects driving this skill</h2>
                <p className="text-xs text-white/60 sm:text-sm">
                  Explore the goal folders powering {skill.name} and see the projects pushing it forward.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCreateGoal}
                className="rounded-full border-white/20 bg-white/5 px-4 text-white backdrop-blur hover:border-white/30 hover:bg-white/10"
              >
                New goal
              </Button>
            </header>
            <div className="relative mt-6">
              <FilteredGoalsGrid entity="skill" id={id} displayMode="minimal" onCreateGoal={handleCreateGoal} />
            </div>
          </section>

          <section className="relative space-y-6">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#070709] via-[#11131a] to-[#1c1f2b] p-6 shadow-[0_28px_90px_-48px_rgba(15,23,42,0.78)] sm:p-7">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_60%)]" />
              <header className="relative flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-[0.3em] text-white/60">Notes</p>
                  <h2 className="text-lg font-semibold text-white sm:text-xl">Keep discoveries close</h2>
                  <p className="text-xs text-white/60 sm:text-sm">
                    Save learnings, resources, and reminders tied to {skill.name}.
                  </p>
                </div>
              </header>
              <div className="relative mt-5">
                <NotesGrid skillId={id} />
              </div>
            </div>

            <Card className="relative overflow-hidden rounded-3xl border-white/10 bg-white/5 shadow-[0_24px_60px_-45px_rgba(15,23,42,0.7)] backdrop-blur">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(129,140,248,0.18),_transparent_70%)]" />
              <CardHeader className="relative pb-2">
                <CardTitle className="text-base font-semibold text-white">Related habits</CardTitle>
                <CardDescription className="text-white/70">
                  Rituals that reinforce {skill.name}.
                </CardDescription>
              </CardHeader>
              <CardContent className="relative">
                {habitsLoading ? (
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton key={index} className="h-8 w-24 rounded-full" />
                    ))}
                  </div>
                ) : habitsError ? (
                  <p className="text-xs text-white/60">{habitsError}</p>
                ) : relatedHabits.length === 0 ? (
                  <p className="text-xs text-white/60">no habits related to this skill yet</p>
                ) : (
                  <div className="grid gap-2">
                    {decoratedHabits.map((habit) => (
                      <div
                        key={habit.id}
                        className="flex flex-col gap-1 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-white/80 backdrop-blur transition hover:border-white/25 hover:bg-white/15"
                      >
                        <span className="text-sm font-medium text-white">{habit.name}</span>
                        <span className="text-xs font-medium uppercase tracking-[0.18em] text-white/60">
                          {habit.dueLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden rounded-3xl border-white/10 bg-white/5 shadow-[0_24px_60px_-45px_rgba(15,23,42,0.7)] backdrop-blur">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(129,140,248,0.14),_transparent_70%)]" />
              <CardHeader className="relative">
                <CardTitle className="text-base font-semibold text-white">Need a different view?</CardTitle>
                <CardDescription className="text-white/70">
                  Jump back to your full skills library to reorganize, add new abilities, or explore other focuses.
                </CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <Button
                  asChild
                  size="sm"
                  className="rounded-full bg-white px-5 text-slate-900 shadow-sm transition hover:bg-white/90"
                >
                  <Link href="/skills">Open skills dashboard</Link>
                </Button>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}
