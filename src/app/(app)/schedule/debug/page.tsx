"use client";

import { useCallback, useMemo, useState } from "react";
import type { PlacementTruthTrace } from "@/lib/scheduler/placementTrace";
import type { SchedulerDebugDisplay } from "@/lib/scheduler/debugDisplay";

type FailureSummary = {
  itemId: string;
  reason: string;
  detail?: string;
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

  const formatProjectLabel = (id?: string | null) =>
    formatLookupId(id, debugDisplay?.projectsById);

  const formatBlockLabel = (id?: string | null) =>
    formatBlockDisplay(id, debugDisplay);

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
        <section className="space-y-3 rounded-2xl border border-white/5 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Debug Summary</h2>
            <span className="text-xs text-white/60">
              {debugSummary ? "Loaded" : "No data"}
            </span>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-white">
            {debugSummary
              ? JSON.stringify(debugSummary, null, 2)
              : "Run the debug pass to view summary data."}
          </pre>
        </section>
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Unscheduled Failures</h2>
            <span className="text-xs text-white/60">
              {failures.length} item{failures.length === 1 ? "" : "s"}
            </span>
          </div>
          {failures.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-black/20 p-4 text-sm text-white/70">
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
        {placementTrace && (
          <section className="space-y-4 rounded-2xl border border-white/5 bg-white/5 p-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="text-lg font-semibold text-white">Placement Truth Trace</h2>
                <p className="text-xs text-white/60">
                  Run {placementTrace.runId} · {placementTrace.tz}
                </p>
                <p className="text-xs text-white/60">
                  Base date: {placementTrace.baseDateIso}
                </p>
              </div>
              <div className="text-right text-xs text-white/60">
                <p>Queued: {placementTrace.projectPass.queuedCount}</p>
                <p>Placed: {placementTrace.projectPass.placedCount}</p>
                <p>Unplaced: {placementTrace.projectPass.unplacedCount}</p>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-white">Waterfall counters</h3>
              <div className="grid grid-cols-2 gap-2 text-xs text-white">
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
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-white">Block occupancy ledger</h3>
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Unplaced projects</h3>
                <span className="text-xs text-white/60">
                  {unplacedProjects.length} item
                  {unplacedProjects.length === 1 ? "" : "s"}
                </span>
              </div>
              {unplacedProjects.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
                  No unplaced projects detected.
                </div>
              ) : (
                <div className="space-y-3">
                  {unplacedProjects.map((item) => {
                    const noSlotDetails = item.noSlotDetails ?? [];
                    const noSlotSummary =
                      item.passedGatesButNoSlot ?? noSlotDetails[0] ?? null;
                    return (
                      <div
                        key={item.itemId}
                        className="rounded-2xl border border-white/10 bg-black/25 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-white">
                              {formatProjectLabel(item.itemId)}
                            </p>
                            <p className="text-xs text-white/60">
                              Days scanned: {item.daysScanned} · Blocks: {item.blocksScanned} ·
                              Attempts: {item.placementAttempts}
                            </p>
                          </div>
                          <span className="text-xs text-white/60">
                            Candidates: {item.candidatesGenerated}
                          </span>
                        </div>
                        <div className="mt-3 space-y-4 text-xs text-white/80">
                          <div className="grid grid-cols-2 gap-3 text-[0.65rem] text-white/70">
                            <p>Attempted blocks: {item.attemptedBlockCount}</p>
                            <p>
                              Sample IDs:{" "}
                              {(item.attemptedBlockIdsSample?.length ?? 0) > 0
                                ? (item.attemptedBlockIdsSample ?? []).join(", ")
                                : "none"}
                            </p>
                          </div>
                          {(item.closestCandidates?.length ?? 0) > 0 && (
                            <div className="space-y-1 rounded-xl border border-white/5 bg-black/30 p-3 text-[0.75rem] text-white/70">
                              <p className="text-[0.65rem] uppercase tracking-wide text-white/60">
                                Closest candidates
                              </p>
                              <ul className="space-y-1">
                                {(item.closestCandidates ?? []).map((candidate, index) => (
                                  <li
                                    key={`${item.itemId}-closest-${candidate.blockId}-${index}`}
                                  >
                                    <span className="font-mono text-[0.65rem] text-white/60">
                                      {formatBlockLabel(candidate.blockId)}
                                    </span>
                                    <span className="ml-2 text-[0.7rem] text-white/60">
                                      Gate: {candidate.firstFailGate ?? "passed"} · Gap:{" "}
                                      {candidate.largestFreeSegmentMin}m · Required:{" "}
                                      {candidate.requiredDurationMin}m · Collisions:{" "}
                                      {candidate.collisionCount ?? 0} · Location:{" "}
                                      {candidate.locationContextId ??
                                        candidate.locationContextValue ??
                                        "any"}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {(item.blockGateSamples?.length ?? 0) > 0 && (
                            <div className="space-y-3">
                              <p className="text-[0.65rem] uppercase tracking-wide text-white/60">
                                Gate trace samples
                              </p>
                              <div className="space-y-2">
                                {(item.blockGateSamples ?? []).map((sample, index) => (
                                  <div
                                    key={`${item.itemId}-trace-${sample.blockId}-${index}`}
                                    className="rounded-2xl border border-white/10 bg-black/25 p-3"
                                  >
                                    <div className="flex items-center justify-between text-[0.65rem] text-white/60">
                                      <span className="font-mono">
                                        {formatBlockLabel(sample.blockId)}
                                      </span>
                                      <span>
                                        {sample.attempted ? "Attempted" : "Not attempted"}
                                      </span>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-[0.65rem] text-white/60">
                                      <p>Duration: {sample.durationMin}m</p>
                                      <p>Energy: {sample.energy ?? "—"}</p>
                                      <p>
                                        Location:{" "}
                                        {sample.locationContextId ??
                                          sample.locationContextValue ??
                                          "—"}
                                      </p>
                                      <p>
                                        Free segment: {sample.freeSegmentMinutes ?? "—"}m
                                      </p>
                                      <p>Collisions: {sample.collisionCount ?? "—"}</p>
                                      <p>First fail: {sample.firstFailGate ?? "N/A"}</p>
                                    </div>
                                    <div className="mt-3 space-y-1 text-[0.65rem]">
                                      {(sample.stageResults ?? []).map((stage) => (
                                        <div
                                          key={`${sample.blockId}-${stage.name}-${stage.passed}`}
                                          className="flex items-center justify-between"
                                        >
                                          <span
                                            className={`${
                                              stage.passed
                                                ? "text-emerald-400"
                                                : "text-rose-400"
                                            } text-[0.65rem]`}
                                          >
                                            {stage.passed ? "PASS" : "FAIL"} {stage.name}
                                          </span>
                                          {stage.details && (
                                            <span className="text-white/60">
                                              — {stage.details}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {((item.noSlotDetails?.length ?? 0) > 0 || noSlotSummary) && (
                            <div className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-3 text-[0.7rem] text-white/70">
                              <p className="text-[0.65rem] uppercase tracking-wide text-white/60">
                                No feasible slot
                              </p>
                              {noSlotSummary && (
                                <div className="space-y-1">
                                  <p>
                                    Block:{" "}
                                    <span className="font-mono">
                                      {formatBlockLabel(noSlotSummary.blockId)}
                                    </span>
                                  </p>
                                  <p>
                                    Largest free segment: {noSlotSummary.largestFreeSegmentMin}m
                                  </p>
                                  <p>
                                    Required duration: {noSlotSummary.requiredDurationMin}m
                                  </p>
                                  {noSlotSummary.firstCollision && (
                                    <p>
                                      First collision:{" "}
                                      {formatProjectLabel(
                                        noSlotSummary.firstCollision.itemId
                                      )}{" "}
                                      ({noSlotSummary.firstCollision.type}) at{" "}
                                      {noSlotSummary.firstCollision.start}
                                    </p>
                                  )}
                                </div>
                              )}
                              {(item.noSlotDetails?.length ?? 0) > 0 && (
                                <div className="space-y-1 text-[0.65rem] text-white/60">
                                  {(item.noSlotDetails ?? []).map((detail) => (
                                    <p
                                      key={`${item.itemId}-noslot-${detail.blockId}`}
                                    >
                                      Block {formatBlockLabel(detail.blockId)} · gap{" "}
                                      {detail.largestFreeSegmentMin}m · required{" "}
                                      {detail.requiredDurationMin}m
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          <div className="space-y-2">
                            <p className="text-[0.65rem] uppercase tracking-wide text-white/60">
                              Top reasons
                            </p>
                            {(item.topReasons?.length ?? 0) === 0 ? (
                              <p>No reasons captured.</p>
                            ) : (
                              (item.topReasons ?? []).map((reason) => (
                                <div key={reason.code} className="space-y-1">
                                  <p className="text-[0.65rem] uppercase tracking-wide text-white/60">
                                    {reason.code} ({reason.count})
                                  </p>
                                  {(reason.examples ?? []).map((example, index) => (
                                    <p
                                      key={`${reason.code}-${example.blockId ?? "unknown"}-${index}`}
                                      className="text-white/80"
                                    >
                                      <span className="font-mono text-[0.65rem] text-white/70">
                                        {formatBlockLabel(example.blockId ?? null)}
                                      </span>
                                      {example.details ? (
                                        <span className="ml-2 text-[0.65rem] text-white/60">
                                          — {example.details}
                                        </span>
                                      ) : null}
                                    </p>
                                  ))}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}
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
