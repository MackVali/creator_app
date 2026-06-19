"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { PlacementTruthTrace } from "@/lib/scheduler/placementTrace";
import type { SchedulerDebugDisplay } from "@/lib/scheduler/debugDisplay";

type FailureSummary = {
  itemId: string;
  reason: string;
  detail?: string;
};

type BottleneckAggregate = {
  reason: string;
  blockLabel: string;
  largestFreeSegmentMin?: number | null;
  requiredDurationMin?: number | null;
  firstCollisionLabel?: string;
  count: number;
};

type AffectedProjectInfo = {
  itemId: string;
  projectLabel: string;
  reason: string;
  blockLabel?: string;
  requiredDurationMin?: number | null;
  bestGapMin?: number | null;
};

type DebugPayload =
  | PlacementTruthTrace
  | {
      placementTrace?: PlacementTruthTrace | null;
      display?: SchedulerDebugDisplay | null;
      fatal?: unknown;
    };

type ScheduleDebugResponse = {
  debugSummary?: unknown;
  debug?: DebugPayload;
  failures?: FailureSummary[];
  schedule?: {
    debugSummary?: unknown;
    failures?: FailureSummary[];
    placementTrace?: PlacementTruthTrace;
  };
  error?: string;
};

const DEBUG_WRITE_THROUGH_DAYS = 14;
const NORMAL_SCHEDULER_MODE = { type: "REGULAR" } as const;

