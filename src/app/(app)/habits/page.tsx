"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck,
  ListChecks,
  RefreshCw,
  Sparkles,
  Sun,
  Plus,
  Clock3,
} from "lucide-react";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  ContentCard,
  GridContainer,
  PageHeader,
  SectionHeader,
} from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HabitsEmptyState } from "@/components/ui/empty-state";
import { GridSkeleton } from "@/components/ui/skeleton";
import { useToastHelpers } from "@/components/ui/toast";
import { getHabitsForUser } from "@/lib/queries/habits";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { HabitRecurrence, HabitRow } from "@/lib/types/habit";
import { cn } from "@/lib/utils";

type SummaryCard = {
  id: string;
  label: string;
  value: number;
  description: string;
  accent: string;
  Icon: LucideIcon;
};

const RECURRENCE_LABELS: Record<HabitRecurrence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  "bi-weekly": "Bi-weekly",
  monthly: "Monthly",
  "bi-monthly": "Bi-monthly",
  yearly: "Yearly",
  "every x days": "Custom cadence",
};

function formatRecurrence(recurrence: HabitRow["recurrence"]): string {
  if (!recurrence) {
    return "No cadence set";
  }

  return RECURRENCE_LABELS[recurrence] ?? recurrence;
}

function formatDate(value: string | null): string {
  if (!value) return "Unknown";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default function HabitsPage() {
  const router = useRouter();
  const toast = useToastHelpers();
  const toastRef = useRef(toast);
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const loadHabits = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseBrowser();

    if (!supabase) {
      const message = "Supabase client is not configured.";
      setHabits([]);
      setErrorMessage(message);
      toastRef.current.error("Unable to load habits", message);
      setLoading(false);
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setHabits([]);
        setErrorMessage(null);
        setLoading(false);
        return;
      }

      const data = await getHabitsForUser(user.id);
      setHabits(data);
      setErrorMessage(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      setErrorMessage(message);
      toastRef.current.error(
        "Failed to load habits",
        message,
        () => void loadHabits()
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHabits();
  }, [loadHabits]);

  const summaryCards: SummaryCard[] = useMemo(() => {
    const total = habits.length;
    const daily = habits.filter((habit) => habit.recurrence === "daily").length;
    const weekly = habits.filter((habit) =>
      habit.recurrence === "weekly" || habit.recurrence === "bi-weekly"
    ).length;
    const chores = habits.filter((habit) => habit.habit_type === "CHORE").length;

    return [
      {
        id: "total",
        label: "Active routines",
        value: total,
        description:
          total === 1 ? "habit currently tracked" : "habits currently tracked",
        accent: "bg-blue-500/10 text-blue-400",
        Icon: ListChecks,
      },
      {
        id: "daily",
        label: "Daily cadence",
        value: daily,
        description: daily === 1 ? "daily habit" : "daily habits",
        accent: "bg-amber-500/10 text-amber-400",
        Icon: Sun,
      },
      {
        id: "weekly",
        label: "Weekly focus",
        value: weekly,
        description: weekly === 1 ? "weekly habit" : "weekly habits",
        accent: "bg-purple-500/10 text-purple-400",
        Icon: CalendarCheck,
      },
      {
        id: "chores",
        label: "Chores",
        value: chores,
        description: chores === 1 ? "active chore" : "active chores",
        accent: "bg-emerald-500/10 text-emerald-400",
        Icon: Sparkles,
      },
    ];
  }, [habits]);

  const handleRefresh = () => {
    void loadHabits();
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
          <PageHeader
            title="Habits"
            description="Track the routines that keep your momentum and refine the cadence that works for you."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={loading}
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4",
                    loading ? "animate-spin" : "text-muted-foreground"
                  )}
                />
                Refresh
              </Button>
              <Button asChild>
                <Link href="/habits/new">
                  <Plus className="h-4 w-4" />
                  Create habit
                </Link>
              </Button>
            </div>
          </PageHeader>

          {errorMessage && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          <div className="space-y-6">
            <SectionHeader
              title="Overview"
              description="Understand how your routines are distributed across cadence and type."
            />

            {loading ? (
              <GridSkeleton cols={4} rows={1} />
            ) : (
              <GridContainer cols={4} gap="lg">
                {summaryCards.map(({ id, label, value, description, accent, Icon }) => (
                  <ContentCard
                    key={id}
                    className="border border-border/60 bg-card/60 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {label}
                        </p>
                        <p className="mt-3 text-3xl font-semibold text-foreground">
                          {value}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "inline-flex items-center justify-center rounded-full p-3",
                          accent
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                    </div>
                    <p className="mt-4 text-sm text-muted-foreground">{description}</p>
                  </ContentCard>
                ))}
              </GridContainer>
            )}
          </div>

          <div className="space-y-6">
            <SectionHeader
              title="Your routines"
              description="Review the cadence, type, and recent activity for each habit."
            />

            {loading ? (
              <GridSkeleton cols={3} rows={2} />
            ) : habits.length === 0 ? (
              <HabitsEmptyState
                onAction={() => {
                  router.push("/habits/new");
                }}
              />
            ) : (
              <GridContainer cols={3} gap="lg">
                {habits.map((habit) => (
                  <ContentCard
                    key={habit.id}
                    className="flex h-full flex-col gap-4 border border-border/60 bg-card/60 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-foreground">
                          {habit.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {habit.description?.trim() || "No description added yet."}
                        </p>
                      </div>
                      <Badge
                        variant={habit.habit_type === "CHORE" ? "secondary" : "outline"}
                        className={cn(
                          habit.habit_type === "CHORE"
                            ? "border-transparent bg-emerald-500/15 text-emerald-400"
                            : "border-border/60 text-muted-foreground"
                        )}
                      >
                        {habit.habit_type === "CHORE" ? "Chore" : "Habit"}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/20 px-3 py-1.5">
                        <CalendarCheck className="h-4 w-4" />
                        <span>{formatRecurrence(habit.recurrence)}</span>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/20 px-3 py-1.5">
                        <Clock3 className="h-4 w-4" />
                        <span>Created {formatDate(habit.created_at)}</span>
                      </div>
                      {habit.updated_at && habit.updated_at !== habit.created_at && (
                        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/20 px-3 py-1.5">
                          <RefreshCw className="h-4 w-4" />
                          <span>Updated {formatDate(habit.updated_at)}</span>
                        </div>
                      )}
                    </div>
                  </ContentCard>
                ))}
              </GridContainer>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
