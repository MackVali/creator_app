"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Star, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useProfile } from "@/lib/hooks/useProfile";
import { resolveCreatorDay } from "@/lib/creatorDay";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { AnalyticsHistoryDay, AnalyticsHistoryItem } from "@/types/analytics";
import { getAreaById, type AreaId } from "@/config/areas";

function classNames(...classes: (string | boolean | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const AREA_HISTORY_TONES: Record<
  AreaId,
  { surface: string; bar: string; count: string }
> = {
  body: {
    surface: "bg-emerald-300/[0.045]",
    bar: "bg-emerald-300/90",
    count: "text-emerald-300",
  },
  mind: {
    surface: "bg-violet-300/[0.045]",
    bar: "bg-violet-300/90",
    count: "text-violet-300",
  },
  work: {
    surface: "bg-blue-300/[0.045]",
    bar: "bg-blue-300/90",
    count: "text-blue-300",
  },
  money: {
    surface: "bg-green-300/[0.045]",
    bar: "bg-green-300/90",
    count: "text-green-300",
  },
  people: {
    surface: "bg-rose-300/[0.045]",
    bar: "bg-rose-300/90",
    count: "text-rose-300",
  },
  life: {
    surface: "bg-orange-300/[0.045]",
    bar: "bg-orange-300/90",
    count: "text-orange-300",
  },
  creation: {
    surface: "bg-pink-300/[0.045]",
    bar: "bg-pink-300/90",
    count: "text-pink-300",
  },
  experience: {
    surface: "bg-cyan-300/[0.045]",
    bar: "bg-cyan-300/90",
    count: "text-cyan-300",
  },
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isHistoryDay(payload: unknown): payload is AnalyticsHistoryDay {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  const summary = record.summary as Record<string, unknown> | undefined;
  return (
    typeof record.dayKey === "string" &&
    typeof record.dayStartUtc === "string" &&
    typeof record.dayEndUtc === "string" &&
    typeof record.timezone === "string" &&
    Boolean(summary) &&
    isFiniteNumber(summary?.planned) &&
    isFiniteNumber(summary?.completedPlanned) &&
    isFiniteNumber(summary?.completedUnplanned) &&
    isFiniteNumber(summary?.completedTotal) &&
    isFiniteNumber(summary?.missed) &&
    isFiniteNumber(summary?.executionRate) &&
    isFiniteNumber(summary?.xpEarned) &&
    Array.isArray(record.areas) &&
    Array.isArray(record.completed) &&
    Array.isArray(record.missed)
  );
}

async function fetchHistoryDay(
  dayKey: string,
  signal: AbortSignal
): Promise<AnalyticsHistoryDay> {
  const headers = new Headers();
  const supabase = getSupabaseBrowser();
  const sessionResult = supabase
    ? await supabase.auth.getSession().catch(() => null)
    : null;
  const accessToken = sessionResult?.data.session?.access_token;

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(
    `/api/analytics/history?date=${encodeURIComponent(dayKey)}`,
    {
      cache: "no-store",
      credentials: "include",
      headers,
      signal,
    }
  );
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    if (response.status === 401) throw new Error("unauthorized");
    if (response.status === 403) throw new Error("upgrade_required");
    throw new Error("fetch_failed");
  }

  if (!isHistoryDay(payload)) {
    throw new Error("invalid_response");
  }

  return payload;
}

function shiftDayKey(dayKey: string, days: number) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getDeviceTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function resolveCurrentCreatorDayKey(profileTimezone?: string | null) {
  return resolveCreatorDay({
    profileTimezone,
    deviceTimezone: getDeviceTimezone(),
  }).creatorDayDate;
}

function dateFromDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function formatDayLabel(dayKey: string) {
  const date = dateFromDayKey(dayKey);
  return {
    weekday: new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: "UTC",
    }).format(date),
    day: new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      timeZone: "UTC",
    }).format(date),
  };
}

function formatTime(value: string | null, timezone: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(date);
}

