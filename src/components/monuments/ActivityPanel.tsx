"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { CheckCircle2, NotebookPen, Pin, Sparkles, TriangleAlert } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  type MonumentActivityEvent,
  type MonumentActivityNote,
  useMonumentActivity,
} from "@/lib/hooks/useMonumentActivity";

interface ActivityPanelProps {
  monumentId: string;
}

const EVENT_STYLES: Record<MonumentActivityEvent["type"], { icon: ComponentType<{ className?: string }>; badge: string }>
  = {
    note: {
      icon: NotebookPen,
      badge: "border-white/[0.08] bg-[#101114] text-white/75",
    },
    xp: {
      icon: Sparkles,
      badge: "border-white/[0.08] bg-[#101114] text-white/70",
    },
    goal: {
      icon: CheckCircle2,
      badge: "border-white/[0.10] bg-[#14161A] text-white/78",
    },
  };

function formatDayLabel(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const comparison = new Date(date);
  comparison.setHours(0, 0, 0, 0);

  const diffInDays = Math.round(
    (comparison.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffInDays === 0) return "Today";
  if (diffInDays === -1) return "Yesterday";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatRelativeTime(date: Date) {
  const divisions: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
    { amount: 60, unit: "second" },
    { amount: 60, unit: "minute" },
    { amount: 24, unit: "hour" },
    { amount: 7, unit: "day" },
    { amount: 4.34524, unit: "week" },
    { amount: 12, unit: "month" },
    { amount: Number.POSITIVE_INFINITY, unit: "year" },
  ];

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  let duration = (date.getTime() - Date.now()) / 1000;

  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return formatter.format(0, "second");
}

function formatTimeLabel(date: Date) {
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  return `${time} • ${formatRelativeTime(date)}`;
}

export default function ActivityPanel({ monumentId }: ActivityPanelProps) {
  const { events, loading, error, summary, notes } = useMonumentActivity(monumentId);

  const storageKey = useMemo(
    () => `monument:${monumentId}:pinned-insights`,
    [monumentId]
  );

  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setPinnedIds([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setPinnedIds([]);
        return;
      }
      const sanitized = parsed.filter((value): value is string => typeof value === "string");
      setPinnedIds(sanitized);
    } catch (readError) {
      console.warn("Unable to read pinned insights from storage", readError);
      setPinnedIds([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (notes.length === 0) return;
    setPinnedIds((current) => {
      const valid = current.filter((id) => notes.some((note) => note.id === id));
      if (valid.length === current.length) return current;
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(valid));
        } catch (writeError) {
          console.warn("Unable to persist pinned insights", writeError);
        }
      }
      return valid;
    });
  }, [notes, storageKey]);

  const togglePin = useCallback(
    (noteId: string) => {
      setPinnedIds((current) => {
        const exists = current.includes(noteId);
        const next = exists
          ? current.filter((id) => id !== noteId)
          : [noteId, ...current];
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(next));
          } catch (writeError) {
            console.warn("Unable to persist pinned insights", writeError);
          }
        }
        return next;
      });
    },
    [storageKey]
  );

  const noteById = useMemo(() => {
    const map = new Map<string, MonumentActivityNote>();
    for (const note of notes) {
      map.set(note.id, note);
    }
    return map;
  }, [notes]);

  const pinnedNotes = useMemo(() => {
    if (pinnedIds.length === 0) return [] as MonumentActivityNote[];
    return pinnedIds
      .map((id) => noteById.get(id))
      .filter((note): note is MonumentActivityNote => Boolean(note))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [noteById, pinnedIds]);

  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);

  const hasPinnedNotes = pinnedNotes.length > 0;

  function summarizeNoteContent(note: MonumentActivityNote) {
    const raw = note.content?.replace(/\s+/g, " ").trim();
    if (!raw) return "Drop more detail in this note to keep the blueprint vivid.";
    if (raw.length <= 180) return raw;
    return `${raw.slice(0, 177)}…`;
  }

  const groupedEvents = useMemo(() => {
    const groups = new Map<
      string,
      { label: string; items: Array<MonumentActivityEvent & { timeLabel: string }> }
    >();

    for (const event of events) {
      const date = new Date(event.timestamp);
      if (Number.isNaN(date.getTime())) continue;
      const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const label = formatDayLabel(date);
      const timeLabel = formatTimeLabel(date);

      if (!groups.has(dayKey)) {
        groups.set(dayKey, { label, items: [] });
      }

      groups.get(dayKey)?.items.push({ ...event, timeLabel });
    }

    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([, value]) => ({
        label: value.label,
        items: value.items.sort((a, b) =>
          b.timestamp.localeCompare(a.timestamp)
        ),
      }));
  }, [events]);

  const hasEvents = groupedEvents.length > 0;

  const phases = useMemo(
    () => [
      {
        label: "Foundation",
        description: "Capture ideas and define the footprint.",
        threshold: 20,
      },
      {
        label: "Framework",
        description: "Half your goals are carrying weight.",
        threshold: 50,
      },
      {
        label: "Finishing",
        description: "Final goals and XP polish the structure.",
        threshold: 80,
      },
      {
        label: "Legacy",
        description: "Charge maxed — monument stands complete.",
        threshold: 100,
      },
    ],
    []
  );

  const chargePercent = Math.min(Math.max(summary.chargePercent, 0), 100);

  const thermometerHeight = Math.max(chargePercent, hasEvents ? 6 : 0);

  return (
    <Card className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#050608] p-6 text-white shadow-[0_28px_80px_-46px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.045)] sm:p-7">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.03),_transparent_52%)]" />
      <div className="pointer-events-none absolute -right-20 top-0 h-52 w-52 rounded-full bg-white/[0.025] blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/[0.08] bg-[#101114] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.32em] text-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              Build log
            </span>
            <p className="text-[9px] font-semibold uppercase tracking-[0.32em] text-white/40">
              Monument activity
            </p>
          </div>
          <h3 className="text-sm font-semibold text-white sm:text-base">
            Monument build log
          </h3>
          <p className="text-[11px] text-white/55 sm:text-xs">
            Goals, notes, and XP activity collected into one timeline.
          </p>
        </div>
        {summary.lastUpdated ? (
          <div className="rounded-full border border-white/[0.08] bg-[#0B0C0F] px-3 py-1 text-[9px] font-medium uppercase tracking-[0.24em] text-white/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            Updated {formatRelativeTime(new Date(summary.lastUpdated))}
          </div>
        ) : null}
      </div>

      <div className="relative mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="relative rounded-3xl border border-white/[0.08] bg-[#08090B] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_18px_46px_-36px_rgba(0,0,0,0.95)]">
          <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-white/[0.06]" />
          {loading ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="animate-pulse rounded-2xl border border-white/[0.08] bg-[#07080A] px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
                >
                  <div className="h-3 w-20 rounded-full bg-white/[0.08]" />
                  <div className="mt-3 h-4 w-3/4 rounded-full bg-white/[0.055]" />
                  <div className="mt-2 h-3 w-1/2 rounded-full bg-white/[0.045]" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 rounded-2xl border border-red-400/20 bg-red-950/20 px-4 py-5 text-sm text-red-200">
              <TriangleAlert className="size-5" aria-hidden="true" />
              <div>
                <p className="font-semibold">Couldn&apos;t load activity</p>
                <p className="text-xs text-red-100/70">{error}</p>
              </div>
            </div>
          ) : hasPinnedNotes || hasEvents ? (
            <div className="relative space-y-6">
              {hasPinnedNotes ? (
                <section className="rounded-2xl border border-white/[0.08] bg-[#0B0C0F] px-4 py-4 text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
                  <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/55">
                        Pinned insights
                      </p>
                      <h4 className="text-sm font-semibold text-white/90">Keep these blueprints within reach</h4>
                    </div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/40">
                      {pinnedNotes.length} saved
                    </p>
                  </header>
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {pinnedNotes.map((note) => {
                      const updatedAt = new Date(note.updatedAt);
                      const updatedLabel = Number.isNaN(updatedAt.getTime())
                        ? null
                        : formatTimeLabel(updatedAt);
                      return (
                        <li key={note.id} className="group relative">
                          <article className="flex h-full flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[#07080A] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition group-hover:border-white/[0.12] group-hover:bg-[#0B0C0F]">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-white/90">
                                  {note.title || "Pinned note"}
                                </p>
                                {updatedLabel ? (
                                  <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/40">
                                    Updated {updatedLabel}
                                  </p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => togglePin(note.id)}
                                className="rounded-full border border-white/[0.10] bg-white/[0.04] p-2 text-white/60 transition hover:border-white/[0.16] hover:bg-white/[0.07] hover:text-white/78"
                                aria-label="Unpin insight"
                              >
                                <Pin className="size-4 -rotate-45" aria-hidden="true" />
                              </button>
                            </div>
                            <p className="text-xs leading-relaxed text-white/58">
                              {summarizeNoteContent(note)}
                            </p>
                          </article>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {hasEvents ? (
                <div className="relative rounded-2xl border border-white/[0.08] bg-[#07080A] px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/45">
                      Timeline
                    </p>
                    <p className="text-[9px] font-medium uppercase tracking-[0.28em] text-white/35">
                      {events.length} moments
                    </p>
                  </div>
                  <div className="pointer-events-none absolute left-[22px] top-5 bottom-5 w-px bg-white/[0.08]" aria-hidden="true" />
                  <div className="space-y-6">
                    {groupedEvents.map(({ label, items }) => (
                      <section key={label} className="relative pl-12">
                        <div className="mb-4 flex items-center gap-3">
                          <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-white/42">
                            {label}
                          </span>
                          <span className="h-px flex-1 bg-white/[0.08]" aria-hidden="true" />
                        </div>
                        <ul className="space-y-4">
                          {items.map((event) => {
                            const style = EVENT_STYLES[event.type];
                            const Icon = style.icon;
                            const isPinned = event.noteId ? pinnedSet.has(event.noteId) : false;
                            return (
                              <li key={event.id} className="relative">
                                <span className="pointer-events-none absolute -left-[30px] top-6 flex h-3 w-3 items-center justify-center">
                                  <span className="flex size-3 items-center justify-center rounded-full border border-white/[0.12] bg-[#14161A]">
                                    <span className="size-1 rounded-full bg-white/45" />
                                  </span>
                                </span>
                                <article className="flex gap-2 rounded-2xl border border-white/[0.08] bg-[#0B0C0F] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition hover:border-white/[0.12] hover:bg-[#101114] sm:gap-3 sm:px-4 sm:py-4">
                                  <span className={cn("mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border sm:h-10 sm:w-10", style.badge)}>
                                    <Icon className="size-3 sm:size-4" aria-hidden="true" />
                                  </span>
                                  <div className="flex-1 space-y-1.5 sm:space-y-2">
                                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                                      <div className="space-y-1">
                                        <p className="text-[11px] font-semibold text-white sm:text-[13px]">
                                          {event.title}
                                        </p>
                                        {event.detail ? (
                                          <p className="text-[10px] text-white/65 sm:text-[11px]">
                                            {event.detail}
                                          </p>
                                        ) : null}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        {event.noteId ? (
                                          <button
                                            type="button"
                                            onClick={() => togglePin(event.noteId!)}
                                            className={cn(
                                              "rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.24em] transition sm:px-3 sm:text-[10px] sm:tracking-[0.28em]",
                                              isPinned
                                                ? "border-white/[0.16] bg-white/[0.07] text-white/82"
                                                : "border-white/[0.10] bg-transparent text-white/45 hover:border-white/[0.16] hover:bg-white/[0.04] hover:text-white/70"
                                            )}
                                            aria-label={isPinned ? "Unpin note" : "Pin note"}
                                            aria-pressed={isPinned}
                                          >
                                            <span className="mr-2 inline-flex items-center justify-center">
                                              <Pin
                                                className={cn(
                                                  "size-3 transition sm:size-3.5",
                                                  isPinned ? "-rotate-45" : ""
                                                )}
                                                aria-hidden="true"
                                              />
                                            </span>
                                            {isPinned ? "Pinned" : "Pin"}
                                          </button>
                                        ) : null}
                                        <span className="text-[9px] font-medium uppercase tracking-[0.24em] text-white/40 sm:text-[10px] sm:tracking-[0.28em]">
                                          {event.timeLabel}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </article>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/[0.10] bg-[#07080A] px-5 py-6 text-sm text-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                  <p className="text-sm font-semibold text-white/82">No activity yet</p>
                  <p className="mt-2 text-xs text-white/50">
                    Complete a goal, log a note, or earn XP linked to this monument to begin the construction log.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/[0.10] bg-[#07080A] px-5 py-6 text-sm text-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
              <p className="text-sm font-semibold text-white/82">No activity yet</p>
              <p className="mt-2 text-xs text-white/50">
                Complete a goal, log a note, or earn XP linked to this monument to begin the construction log.
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-4 2xl:sticky 2xl:top-6">
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#08090B] p-5 shadow-[0_18px_46px_-36px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.045)]">
            <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-white/[0.06]" />
            <div className="relative space-y-4">
              <header className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/48">
                  Charge Thermometer
                </p>
                <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
                  <p className="text-3xl font-semibold text-white">{chargePercent}%</p>
                  <p className="text-xs text-white/48">
                    charged from the past month of linked completions
                  </p>
                </div>
              </header>
              <div className="relative h-40 rounded-[22px] border border-white/[0.08] bg-[#07080A] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="relative flex h-full items-end justify-center">
                  <div
                    className="w-12 rounded-full border border-white/[0.10] bg-gradient-to-t from-zinc-950 via-zinc-700/65 to-zinc-200/70 shadow-[0_10px_24px_-18px_rgba(255,255,255,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all"
                    style={{ height: `${thermometerHeight}%` }}
                    aria-hidden="true"
                  />
                </div>
              </div>
              <ul className="relative grid gap-3">
                {phases.map((phase) => {
                  const reached = chargePercent >= phase.threshold;
                  return (
                    <li
                      key={phase.label}
                      className={cn(
                        "flex items-start gap-3 rounded-2xl border px-4 py-3",
                        reached
                          ? "border-white/[0.14] bg-white/[0.06] text-white/82"
                          : "border-white/[0.08] bg-[#07080A] text-white/45"
                      )}
                    >
                      <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-current/40">
                        {reached ? (
                          <CheckCircle2 className="size-4" aria-hidden="true" />
                        ) : (
                          <span className="size-2 rounded-full bg-current/40" />
                        )}
                      </span>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em]">
                          {phase.label}
                        </p>
                        <p className="text-xs leading-relaxed">{phase.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.08] bg-[#07080A] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/45">
                XP logged (last 30 days)
              </p>
              <div className="mt-2 flex items-end gap-2">
                <p className="text-2xl font-semibold text-white">{summary.totalXp}</p>
                <span className="text-xs text-white/45">across {summary.xpEvents} completions</span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-[#07080A] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/45">
                Goals completed
              </p>
              <div className="mt-2 flex items-end gap-2">
                <p className="text-2xl font-semibold text-white">
                  {summary.completedGoals}
                  <span className="text-base text-white/45">
                    /{summary.totalGoals}
                  </span>
                </p>
                <span className="text-xs text-white/45">fueling this monument</span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-[#07080A] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/45">
                Notes captured
              </p>
              <div className="mt-2 flex items-end gap-2">
                <p className="text-2xl font-semibold text-white">{summary.notesLogged}</p>
                <span className="text-xs text-white/45">structured ideas in the archive</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </Card>
  );
}