export default function ScheduleDebugPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [debugSummary, setDebugSummary] = useState<unknown | null>(null);
  const [debugDisplay, setDebugDisplay] =
    useState<SchedulerDebugDisplay | null>(null);
  const [placementTrace, setPlacementTrace] =
    useState<PlacementTruthTrace | null>(null);
  const [failures, setFailures] = useState<FailureSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const formatCount = (value?: number | null) => (value ?? "—");

  const handleRunDebug = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    setPlacementTrace(null);
    try {
      const localNow = new Date();
      const timeZone =
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
          : null;
      const utcOffsetMinutes = -localNow.getTimezoneOffset();
      const response = await fetch(
        "/api/scheduler/run?writeThroughDays=14&debug=1",
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            localTimeIso: localNow.toISOString(),
            timeZone,
            utcOffsetMinutes,
            mode: NORMAL_SCHEDULER_MODE,
            writeThroughDays: DEBUG_WRITE_THROUGH_DAYS,
          }),
        }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as
          | ScheduleDebugResponse
          | Record<string, unknown>;
        throw new Error(formatSchedulerDebugError(payload));
      }
      const payload = (await response.json()) as ScheduleDebugResponse;
      const meta =
        isDebugMetaPayload(payload.debug) && !isPlacementTruthTrace(payload.debug)
          ? payload.debug
          : null;
      const debugTrace =
        meta?.placementTrace ??
        (!meta && isPlacementTruthTrace(payload.debug) ? payload.debug : null) ??
        payload.schedule?.placementTrace ??
        null;
      setDebugDisplay(meta?.display ?? null);
      setDebugSummary(
        payload.debugSummary ??
          payload.schedule?.debugSummary ??
          null
      );
      setPlacementTrace(debugTrace);
      const failureList =
        payload.failures ??
        payload.schedule?.failures ??
        [];
      setFailures(failureList);
    } catch (err) {
      setDebugSummary(null);
      setDebugDisplay(null);
      setFailures([]);
      setPlacementTrace(null);
      setError(
        err instanceof Error ? err.message : "Unknown error running scheduler"
      );
    } finally {
      setIsRunning(false);
    }
  }, []);

  const formatProjectLabel = useCallback(
    (id?: string | null) => formatLookupId(id, debugDisplay?.projectsById),
    [debugDisplay]
  );

  const formatBlockLabel = useCallback(
    (id?: string | null) => formatBlockDisplay(id, debugDisplay),
    [debugDisplay]
  );

  const groupedFailures = useMemo(() => {
    const groups: Record<string, FailureSummary[]> = {};
    for (const failure of failures) {
      const bucket = failure.reason || "unknown";
      groups[bucket] = groups[bucket] ?? [];
      groups[bucket].push(failure);
    }
    return Object.entries(groups);
  }, [failures]);

  const unplacedProjects = useMemo(
    () =>
      placementTrace?.projectPass.items.filter((item) => !item.placed) ?? [],
    [placementTrace]
  );

  const occupancyLedger = placementTrace?.projectPass.occupancyLedger ?? [];

  const placementCounts = placementTrace?.projectPass;

  const topBottlenecks = useMemo(() => {
    const map = new Map<string, BottleneckAggregate>();
    for (const item of unplacedProjects) {
      const reason = item.topReasons?.[0]?.code ?? "unknown";
      const candidate = item.closestCandidates?.[0];
      const noSlot = item.passedGatesButNoSlot ?? item.noSlotDetails?.[0];
      const blockId =
        noSlot?.blockId ?? candidate?.blockId ?? undefined;
      const blockLabel = blockId ? formatBlockLabel(blockId) : "unknown";
      const existing = map.get(reason);
      const largestFreeSegmentMin =
        noSlot?.largestFreeSegmentMin ??
        candidate?.largestFreeSegmentMin ??
        existing?.largestFreeSegmentMin;
      const requiredDurationMin =
        noSlot?.requiredDurationMin ??
        candidate?.requiredDurationMin ??
        existing?.requiredDurationMin;
      const firstCollisionLabel = noSlot?.firstCollision?.itemId
        ? formatProjectLabel(noSlot.firstCollision.itemId)
        : existing?.firstCollisionLabel;
      map.set(reason, {
        reason,
        blockLabel,
        largestFreeSegmentMin,
        requiredDurationMin,
        firstCollisionLabel,
        count: (existing?.count ?? 0) + 1,
      });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [unplacedProjects, formatBlockLabel, formatProjectLabel]);

  const affectedProjects = useMemo(() => {
    const projects = unplacedProjects
      .map((item) => {
        const candidate = item.closestCandidates?.[0];
        const noSlot = item.passedGatesButNoSlot ?? item.noSlotDetails?.[0];
        const bestGapMin =
          candidate?.largestFreeSegmentMin ?? noSlot?.largestFreeSegmentMin ?? null;
        const requiredDurationMin =
          candidate?.requiredDurationMin ?? noSlot?.requiredDurationMin ?? null;
        const blockLabel = formatBlockLabel(
          candidate?.blockId ?? noSlot?.blockId
        );
        return {
          itemId: item.itemId,
          projectLabel: formatProjectLabel(item.itemId),
          reason: item.topReasons?.[0]?.code ?? "unspecified",
          blockLabel,
          requiredDurationMin,
          bestGapMin,
        } as AffectedProjectInfo;
      })
      .sort((a, b) => (b.requiredDurationMin ?? 0) - (a.requiredDurationMin ?? 0));
    return projects.slice(0, 4);
  }, [unplacedProjects, formatProjectLabel, formatBlockLabel]);

  const topFailureGroup = groupedFailures[0];
  const topFailureReason = topFailureGroup?.[0] ?? null;
  const topFailureCount = topFailureGroup?.[1]?.length ?? 0;
  const topBottleneck = topBottlenecks[0];

  const summarySentence = useMemo(() => {
    if (!topBottleneck) {
      return "Unable to determine a dominant bottleneck yet.";
    }
    const gapDesc = topBottleneck.largestFreeSegmentMin
      ? `${topBottleneck.largestFreeSegmentMin}m free`
      : "very limited free time";
    const reqDesc = topBottleneck.requiredDurationMin
      ? `${topBottleneck.requiredDurationMin}m required`
      : "more time than available Time Blocks provide";
    return `Most Unscheduled Projects failed because the best matching Time Blocks only had ${gapDesc}, while those Projects required ${reqDesc}.`;
  }, [topBottleneck]);

  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pt-28 sm:px-6 sm:pb-12 lg:px-8">
        <header className="flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-[10px] font-semibold uppercase text-white/35">
              Schedule Diagnostics
            </p>
            <h1 className="text-2xl font-semibold tracking-normal text-white sm:text-3xl">
              Scheduler Debug Console
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-zinc-400">
              Run a real scheduler pass and inspect how Events move from
              evaluation into Scheduled or Unscheduled outcomes.
            </p>
          </div>
          {placementTrace ? (
            <div className="rounded-xl border border-black/60 bg-black/30 px-3 py-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:text-right">
              <p className="font-mono text-[10px] uppercase text-zinc-600">
                Latest run
              </p>
              <p className="mt-1 break-all font-mono text-xs text-zinc-300">
                {placementTrace.runId}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {placementTrace.tz} / {placementTrace.baseDateIso}
              </p>
            </div>
          ) : null}
        </header>

        <section className="overflow-hidden rounded-[20px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(113,113,122,0.10)_30%,rgba(24,24,27,0.34)_62%,rgba(255,255,255,0.035))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_14px_36px_rgba(0,0,0,0.34)] sm:rounded-[22px]">
          <div className="rounded-[19px] border border-black/60 bg-zinc-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_0_22px_rgba(255,255,255,0.018),inset_0_-18px_30px_rgba(0,0,0,0.34)] sm:rounded-[21px]">
            <div className="flex flex-col gap-4 border-b border-black/45 bg-black/25 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase text-zinc-600">
                  Diagnostics action
                </p>
                <h2 className="mt-1 text-sm font-semibold text-white">
                  Run the real scheduler with debug output
                </h2>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
                  This POSTs to the scheduler route and can update the active
                  scheduling snapshot for the next 14 days.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunDebug}
                disabled={isRunning}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.075] px-5 text-xs font-semibold uppercase text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-12px_18px_rgba(0,0,0,0.24)] transition hover:bg-white/[0.11] focus:outline-none focus:ring-2 focus:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white/[0.075]"
              >
                {isRunning ? "Running Diagnostics" : "Run Debug"}
              </button>
            </div>

            {error ? (
              <div className="border-b border-red-500/20 bg-red-500/[0.055] px-4 py-3 text-sm text-red-100">
                <p className="text-[10px] font-semibold uppercase text-red-200/60">
                  Scheduler error
                </p>
                <p className="mt-1">{error}</p>
              </div>
            ) : null}

            {isRunning ? (
              <div className="border-b border-black/45 bg-black/20 px-4 py-3">
                <div className="h-1 overflow-hidden rounded-full bg-white/[0.045]">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-white/30" />
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Diagnostics are running. Existing summary data will refresh
                  when the scheduler responds.
                </p>
              </div>
            ) : null}

            {!placementTrace && !debugSummary && failures.length === 0 && !error ? (
              <div className="grid gap-3 p-4 lg:grid-cols-[1.35fr_1fr]">
                <div className="rounded-[16px] border border-black/60 bg-black/25 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                  <p className="text-sm font-semibold text-white">
                    No diagnostic run loaded
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    Start a run to populate placement counters, bottlenecks,
                    Unscheduled results, Time Block occupancy, and the raw
                    internal trace.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-2">
                  {["Scheduled", "Completed", "Missed", "Unscheduled"].map(
                    (status) => (
                      <div
                        key={status}
                        className="rounded-xl border border-black/60 bg-white/[0.026] px-3 py-2 text-zinc-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
                      >
                        {status}
                      </div>
                    )
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
          <ConsolePanel>
            <SectionHeader
              title="Latest Run Summary"
              meta={
                placementTrace
                  ? `Base date ${placementTrace.baseDateIso}`
                  : "Awaiting data"
              }
            />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <MetricTile
                label="Evaluated"
                value={formatCount(placementCounts?.queuedCount)}
              />
              <MetricTile
                label="Scheduled"
                value={formatCount(placementCounts?.placedCount)}
              />
              <MetricTile
                label="Unscheduled"
                value={formatCount(placementCounts?.unplacedCount)}
              />
            </div>
            <div className="mt-3 rounded-[16px] border border-black/60 bg-black/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
              <p className="text-sm leading-6 text-zinc-300">
                {placementTrace ? summarySentence : "Run diagnostics to generate the latest scheduler summary."}
              </p>
              <div className="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
                <div>
                  <span className="text-zinc-600">Top failure reason</span>
                  <p className="mt-1 font-mono text-zinc-200">
                    {topFailureReason ?? "n/a"}
                    {topFailureCount > 0
                      ? ` (${topFailureCount} Event${topFailureCount === 1 ? "" : "s"})`
                      : ""}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-600">Most constrained Time Block</span>
                  <p className="mt-1 font-mono text-zinc-200">
                    {topBottleneck?.blockLabel ?? "n/a"}
                  </p>
                </div>
              </div>
            </div>
          </ConsolePanel>

          <ConsolePanel>
            <SectionHeader
              title="Placement Counters"
              meta={placementTrace ? "By reason" : "Awaiting data"}
            />
            {placementTrace ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {Object.entries(placementTrace.projectPass.waterfall).map(
                  ([reason, count]) => (
                    <MetricTile key={reason} label={reason} value={count} compact />
                  )
                )}
              </div>
            ) : (
              <EmptyPanel copy="Placement counters appear after a diagnostic run." />
            )}
          </ConsolePanel>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <ConsolePanel>
            <SectionHeader
              title="Top Bottlenecks"
              meta={
                topBottlenecks.length
                  ? `${topBottlenecks.length} reason${topBottlenecks.length === 1 ? "" : "s"}`
                  : "Awaiting data"
              }
            />
            {topBottlenecks.length === 0 ? (
              <EmptyPanel copy="Bottlenecks will appear after the debug trace captures Unscheduled Projects." />
            ) : (
              <div className="mt-3 space-y-2">
                {topBottlenecks.map((bottleneck) => (
                  <article
                    key={`${bottleneck.reason}-${bottleneck.blockLabel}`}
                    className="rounded-[16px] border border-black/60 bg-white/[0.026] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-mono text-xs font-semibold text-zinc-100">
                          {bottleneck.reason}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Time Block: {bottleneck.blockLabel}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg border border-black/60 bg-black/30 px-2 py-1 text-[10px] font-semibold uppercase text-zinc-500">
                        {bottleneck.count} Event{bottleneck.count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <InlineStat
                        label="Largest gap"
                        value={
                          bottleneck.largestFreeSegmentMin != null
                            ? `${bottleneck.largestFreeSegmentMin}m`
                            : "n/a"
                        }
                      />
                      <InlineStat
                        label="Required"
                        value={
                          bottleneck.requiredDurationMin != null
                            ? `${bottleneck.requiredDurationMin}m`
                            : "n/a"
                        }
                      />
                    </div>
                    {bottleneck.firstCollisionLabel ? (
                      <p className="mt-2 text-[11px] text-zinc-600">
                        First collision with {bottleneck.firstCollisionLabel}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </ConsolePanel>

          <ConsolePanel>
            <SectionHeader
              title="Most Affected Projects"
              meta={`Showing ${affectedProjects.length}`}
            />
            {affectedProjects.length === 0 ? (
              <EmptyPanel copy="No Unscheduled Projects have been captured yet." />
            ) : (
              <div className="mt-3 space-y-2">
                {affectedProjects.map((project) => (
                  <article
                    key={project.itemId}
                    className="rounded-[16px] border border-black/60 bg-white/[0.026] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-words text-sm font-semibold text-white">
                        {project.projectLabel}
                      </p>
                      <span className="shrink-0 rounded-lg border border-black/60 bg-black/30 px-2 py-1 font-mono text-[10px] uppercase text-zinc-500">
                        {project.reason}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <InlineStat
                        label="Required"
                        value={`${project.requiredDurationMin ?? "—"}m`}
                      />
                      <InlineStat
                        label="Best gap"
                        value={`${project.bestGapMin ?? "—"}m`}
                      />
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      Preferred Time Block: {project.blockLabel}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </ConsolePanel>
        </div>

        <ConsolePanel>
          <SectionHeader
            title="Unscheduled Results"
            meta={`${failures.length} Event${failures.length === 1 ? "" : "s"}`}
          />
          {failures.length === 0 ? (
            <EmptyPanel copy="No Unscheduled failures have been reported yet." />
          ) : (
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {groupedFailures.map(([reason, entries]) => (
                <div
                  key={reason}
                  className="rounded-[16px] border border-black/60 bg-white/[0.026] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="break-words font-mono text-xs font-semibold text-zinc-200">
                      {reason}
                    </p>
                    <span className="shrink-0 text-[10px] font-semibold uppercase text-zinc-600">
                      {entries.length}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm">
                    {entries.map((failure, index) => (
                      <li
                        key={`${reason}-${failure.itemId}-${index}`}
                        className="rounded-xl border border-black/50 bg-black/25 px-3 py-2"
                      >
                        <p className="break-words font-mono text-xs uppercase text-zinc-100">
                          {formatProjectLabel(failure.itemId)}
                        </p>
                        {failure.detail ? (
                          <p className="mt-1 text-xs leading-5 text-zinc-500">
                            {failure.detail}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </ConsolePanel>

        <ConsolePanel>
          <SectionHeader
            title="Time Block Occupancy"
            meta={
              occupancyLedger.length
                ? `${occupancyLedger.length} Time Block${occupancyLedger.length === 1 ? "" : "s"}`
                : "Awaiting data"
            }
          />
          {occupancyLedger.length === 0 ? (
            <EmptyPanel copy="Occupancy rows will appear after the scheduler records Time Block usage." />
          ) : (
            <div className="mt-3 space-y-2">
              {occupancyLedger.map((ledger) => {
                const ledgerEntries = ledger.entries ?? [];
                return (
                  <div
                    key={ledger.blockId}
                    className="rounded-[16px] border border-black/60 bg-white/[0.026] p-3 text-[0.75rem] text-zinc-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="break-words text-xs font-semibold text-zinc-200">
                        {formatBlockLabel(ledger.blockId)}
                      </p>
                      <span className="text-[10px] font-semibold uppercase text-zinc-600">
                        {ledgerEntries.length} occupant
                        {ledgerEntries.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <ul className="mt-2 divide-y divide-black/45 overflow-hidden rounded-xl border border-black/50 bg-black/25">
                      {ledgerEntries.map((entry) => (
                        <li
                          key={`${ledger.blockId}-${entry.orderIndex}-${entry.itemId}`}
                          className="grid gap-2 px-3 py-2 sm:grid-cols-[3rem_1fr_auto] sm:items-center"
                        >
                          <span className="font-mono text-[10px] text-zinc-600">
                            #{entry.orderIndex}
                          </span>
                          <span className="min-w-0 break-words text-xs text-zinc-200">
                            {formatProjectLabel(entry.itemId)}{" "}
                            <span className="text-zinc-600">({entry.type})</span>
                          </span>
                          <span className="font-mono text-[10px] uppercase text-zinc-500">
                            {entry.start} - {entry.end} / {entry.pass}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </ConsolePanel>

        <section className="space-y-2">
          <p className="px-1 text-[10px] font-semibold uppercase text-white/35">
            Raw / Internal Details
          </p>
          <details className="overflow-hidden rounded-[18px] border border-black/70 bg-zinc-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <summary className="cursor-pointer border-b border-black/45 bg-black/25 px-4 py-3 text-sm font-semibold text-white">
              Raw debug summary
            </summary>
            <div className="p-3">
              <pre className="max-h-[28rem] overflow-auto rounded-xl border border-black/60 bg-black/40 p-3 text-[0.65rem] text-zinc-300">
                {debugSummary
                  ? JSON.stringify(debugSummary, null, 2)
                  : "Run the debug pass to view the raw summary."}
              </pre>
            </div>
          </details>
          <details className="overflow-hidden rounded-[18px] border border-black/70 bg-zinc-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <summary className="cursor-pointer border-b border-black/45 bg-black/25 px-4 py-3 text-sm font-semibold text-white">
              Full placement trace
            </summary>
            {placementTrace ? (
              <div className="space-y-3 p-3">
                <div className="rounded-xl border border-black/60 bg-black/25 p-3 text-xs text-zinc-500">
                  <p>Run {placementTrace.runId}</p>
                  <p>{placementTrace.tz}</p>
                  <p>Base date: {placementTrace.baseDateIso}</p>
                </div>
                <pre className="max-h-[34rem] overflow-auto rounded-xl border border-black/60 bg-black/40 p-3 text-[0.65rem] text-zinc-300">
                  {JSON.stringify(placementTrace, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="p-4 text-sm text-zinc-500">
                Run the debug pass to capture the full placement trace.
              </p>
            )}
          </details>
        </section>
      </div>
    </main>
  );
}

function ConsolePanel({ children }: { children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.065),rgba(113,113,122,0.08)_30%,rgba(24,24,27,0.30)_62%,rgba(255,255,255,0.03))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_12px_32px_rgba(0,0,0,0.30)]">
      <div className="h-full rounded-[19px] border border-black/60 bg-zinc-950/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-18px_30px_rgba(0,0,0,0.30)]">
        {children}
      </div>
    </section>
  );
}

function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-black/45 pb-3">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {meta ? (
        <span className="shrink-0 text-right text-[10px] font-semibold uppercase text-zinc-600">
          {meta}
        </span>
      ) : null}
    </div>
  );
}

function MetricTile({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: number | string;
  compact?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-[14px] border border-black/60 bg-black/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <p className="truncate text-[10px] font-semibold uppercase text-zinc-600">
        {label}
      </p>
      <p
        className={
          compact
            ? "mt-1 font-mono text-lg font-semibold text-white"
            : "mt-1 font-mono text-2xl font-semibold text-white"
        }
      >
        {value}
      </p>
    </div>
  );
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/50 bg-black/25 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase text-zinc-600">
        {label}
      </p>
      <p className="mt-1 font-mono text-xs font-semibold text-zinc-200">
        {value}
      </p>
    </div>
  );
}

function EmptyPanel({ copy }: { copy: string }) {
  return (
    <div className="mt-3 rounded-[16px] border border-black/60 bg-black/25 p-4 text-sm leading-6 text-zinc-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      {copy}
    </div>
  );
}

const ID_TRUNCATE_LENGTH = 8;

function formatLookupId(
  id: string | null | undefined,
  lookup?: Record<string, string> | null
): string {
  if (!id) return "unknown";
  const label = lookup?.[id];
  if (label) return label;
  return id.slice(0, ID_TRUNCATE_LENGTH);
}

function formatBlockDisplay(
  id: string | null | undefined,
  display?: SchedulerDebugDisplay | null
): string {
  if (!id) return "unknown";
  const label =
    display?.dayTypeTimeBlocksById[id] ??
    display?.timeBlocksById[id] ??
    display?.windowsById[id];
  if (label) return label;
  return id.slice(0, ID_TRUNCATE_LENGTH);
}

function isPlacementTruthTrace(value: unknown): value is PlacementTruthTrace {
  return (
    typeof value === "object" &&
    value !== null &&
    "projectPass" in (value as Record<string, unknown>)
  );
}

function isDebugMetaPayload(
  value: unknown
): value is {
  placementTrace?: PlacementTruthTrace | null;
  display?: SchedulerDebugDisplay | null;
  fatal?: unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    ("placementTrace" in (value as Record<string, unknown>) ||
      "display" in (value as Record<string, unknown>) ||
      "fatal" in (value as Record<string, unknown>))
  );
}

function formatSchedulerDebugError(
  payload: ScheduleDebugResponse | Record<string, unknown>
) {
  const base =
    typeof payload.error === "string" && payload.error.trim()
      ? payload.error.trim()
      : "Scheduler debug run failed";
  const fatal =
    isDebugMetaPayload(payload.debug) && payload.debug.fatal
      ? formatUnknownDiagnostic(payload.debug.fatal)
      : null;
  const scheduleError = formatScheduleError(payload);
  const details = [scheduleError, fatal]
    .filter((detail): detail is string => Boolean(detail))
    .filter((detail) => detail !== base);

  return details.length > 0 ? `${base}: ${details.join(" | ")}` : base;
}

function formatScheduleError(payload: Record<string, unknown>) {
  const schedule = payload.schedule;
  if (!schedule || typeof schedule !== "object") return null;
  const error = (schedule as { error?: unknown }).error;
  return formatUnknownDiagnostic(error);
}

function formatUnknownDiagnostic(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? truncateDiagnostic(trimmed) : null;
  }
  if (typeof value !== "object") {
    return truncateDiagnostic(String(value));
  }

  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  const errorMessage =
    typeof record.errorMessage === "string" ? record.errorMessage.trim() : "";
  const message = typeof record.message === "string" ? record.message.trim() : "";
  const status =
    typeof record.status === "number" && Number.isFinite(record.status)
      ? record.status
      : null;
  const rayId = typeof record.rayId === "string" ? record.rayId.trim() : "";

  if (errorMessage || message) parts.push(errorMessage || message);
  if (status != null) parts.push(`status ${status}`);
  if (rayId) parts.push(`ray ${rayId}`);

  if (parts.length > 0) return truncateDiagnostic(parts.join(" / "));

  try {
    const json = JSON.stringify(value);
    return json && json !== "{}" ? truncateDiagnostic(json) : null;
  } catch {
    return null;
  }
}

function truncateDiagnostic(value: string, limit = 500) {
  return value.length <= limit ? value : `${value.slice(0, limit)}...`;
}