function formatSourceType(type: AnalyticsHistoryItem["sourceType"]) {
  if (type === "unknown") return "Item";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function buildHierarchyTrail(item: AnalyticsHistoryItem) {
  const trail = [formatSourceType(item.sourceType)];
  const candidates = [
    item.projectLabel,
    item.goalLabel,
    item.monumentLabel,
    item.skillLabel,
    item.areaLabel,
  ];

  for (const label of candidates) {
    if (label && !trail.includes(label)) trail.push(label);
    if (trail.length >= 3) break;
  }

  return trail.join(" · ");
}

type HistoryListView = "completed" | "missed";

export default function CreatorDayHistory() {
  const { localTimeZone } = useProfile();
  const [currentCreatorDayKey, setCurrentCreatorDayKey] = useState(
    resolveCurrentCreatorDayKey
  );
  const [selectedDayKey, setSelectedDayKey] = useState(currentCreatorDayKey);
  const [history, setHistory] = useState<AnalyticsHistoryDay | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [listView, setListView] = useState<HistoryListView>("completed");
  const [historyCache, setHistoryCache] = useState<
    Record<string, AnalyticsHistoryDay | undefined>
  >({});
  const historyAbortRef = useRef<AbortController | null>(null);
  const historyRequestIdRef = useRef(0);
  const historyRef = useRef<AnalyticsHistoryDay | null>(null);
  const historyCacheRef = useRef<Record<string, AnalyticsHistoryDay | undefined>>({});

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    historyCacheRef.current = historyCache;
  }, [historyCache]);

  useEffect(() => {
    const syncCurrentCreatorDay = () => {
      const nextCurrentDayKey = resolveCurrentCreatorDayKey(localTimeZone);
      setCurrentCreatorDayKey((previousCurrentDayKey) => {
        setSelectedDayKey((selected) =>
          selected === previousCurrentDayKey ||
          selected.localeCompare(nextCurrentDayKey) > 0
            ? nextCurrentDayKey
            : selected
        );
        return nextCurrentDayKey;
      });
    };

    syncCurrentCreatorDay();

    const interval = window.setInterval(() => {
      syncCurrentCreatorDay();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [localTimeZone]);

  useEffect(() => {
    return () => {
      historyAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const cachedHistory = historyCacheRef.current[selectedDayKey] ?? null;
    const hasVisibleHistory = historyRef.current !== null;

    if (cachedHistory) {
      setHistory(cachedHistory);
      setHistoryError(null);
      setHistoryLoading(false);
      setHistoryRefreshing(false);
      return;
    }

    historyAbortRef.current?.abort();
    const controller = new AbortController();
    historyAbortRef.current = controller;
    const requestId = historyRequestIdRef.current + 1;
    historyRequestIdRef.current = requestId;

    setHistoryError(null);
    setHistoryLoading(!hasVisibleHistory);
    setHistoryRefreshing(hasVisibleHistory);

    const load = async () => {
      try {
        const payload = await fetchHistoryDay(selectedDayKey, controller.signal);
        if (
          controller.signal.aborted ||
          historyRequestIdRef.current !== requestId
        ) {
          return;
        }

        setHistoryCache((current) => ({ ...current, [selectedDayKey]: payload }));
        setHistory(payload);
        setHistoryError(null);
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return;
        }

        const errorMessage = err instanceof Error ? err.message : "fetch_failed";
        const message =
          errorMessage === "upgrade_required"
            ? "Analytics History requires CREATOR Pro."
            : errorMessage === "unauthorized"
              ? "Sign in to view Creator Day History."
              : hasVisibleHistory
                ? "Unable to update this Creator day."
                : "Unable to load this Creator day.";
        console.error("Failed to load Creator Day History", err);
        setHistoryError(message);
      } finally {
        if (historyRequestIdRef.current === requestId) {
          setHistoryLoading(false);
          setHistoryRefreshing(false);
        }
      }
    };

    void load();

    return () => {
      controller.abort();
      if (historyAbortRef.current === controller) {
        historyAbortRef.current = null;
      }
    };
  }, [selectedDayKey]);

  const dateStripDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        shiftDayKey(selectedDayKey, index - 3)
      ),
    [selectedDayKey]
  );

  const selectedSummary = history?.summary ?? {
    planned: 0,
    completedPlanned: 0,
    completedUnplanned: 0,
    completedTotal: 0,
    missed: 0,
    executionRate: 0,
    xpEarned: 0,
  };
  const ringPercent = Math.max(0, Math.min(100, selectedSummary.executionRate));
  const plannedActualTotal = Math.max(
    selectedSummary.planned,
    selectedSummary.completedPlanned +
      selectedSummary.completedUnplanned +
      selectedSummary.missed,
    1
  );
  const sortedAreas = useMemo(() => {
    return [...(history?.areas ?? [])].sort((a, b) => {
      const areaA = getAreaById(a.areaId);
      const areaB = getAreaById(b.areaId);
      if (areaA && areaB) return areaA.sortOrder - areaB.sortOrder;
      if (areaA) return -1;
      if (areaB) return 1;
      return b.xpEarned - a.xpEarned || b.completed - a.completed;
    });
  }, [history?.areas]);
  const listItems = listView === "completed" ? history?.completed ?? [] : history?.missed ?? [];
  const canGoForward = selectedDayKey.localeCompare(currentCreatorDayKey) < 0;
  const maxAreaCompleted = Math.max(
    ...sortedAreas.map((area) => area.completed),
    1
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-3">
      <DateStrip
        currentCreatorDayKey={currentCreatorDayKey}
        days={dateStripDays}
        selectedDayKey={selectedDayKey}
        onSelectDay={setSelectedDayKey}
        onMove={(offset) => {
          const nextDayKey = shiftDayKey(selectedDayKey, offset);
          if (nextDayKey.localeCompare(currentCreatorDayKey) <= 0) {
            setSelectedDayKey(nextDayKey);
          }
        }}
        canGoForward={canGoForward}
      />

      {historyError ? (
        <div className="rounded-[16px] border border-red-900/40 bg-red-950/20 px-3 py-2.5 text-xs text-red-100">
          {historyError}
        </div>
      ) : null}

      <section
        className={classNames(
          "overflow-hidden rounded-[22px] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(19,20,23,0.98),rgba(10,11,13,0.98))] shadow-[0_18px_50px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.035)] transition-opacity",
          historyRefreshing && "opacity-80"
        )}
      >
        <div className="px-4 pb-3.5 pt-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold tracking-[-0.025em] text-white">
                Creator Day Summary
              </h2>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                {formatCreatorDayDate(selectedDayKey)}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              <span className="text-[9px] text-zinc-500">
                4:00 AM → 4:00 AM
              </span>
              {historyRefreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
              ) : null}
            </div>
          </div>

          {historyLoading && !history ? (
            <HistorySkeleton />
          ) : (
            <div className="mt-3.5 grid grid-cols-[104px_minmax(0,1fr)] items-center gap-3.5">
              <ExecutionRing percent={ringPercent} />

              <div className="min-w-0">
                <div className="grid grid-cols-4">
                  <Metric
                    label="Planned"
                    value={selectedSummary.planned}
                  />
                  <Metric
                    label="Completed"
                    value={selectedSummary.completedPlanned}
                    tone="completed"
                  />
                  <Metric
                    label="Unplanned"
                    value={selectedSummary.completedUnplanned}
                    tone="unplanned"
                  />
                  <Metric
                    label="Missed"
                    value={selectedSummary.missed}
                    tone="missed"
                  />
                </div>

                <div className="mt-3 flex min-h-[48px] items-center gap-3 rounded-[13px] border border-white/[0.075] bg-white/[0.04] px-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-amber-300/[0.10] text-amber-300">
                    <Star className="h-[18px] w-[18px] fill-current" />
                  </div>

                  <div className="min-w-0">
                    <div className="text-[19px] font-semibold leading-none tracking-[-0.035em] text-zinc-100">
                      +{selectedSummary.xpEarned}
                    </div>
                    <div className="mt-1 text-[9px] text-zinc-500">
                      XP earned
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/[0.065] px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold text-zinc-100">
              Area Breakdown
            </h3>
            <span className="text-[9px] text-zinc-600">
              Completed items by area
            </span>
          </div>

          {sortedAreas.length > 0 ? (
            <div className="mt-2.5 flex gap-2 overflow-x-auto pb-0.5">
              {sortedAreas.map((area) => (
                <AreaRow
                  key={area.areaId}
                  area={area}
                  maxCompleted={maxAreaCompleted}
                />
              ))}
            </div>
          ) : (
            <div className="mt-2.5 rounded-[12px] bg-white/[0.025] px-3 py-3 text-center text-[11px] text-zinc-600">
              No completed work recorded for this Creator day.
            </div>
          )}
        </div>

        <div className="border-t border-white/[0.065] px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold text-zinc-100">
              Planned vs Actual
            </h3>
            <span className="text-[9px] text-zinc-500">
              {selectedSummary.completedPlanned} of {selectedSummary.planned} planned
              {selectedSummary.completedUnplanned > 0
                ? ` · ${selectedSummary.completedUnplanned} extra`
                : ""}
            </span>
          </div>

          <div className="mt-2.5 overflow-hidden rounded-full bg-white/[0.065]">
            <div className="flex h-2 w-full">
              <BarSegment
                label="Completed planned"
                value={selectedSummary.completedPlanned}
                total={plannedActualTotal}
                className="bg-emerald-300/85"
              />
              <BarSegment
                label="Completed unplanned"
                value={selectedSummary.completedUnplanned}
                total={plannedActualTotal}
                className="bg-sky-300/80"
              />
              <BarSegment
                label="Missed"
                value={selectedSummary.missed}
                total={plannedActualTotal}
                className="bg-red-300/55"
              />
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2 text-[9px] text-zinc-500">
            <LegendDot
              label={`Completed ${selectedSummary.completedPlanned}`}
              className="bg-emerald-300"
            />
            <LegendDot
              label={`Unplanned ${selectedSummary.completedUnplanned}`}
              className="bg-sky-300"
            />
            <LegendDot
              label={`Missed ${selectedSummary.missed}`}
              className="bg-red-300/70"
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="grid grid-cols-2 rounded-2xl border border-white/[0.07] bg-zinc-950/80 p-1">
          {(["completed", "missed"] as const).map((view) => {
            const selected = listView === view;
            const count =
              view === "completed"
                ? history?.completed.length ?? 0
                : history?.missed.length ?? 0;
            return (
              <button
                key={view}
                type="button"
                aria-pressed={selected}
                onClick={() => setListView(view)}
                className={classNames(
                  "rounded-xl px-3 py-2 text-sm font-medium capitalize transition",
                  selected
                    ? "bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "text-zinc-500 hover:text-zinc-200"
                )}
              >
                {view} <span className="text-xs text-zinc-500">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-1 pt-1">
          <h3 className="text-[15px] font-semibold text-zinc-100">
            {listView === "completed" ? "Completed" : "Missed"}
          </h3>

          <div className="text-[10px] text-zinc-500">
            {listView === "completed"
              ? `${history?.completed.length ?? 0} items · +${selectedSummary.xpEarned} XP`
              : `${history?.missed.length ?? 0} items`}
          </div>
        </div>

        <div className="overflow-hidden rounded-[16px] border border-white/[0.07] bg-[#111214]">
          {historyLoading && !history ? (
            <HistoryListSkeleton />
          ) : listItems.length > 0 ? (
            listItems.map((item) => (
              <HistoryItemRow
                key={item.id}
                item={item}
                mode={listView}
                timezone={history?.timezone ?? getDeviceTimezone()}
              />
            ))
          ) : (
            <p className="rounded-2xl border border-white/[0.07] bg-zinc-950/70 px-4 py-5 text-center text-sm text-zinc-500">
              {listView === "completed"
                ? "No completed work for this Creator day."
                : "No missed scheduled work for this Creator day."}
            </p>
          )}
        </div>
      </section>

      <Button
        type="button"
        disabled
        aria-disabled="true"
        className="h-12 w-full rounded-2xl border border-white/[0.08] bg-white/[0.05] text-sm font-medium text-zinc-500 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-70"
      >
        Open full day review
      </Button>
    </div>
  );
}

function formatCreatorDayDate(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);

  if (!year || !month || !day) {
    return dayKey;
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatMonthDay(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);

  if (!year || !month || !day) {
    return dayKey;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function DateStrip({
  currentCreatorDayKey,
  days,
  selectedDayKey,
  onSelectDay,
  onMove,
  canGoForward,
}: {
  currentCreatorDayKey: string;
  days: string[];
  selectedDayKey: string;
  onSelectDay(dayKey: string): void;
  onMove(offset: number): void;
  canGoForward: boolean;
}) {
  return (
    <div className="rounded-[18px] border border-white/[0.07] bg-[#0E0F11] px-1.5 py-1.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous Creator day"
          onClick={() => onMove(-1)}
          className="grid h-10 w-7 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="grid min-w-0 flex-1 grid-cols-7 gap-1">
          {days.map((dayKey) => {
            const label = formatDayLabel(dayKey);
            const selected = dayKey === selectedDayKey;
            const disabled = dayKey.localeCompare(currentCreatorDayKey) > 0;

            return (
              <button
                key={dayKey}
                type="button"
                aria-pressed={selected}
                aria-label={`Creator day ${dayKey}`}
                disabled={disabled}
                onClick={() => onSelectDay(dayKey)}
                className={classNames(
                  "min-w-0 rounded-[11px] border px-0.5 py-1.5 text-center transition disabled:cursor-not-allowed disabled:opacity-55",
                  selected
                    ? "border-blue-400/70 bg-blue-400/[0.08] text-white shadow-[0_0_0_1px_rgba(96,165,250,0.10),inset_0_1px_0_rgba(255,255,255,0.05)]"
                    : "border-transparent text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                )}
              >
                <span
                  className={classNames(
                    "block text-[8px] font-medium uppercase tracking-[0.04em]",
                    selected ? "text-blue-300" : "text-current"
                  )}
                >
                  {label.weekday}
                </span>

                <span className="mt-0.5 block whitespace-nowrap text-[10px] font-medium leading-none">
                  {formatMonthDay(dayKey)}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-label="Next Creator day"
          disabled={!canGoForward}
          onClick={() => onMove(1)}
          className="grid h-10 w-7 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ExecutionRing({ percent }: { percent: number }) {
  const background = `conic-gradient(rgb(110 231 183) ${percent}%, rgba(255,255,255,0.10) 0)`;

  return (
    <div
      className="grid h-[102px] w-[102px] place-items-center rounded-full p-[8px]"
      style={{ background }}
    >
      <div className="grid h-full w-full place-items-center rounded-full bg-[#090A0C] text-center shadow-[inset_0_1px_10px_rgba(0,0,0,0.55)]">
        <div>
          <div className="text-[31px] font-semibold leading-none tracking-[-0.045em] text-white">
            {percent}%
          </div>
          <div className="mt-1.5 text-[9px] leading-tight text-zinc-400">
            Execution
            <br />
            Rate
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "completed" | "unplanned" | "missed";
}) {
  return (
    <div className="min-w-0 border-l border-white/[0.07] px-1 text-center first:border-l-0">
      <div
        className={classNames(
          "text-[22px] font-semibold leading-none tracking-[-0.035em]",
          tone === "completed" && "text-emerald-300",
          tone === "unplanned" && "text-blue-300",
          tone === "missed" && "text-red-300",
          tone === "default" && "text-zinc-100"
        )}
      >
        {value}
      </div>

      <div
        className={classNames(
          "mt-1.5 whitespace-nowrap text-[8px] font-medium leading-none",
          tone === "completed" && "text-emerald-300/85",
          tone === "unplanned" && "text-blue-300/85",
          tone === "missed" && "text-red-300/85",
          tone === "default" && "text-zinc-500"
        )}
      >
        {label}
      </div>
    </div>
  );
}

function AreaRow({
  area,
  maxCompleted,
}: {
  area: AnalyticsHistoryDay["areas"][number];
  maxCompleted: number;
}) {
  const config = getAreaById(area.areaId);
  const tone = config ? AREA_HISTORY_TONES[config.id] : null;
  const percent = Math.max(
    8,
    Math.min(100, (area.completed / maxCompleted) * 100)
  );

  return (
    <div
      className={classNames(
        "w-[90px] shrink-0 rounded-[11px] border border-white/[0.06] px-2 py-2",
        tone?.surface ?? "bg-white/[0.035]"
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {config?.emoji ? (
          <span className="shrink-0 text-[12px]" aria-hidden="true">
            {config.emoji}
          </span>
        ) : null}

        <span className="truncate text-[10px] font-medium text-zinc-200">
          {config?.label ?? area.label}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className={classNames(
              "h-full rounded-full",
              tone?.bar ?? "bg-zinc-300/80"
            )}
            style={{ width: `${percent}%` }}
          />
        </div>

        <span
          className={classNames(
            "shrink-0 text-[10px] font-semibold",
            tone?.count ?? "text-zinc-300"
          )}
        >
          {area.completed}
        </span>
      </div>
    </div>
  );
}

function BarSegment({
  label,
  value,
  total,
  className,
}: {
  label: string;
  value: number;
  total: number;
  className: string;
}) {
  if (value <= 0) return null;
  return (
    <div
      aria-label={`${label}: ${value}`}
      className={className}
      style={{ width: `${Math.max(3, (value / total) * 100)}%` }}
    />
  );
}

function LegendDot({ label, className }: { label: string; className: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={classNames("h-1.5 w-1.5 rounded-full", className)} />
      {label}
    </span>
  );
}

function HistoryItemRow({
  item,
  mode,
  timezone,
}: {
  item: AnalyticsHistoryItem;
  mode: HistoryListView;
  timezone: string;
}) {
  const isCompleted = mode === "completed";
  const time = isCompleted
    ? formatTime(item.completedAt, timezone)
    : formatTime(item.scheduledStartUtc, timezone);

  const hierarchy = buildHierarchyTrail(item);
  const secondary =
    isCompleted && !item.wasScheduled
      ? hierarchy
        ? `${hierarchy} · Unplanned`
        : "Unplanned"
      : hierarchy;

  return (
    <article className="flex min-h-[58px] items-center gap-2.5 border-b border-white/[0.065] px-3 py-2.5 last:border-b-0">
      <div
        className={classNames(
          "grid h-7 w-7 shrink-0 place-items-center rounded-full",
          isCompleted
            ? "bg-emerald-300/80 text-emerald-950"
            : "bg-red-300/90 text-red-950"
        )}
      >
        {isCompleted ? (
          <Check className="h-4 w-4 stroke-[2.5]" />
        ) : (
          <X className="h-4 w-4 stroke-[2.5]" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[13px] font-medium leading-tight text-zinc-100">
          {item.title}
        </h3>

        {secondary ? (
          <p className="mt-1 truncate text-[10px] leading-none text-zinc-500">
            {secondary}
          </p>
        ) : null}
      </div>

      {time ? (
        <time className="shrink-0 text-[10px] font-medium text-zinc-500">
          {time}
        </time>
      ) : null}

      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
    </article>
  );
}

function HistorySkeleton() {
  return (
    <div className="mt-5 grid gap-5 sm:grid-cols-[170px_1fr]">
      <div className="mx-auto h-36 w-36 animate-pulse rounded-full bg-white/[0.06]" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-[74px] animate-pulse rounded-2xl bg-white/[0.05]" />
        ))}
      </div>
    </div>
  );
}

function HistoryListSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-[68px] animate-pulse rounded-2xl border border-white/[0.05] bg-zinc-950/70"
        />
      ))}
    </>
  );
}
