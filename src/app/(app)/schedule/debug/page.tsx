"use client";

import { useCallback, useMemo, useState } from "react";
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
      const response = await fetch(
        "/api/scheduler/run?writeThroughDays=14&debug=1",
        {
          method: "POST",
        }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Scheduler debug run failed");
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
      : "more time than slots provide";
    return `Most unplaced projects failed because the best matching windows only had ${gapDesc}, while those projects required ${reqDesc}.`;
  }, [topBottleneck]);

  return (
    <main className="min-h-screen w-full px-4 pb-8 pt-32 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-[var(--text-muted)]">
            Schedule Debug
          </p>
          <h1 className="text-2xl font-semibold text-white">
            Run Scheduler Diagnostics
          </h1>
          <p className="text-sm text-white/70">
            Run a manual scheduler pass with debug output and inspect the summary
            plus any failures that prevented unscheduled items from being placed.
          </p>
        </header>
        <section className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleRunDebug}
            disabled={isRunning}
            className="inline-flex items-center justify-center rounded-full bg-white/5 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-white/5"
          >
            {isRunning ? "Running debug…" : "Run Debug"}
          </button>
          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </section>
        <section className="space-y-3 rounded-2xl border border-white/5 bg-white/5 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Plain English Summary</h2>
              <p className="text-xs text-white/60">
                {placementTrace
                  ? `Run ${placementTrace.runId} · ${placementTrace.tz}`
                  : "Run the scheduler debug pass for a fresh snapshot."}
              </p>
            </div>
            {placementTrace && (
              <div className="text-right text-xs text-white/60">
                <p>Base date: {placementTrace.baseDateIso}</p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 text-white">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-center">
              <p className="text-[0.65rem] uppercase tracking-wide text-white/60">Queued</p>
              <p className="text-2xl font-semibold text-white">
                {formatCount(placementCounts?.queuedCount)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-center">
              <p className="text-[0.65rem] uppercase tracking-wide text-white/60">Placed</p>
              <p className="text-2xl font-semibold text-white">
                {formatCount(placementCounts?.placedCount)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-center">
              <p className="text-[0.65rem] uppercase tracking-wide text-white/60">Unplaced</p>
              <p className="text-2xl font-semibold text-white">
                {formatCount(placementCounts?.unplacedCount)}
              </p>
            </div>
          </div>
          <p className="text-sm text-white/70">{summarySentence}</p>
          <div className="flex flex-col gap-1 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Top failure reason:{" "}
              <span className="font-semibold text-white">
                {topFailureReason ?? "n/a"}
              </span>
              {topFailureCount > 0 && (
                <> ({topFailureCount} item{topFailureCount === 1 ? "" : "s"})</>
              )}
            </span>
            <span>
              Top blocking block/window:{" "}
              <span className="font-semibold text-white">
                {topBottleneck?.blockLabel ?? "n/a"}
              </span>
            </span>
          </div>
        </section>
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Top Bottlenecks</h2>
            <span className="text-xs text-white/60">
              {topBottlenecks.length
                ? `${topBottlenecks.length} reason${topBottlenecks.length === 1 ? "" : "s"}`
                : "Awaiting data"}
            </span>
          </div>
          {topBottlenecks.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
              Bottlenecks will appear here after running the debug trace.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {topBottlenecks.map((bottleneck) => (
                <article
                  key={`${bottleneck.reason}-${bottleneck.blockLabel}`}
                  className="rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">{bottleneck.reason}</p>
                    <span className="text-[0.65rem] uppercase text-white/60">
                      {bottleneck.count} item{bottleneck.count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-white/60">
                    Block/window: {bottleneck.blockLabel}
                  </p>
                  <div className="mt-3 space-y-2 text-xs text-white/70">
                    <div className="flex items-center justify-between">
                      <span>Largest gap</span>
                      <span>
                        {bottleneck.largestFreeSegmentMin != null
                          ? `${bottleneck.largestFreeSegmentMin}m`
                          : "n/a"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Required duration</span>
                      <span>
                        {bottleneck.requiredDurationMin != null
                          ? `${bottleneck.requiredDurationMin}m`
                          : "n/a"}
                      </span>
                    </div>
                  </div>
                  {bottleneck.firstCollisionLabel && (
                    <p className="mt-2 text-[0.65rem] text-white/50">
                      First collision with {bottleneck.firstCollisionLabel}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Most Affected Projects</h2>
            <span className="text-xs text-white/60">
              Showing {affectedProjects.length} project
              {affectedProjects.length === 1 ? "" : "s"}
            </span>
          </div>
          {affectedProjects.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
              No unplaced projects were captured.
            </div>
          ) : (
            <div className="space-y-3">
              {affectedProjects.map((project) => (
                <article
                  key={project.itemId}
                  className="rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-white">{project.projectLabel}</p>
                    <span className="text-[0.65rem] uppercase text-white/60">
                      {project.reason}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-white/70">
                    <p>
                      Required:{" "}
                      <span className="font-semibold text-white">
                        {project.requiredDurationMin ?? "—"}m
                      </span>{" "}
                      · Gap:{" "}
                      <span className="font-semibold text-white">
                        {project.bestGapMin ?? "—"}m
                      </span>
                    </p>
                    <p>Preferred block/window: {project.blockLabel}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Unscheduled Failures</h2>
            <span className="text-xs text-white/60">
              {failures.length} item{failures.length === 1 ? "" : "s"}
            </span>
          </div>
          {failures.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
              No failures reported yet.
            </div>
          ) : (
            <div className="space-y-3">
              {groupedFailures.map(([reason, entries]) => (
                <div
                  key={reason}
                  className="rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {reason}
                  </p>
                  <ul className="mt-3 space-y-1 text-sm">
                    {entries.map((failure, index) => (
                      <li
                        key={`${reason}-${failure.itemId}-${index}`}
                        className="text-white/90"
                      >
                        <span className="font-mono text-xs uppercase tracking-wide text-white">
                          {formatProjectLabel(failure.itemId)}
                        </span>
                        {failure.detail ? (
                          <span className="ml-2 text-xs text-white/60">
                            — {failure.detail}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="space-y-3">
          <details className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/70">
            <summary className="cursor-pointer text-sm font-semibold text-white">
              Raw debug summary
            </summary>
            <div className="mt-3">
              <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-[0.65rem] text-white">
                {debugSummary
                  ? JSON.stringify(debugSummary, null, 2)
                  : "Run the debug pass to view the raw summary."}
              </pre>
            </div>
          </details>
          <details className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/70">
            <summary className="cursor-pointer text-sm font-semibold text-white">
              Full placement trace
            </summary>
            {placementTrace ? (
              <div className="mt-3 space-y-3">
                <div className="text-xs text-white/60">
                  <p>Run {placementTrace.runId}</p>
                  <p>{placementTrace.tz}</p>
                  <p>Base date: {placementTrace.baseDateIso}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-[0.65rem] uppercase tracking-wide text-white/60">
                    Waterfall counters
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-[0.65rem] text-white/70">
                    {Object.entries(placementTrace.projectPass.waterfall).map(
                      ([reason, count]) => (
                        <div
                          key={reason}
                          className="rounded-lg border border-white/10 bg-black/30 p-2"
                        >
                          <p className="text-[0.6rem] uppercase tracking-wide text-white/60">
                            {reason}
                          </p>
                          <p className="text-sm font-semibold text-white">{count}</p>
                        </div>
                      )
                    )}
                  </div>
                </div>
                <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-[0.65rem] text-white">
                  {JSON.stringify(placementTrace, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="mt-3 text-sm text-white/60">
                Run the debug pass to capture the full placement trace.
              </p>
            )}
          </details>
          <details className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/70">
            <summary className="cursor-pointer text-sm font-semibold text-white">
              Block occupancy ledger
            </summary>
            <div className="mt-3 space-y-3">
              {occupancyLedger.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-white/70">
                  No occupancy ledger entries recorded yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {occupancyLedger.map((ledger) => {
                    const ledgerEntries = ledger.entries ?? [];
                    return (
                      <div
                        key={ledger.blockId}
                        className="rounded-2xl border border-white/10 bg-black/25 p-3 text-[0.75rem] text-white/70"
                      >
                        <p className="text-[0.65rem] text-white/60">
                          Block {formatBlockLabel(ledger.blockId)} ·{" "}
                          {ledgerEntries.length} occupant
                          {ledgerEntries.length === 1 ? "" : "s"}
                        </p>
                        <ul className="mt-2 space-y-1">
                          {ledgerEntries.map((entry) => (
                            <li
                              key={`${ledger.blockId}-${entry.orderIndex}-${entry.itemId}`}
                              className="flex items-center justify-between"
                            >
                              <span className="font-mono text-[0.65rem] text-white/50">
                                #{entry.orderIndex}
                              </span>
                              <span className="text-white/80">
                                {formatProjectLabel(entry.itemId)} ({entry.type}){" "}
                                <span className="text-[0.65rem] text-white/50">
                                  {entry.start} → {entry.end}
                                </span>
                              </span>
                              <span className="text-[0.6rem] uppercase text-white/50">
                                {entry.pass}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </details>
        </section>
      </div>
    </main>
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
): value is { placementTrace?: PlacementTruthTrace | null; display?: SchedulerDebugDisplay | null; fatal?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    ("placementTrace" in (value as Record<string, unknown>) ||
      "display" in (value as Record<string, unknown>) ||
      "fatal" in (value as Record<string, unknown>))
  );
}
