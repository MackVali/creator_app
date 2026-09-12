"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useProfile } from "@/lib/hooks/useProfile";
import {
  getMatrixEventEndTime,
  getMatrixEventStartTime,
  isMatrixEventCompleted,
  loadMatrixScheduledEventsForCreatorDay,
  resolveMatrixCreatorDay,
  type MatrixEvent,
} from "@/lib/matrix/scheduledEvents";
import { getSupabaseBrowser } from "@/lib/supabase";
import { normalizeTimeZone } from "@/lib/scheduler/timezone";
import { cn } from "@/lib/utils";

const upNextRows = [
  {
    time: "6:00",
    title: "Review command lanes",
  },
  {
    time: "8:30",
    title: "Plan tomorrow",
  },
];

export function CommandContextRail() {
  const { user } = useAuth();
  const { localTimeZone } = useProfile();
  const timeZone = useMemo(
    () => normalizeTimeZone(localTimeZone ?? getBrowserTimeZone()),
    [localTimeZone],
  );
  const [nowState, setNowState] = useState<{
    loading: boolean;
    error: string | null;
    events: MatrixEvent[];
  }>({ loading: true, error: null, events: [] });

  useEffect(() => {
    if (!user?.id) {
      setNowState({ loading: false, error: null, events: [] });
      return;
    }

    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setNowState({
        loading: false,
        error: "Schedule unavailable.",
        events: [],
      });
      return;
    }

    let cancelled = false;
    const creatorDay = resolveMatrixCreatorDay(timeZone);
    setNowState((current) => ({ ...current, loading: true, error: null }));

    loadMatrixScheduledEventsForCreatorDay({
      supabase,
      userId: user.id,
      timeZone,
      creatorDay,
    })
      .then((result) => {
        if (cancelled) return;
        setNowState({
          loading: false,
          error: null,
          events: selectCommandNowEvents(result.scheduledEvents),
        });
      })
      .catch((error) => {
        console.error("Failed to load Command NOW events", error);
        if (cancelled) return;
        setNowState({
          loading: false,
          error: "No live schedule right now.",
          events: [],
        });
      });

    return () => {
      cancelled = true;
    };
  }, [timeZone, user?.id]);

  return (
    <aside
      className="hidden w-[280px] shrink-0 border-r border-white/[0.06] px-4 pb-5 pt-6 text-white/80 lg:block"
      aria-label="Command context"
    >
      <div className="flex min-h-[calc(100dvh-3rem)] flex-col">
        <section>
          <RailLabel>Today</RailLabel>

          <div className="space-y-2">
            <p className="text-[13px] font-semibold leading-tight text-white/86">
              Friday, Sep 11
            </p>

            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/58">
                Workday
              </span>

              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/58">
                Evening
              </span>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <RailLabel>Now</RailLabel>

          <div className="space-y-2">
            {nowState.loading ? (
              <CommandNowSkeletonRows />
            ) : nowState.events.length ? (
              nowState.events.map((event) => (
                <CommandNowEventRow key={event.instance.id} event={event} />
              ))
            ) : (
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.035] px-3 py-3 text-[11px] font-semibold text-white/46">
                {nowState.error ?? "No scheduled Matrix events for now."}
              </div>
            )}
          </div>
        </section>

        <section className="mt-6">
          <RailLabel>Up Next</RailLabel>

          <div className="space-y-1.5">
            {upNextRows.map((row) => (
              <div
                key={`${row.time}-${row.title}`}
                className="flex items-center gap-3 rounded-md px-1 py-1.5 text-white/54"
              >
                <span className="w-10 shrink-0 text-[10px] font-semibold tabular-nums text-white/36">
                  {row.time}
                </span>

                <span className="min-w-0 truncate text-[12px] font-medium">
                  {row.title}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-auto pt-6">
          <button
            type="button"
            className="flex h-9 w-full items-center justify-center rounded-md border border-white/[0.09] bg-white/[0.035] px-3 text-[11px] font-semibold text-white/64 transition hover:border-white/[0.14] hover:bg-white/[0.055] hover:text-white/82 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          >
            Jump to date
          </button>
        </div>
      </div>
    </aside>
  );
}

function selectCommandNowEvents(events: MatrixEvent[], now = new Date()) {
  const nowMs = now.getTime();
  const availableEvents = events.filter((event) => {
    const startMs = getMatrixEventStartTime(event);
    const endMs = getMatrixEventEndTime(event);
    return Number.isFinite(startMs) && Number.isFinite(endMs);
  });

  const currentEvents = availableEvents
    .filter((event) => {
      const startMs = getMatrixEventStartTime(event);
      const endMs = getMatrixEventEndTime(event);
      return startMs <= nowMs && endMs > nowMs;
    })
    .sort(compareNowStartAsc);
  const upcomingEvents = availableEvents
    .filter((event) => getMatrixEventStartTime(event) > nowMs)
    .sort(compareNowStartAsc);
  const recentPastEvents = availableEvents
    .filter((event) => getMatrixEventEndTime(event) <= nowMs)
    .sort(compareNowStartDesc);

  return [...currentEvents, ...upcomingEvents, ...recentPastEvents].slice(0, 3);
}

function compareNowStartAsc(a: MatrixEvent, b: MatrixEvent) {
  const startDiff = getMatrixEventStartTime(a) - getMatrixEventStartTime(b);
  if (startDiff !== 0) return startDiff;
  return a.title.localeCompare(b.title);
}

function compareNowStartDesc(a: MatrixEvent, b: MatrixEvent) {
  const startDiff = getMatrixEventStartTime(b) - getMatrixEventStartTime(a);
  if (startDiff !== 0) return startDiff;
  return a.title.localeCompare(b.title);
}

function CommandNowEventRow({ event }: { event: MatrixEvent }) {
  const completed = isMatrixEventCompleted(event);
  const status = getCommandNowStatus(event);
  const subtitle = getCommandNowSubtitle(event);
  const sourceType = event.goal ? "Project" : event.routine ? "Routine" : "Habit";

  return (
    <div
      className={cn(
        "relative flex min-h-[56px] w-full min-w-0 select-none items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-white shadow-[0_18px_36px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)]",
        completed
          ? "border-emerald-300/25 bg-[linear-gradient(155deg,rgba(34,197,94,0.45)_0%,rgba(22,163,74,0.36)_48%,rgba(21,128,61,0.32)_100%)]"
          : "border-white/10 bg-[linear-gradient(145deg,#07080A_0%,#090A0D_58%,#0D0E11_100%)]",
      )}
    >
      <span
        className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] p-0.5 text-center text-[15px] leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
        aria-hidden="true"
      >
        <span className="flex size-6 max-w-full items-center justify-center truncate">
          {event.glyph}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block min-w-0 truncate text-[13px] font-semibold leading-snug tracking-wide text-white">
          {event.title}
        </span>

        <span className="mt-0.5 block min-w-0 truncate text-[10px] font-semibold leading-tight text-white/58">
          {subtitle ?? sourceType}
        </span>
      </span>

      <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-2 py-[3px] text-[8px] font-semibold uppercase leading-none tracking-[0.08em] text-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
        {status}
      </span>
    </div>
  );
}

function CommandNowSkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="flex min-h-[56px] animate-pulse items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.035] px-3 py-1.5"
        >
          <span className="size-7 shrink-0 rounded-full bg-white/[0.08]" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="block h-3 w-28 rounded bg-white/[0.08]" />
            <span className="block h-2 w-20 rounded bg-white/[0.055]" />
          </span>
          <span className="h-4 w-9 shrink-0 rounded-full bg-white/[0.06]" />
        </div>
      ))}
    </>
  );
}

function getCommandNowStatus(event: MatrixEvent) {
  if (isMatrixEventCompleted(event)) return "Done";
  const normalized = event.instance.status?.replaceAll("_", " ").trim();
  if (normalized && normalized.toLowerCase() !== "scheduled") {
    return normalized;
  }

  const durationMinutes =
    typeof event.instance.duration_min === "number" &&
    Number.isFinite(event.instance.duration_min) &&
    event.instance.duration_min > 0
      ? event.instance.duration_min
      : event.routine?.totalDueDurationMinutes ??
        event.habit?.duration_minutes ??
        event.goal?.projects?.[0]?.durationMinutes ??
        null;
  return typeof durationMinutes === "number" && durationMinutes > 0
    ? formatCommandDurationLabel(durationMinutes)
    : "Next";
}

function getCommandNowSubtitle(event: MatrixEvent) {
  if (event.subtitle) return event.subtitle;
  if (event.scheduledMeal || event.inferredMeal) return "Meal window";
  if (event.routine) {
    const count = event.routine.dueHabitCount;
    return count === 1 ? "1 rep" : `${count} reps`;
  }
  if (event.goal?.title) return event.goal.title;
  if (event.habit?.dueStatus?.label) return event.habit.dueStatus.label;
  return null;
}

function formatCommandDurationLabel(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded < 60) return `${rounded}m`;

  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function RailLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-[10px] font-semibold uppercase leading-none tracking-[0.2em] text-white/38">
      {children}
    </h2>
  );
}
