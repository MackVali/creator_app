export type SchedulerTiming = {
  tag: "SCHEDULER_TIMING";
  runId: string;
  phases: Record<string, number>;
  route: {
    totalMs: number;
    requestContextMs: number;
    clientCreateMs: number;
    authMs: number;
    profileTimeZoneMs: number;
    schedulerMs: number;
    responseMs: number;
    status: number | null;
    writeThroughDays: number | null;
    modeType: string | null;
  };
  runner: {
    totalMs: number;
    resetUnlockedProjects: {
      ms: number;
      fetched: number | null;
      updated: number | null;
    };
    markMissed: { ms: number; affected: number | null };
    scheduleBacklog: { ms: number };
  };
  schedule: {
    totalMs: number;
    lookaheadDays: number | null;
    effectiveDayLimit: number | null;
    effectiveHorizonDays: number | null;
    loadData: {
      ms: number;
      counts: Record<string, number>;
    };
    writeThroughResolutionMs: number;
    scheduleInstanceQueries: {
      calls: number;
      totalMs: number;
      rows: number;
    };
    overlaySpanLoading: {
      calls: number;
      totalMs: number;
      rows: number;
      dynamicCalls: number;
      dynamicMs: number;
      dynamicRows: number;
      rangePreloadMs: number;
      rangeBlockRows: number;
      rangeDynamicRows: number;
      rangeWhitelistRows: number;
      rangeCacheSetDays: number;
      demandFallbackCount: number;
    };
    normalizeProjectInstances: {
      ms: number;
      loaded: number | null;
      insertedMissed: number;
      canceledDuplicates: number;
    };
    backlog: {
      projects: number;
      tasks: number;
      habits: number;
      queue: number;
      days: number | null;
      windowsLoaded: number;
      blockers: number;
    };
    cleanupDedupe: {
      ms: number;
      canceled: number;
      dedupeFetched: number;
      overlapInvalidated: number;
    };
    habitPasses: {
      totalMs: number;
      dueEvaluationMs: number;
      reservationMs: number;
      placementMs: number;
    };
    syncPairings: {
      lookupMs: number;
      fallbackLookupMs: number;
      fallbackLookups: number;
      fallbackPartners: number;
      persistedRows: number;
    };
    projectPass: { ms: number; queued: number; placed: number; failed: number };
    compatibleWindows: {
      calls: number;
      totalMs: number;
      projectCalls: number;
      habitCalls: number;
      windowsIn: number;
      windowsOut: number;
      zeroResults: number;
      constraintRejections: Record<string, number>;
    };
    placeItem: {
      calls: number;
      totalMs: number;
      success: number;
      noFit: number;
      errors: number;
      blockersScanned: number;
      persistWriteMs: number;
    };
    createWrites: {
      batchFlushCount: number;
      batchRowsTotal: number;
      batchMaxRows: number;
      batchFlushMs: number;
      syncImmediateCreateCount: number;
      syncImmediateCreateMs: number;
      finalSyncRetryBatchedCreateCount: number;
      finalSyncRetryBatchedCreateMs: number;
    };
    dbWrites: {
      inserts: number;
      updates: number;
      cancels: number;
      deletes: number;
      upserts: number;
      rowsAffected: number;
    };
    finalInvariant: { ms: number; fetched: number; scanned: number; canceled: number };
  };
};

export type SchedulerTimingSummary = {
  totalMs: number;
  writeThroughDays?: number;
  status?: number;
  topPhases: Array<{ label: string; ms: number }>;
  phaseCount: number;
  counters: Record<string, number>;
};

export function schedulerNowMs() {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function elapsedMs(startedAt: number) {
  return Math.round((schedulerNowMs() - startedAt) * 100) / 100;
}

export function shouldLogSchedulerTiming(debugQueryEnabled: boolean) {
  return (
    process.env.SCHEDULER_DEBUG_TIMING === "true" ||
    (debugQueryEnabled && process.env.NODE_ENV !== "production")
  );
}

export function createSchedulerTiming(runId = createRunId()): SchedulerTiming {
  return {
    tag: "SCHEDULER_TIMING",
    runId,
    phases: {},
    route: {
      totalMs: 0,
      requestContextMs: 0,
      clientCreateMs: 0,
      authMs: 0,
      profileTimeZoneMs: 0,
      schedulerMs: 0,
      responseMs: 0,
      status: null,
      writeThroughDays: null,
      modeType: null,
    },
    runner: {
      totalMs: 0,
      resetUnlockedProjects: { ms: 0, fetched: null, updated: null },
      markMissed: { ms: 0, affected: null },
      scheduleBacklog: { ms: 0 },
    },
    schedule: {
      totalMs: 0,
      lookaheadDays: null,
      effectiveDayLimit: null,
      effectiveHorizonDays: null,
      loadData: { ms: 0, counts: {} },
      writeThroughResolutionMs: 0,
      scheduleInstanceQueries: {
        calls: 0,
        totalMs: 0,
        rows: 0,
      },
      overlaySpanLoading: {
        calls: 0,
        totalMs: 0,
        rows: 0,
        dynamicCalls: 0,
        dynamicMs: 0,
        dynamicRows: 0,
        rangePreloadMs: 0,
        rangeBlockRows: 0,
        rangeDynamicRows: 0,
        rangeWhitelistRows: 0,
        rangeCacheSetDays: 0,
        demandFallbackCount: 0,
      },
      normalizeProjectInstances: {
        ms: 0,
        loaded: null,
        insertedMissed: 0,
        canceledDuplicates: 0,
      },
      backlog: {
        projects: 0,
        tasks: 0,
        habits: 0,
        queue: 0,
        days: null,
        windowsLoaded: 0,
        blockers: 0,
      },
      cleanupDedupe: {
        ms: 0,
        canceled: 0,
        dedupeFetched: 0,
        overlapInvalidated: 0,
      },
      habitPasses: {
        totalMs: 0,
        dueEvaluationMs: 0,
        reservationMs: 0,
        placementMs: 0,
      },
      syncPairings: {
        lookupMs: 0,
        fallbackLookupMs: 0,
        fallbackLookups: 0,
        fallbackPartners: 0,
        persistedRows: 0,
      },
      projectPass: { ms: 0, queued: 0, placed: 0, failed: 0 },
      compatibleWindows: {
        calls: 0,
        totalMs: 0,
        projectCalls: 0,
        habitCalls: 0,
        windowsIn: 0,
        windowsOut: 0,
        zeroResults: 0,
        constraintRejections: {},
      },
      placeItem: {
        calls: 0,
        totalMs: 0,
        success: 0,
        noFit: 0,
        errors: 0,
        blockersScanned: 0,
        persistWriteMs: 0,
      },
      createWrites: {
        batchFlushCount: 0,
        batchRowsTotal: 0,
        batchMaxRows: 0,
        batchFlushMs: 0,
        syncImmediateCreateCount: 0,
        syncImmediateCreateMs: 0,
        finalSyncRetryBatchedCreateCount: 0,
        finalSyncRetryBatchedCreateMs: 0,
      },
      dbWrites: {
        inserts: 0,
        updates: 0,
        cancels: 0,
        deletes: 0,
        upserts: 0,
        rowsAffected: 0,
      },
      finalInvariant: { ms: 0, fetched: 0, scanned: 0, canceled: 0 },
    },
  };
}

export function recordSchedulerPhase(
  timing: SchedulerTiming | null | undefined,
  label: string,
  ms: number
) {
  if (!timing) return;
  timing.phases[label] =
    Math.round(((timing.phases[label] ?? 0) + ms) * 100) / 100;
}

export function addSchedulerTimingMs(
  target: { ms?: number; totalMs?: number },
  key: "ms" | "totalMs",
  ms: number
) {
  target[key] = Math.round(((target[key] ?? 0) + ms) * 100) / 100;
}

export function buildSchedulerTimingSummary(
  timing: SchedulerTiming
): SchedulerTimingSummary {
  const counters: Record<string, number> = {};
  const addCounter = (label: string, value: number | null | undefined) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    counters[label] = Math.round(value * 100) / 100;
  };

  addCounter("resetFetched", timing.runner.resetUnlockedProjects.fetched);
  addCounter("resetUpdated", timing.runner.resetUnlockedProjects.updated);
  addCounter("missedCount", timing.schedule.loadData.counts.missed);
  addCounter("taskCount", timing.schedule.backlog.tasks);
  addCounter("projectCount", timing.schedule.backlog.projects);
  addCounter("evaluatedHabitCount", timing.schedule.backlog.habits);
  addCounter("queueCount", timing.schedule.backlog.queue);
  addCounter("windowCount", timing.schedule.backlog.windowsLoaded);
  addCounter("blockerCount", timing.schedule.backlog.blockers);
  addCounter(
    "existingInstanceCount",
    timing.schedule.scheduleInstanceQueries.rows
  );
  addCounter("overlaySpanCount", timing.schedule.overlaySpanLoading.rows);
  addCounter(
    "dynamicOverlaySpanCount",
    timing.schedule.overlaySpanLoading.dynamicRows
  );
  addCounter(
    "overlayRangePreloadMs",
    timing.schedule.overlaySpanLoading.rangePreloadMs
  );
  addCounter(
    "overlayDemandFallbackCount",
    timing.schedule.overlaySpanLoading.demandFallbackCount
  );
  addCounter("projectQueued", timing.schedule.projectPass.queued);
  addCounter("projectPlaced", timing.schedule.projectPass.placed);
  addCounter("projectFailed", timing.schedule.projectPass.failed);
  addCounter("placeCalls", timing.schedule.placeItem.calls);
  addCounter("placeSuccess", timing.schedule.placeItem.success);
  addCounter("placeNoFit", timing.schedule.placeItem.noFit);
  addCounter("created", timing.schedule.dbWrites.inserts);
  addCounter("createBatchFlushCount", timing.schedule.createWrites.batchFlushCount);
  addCounter("createBatchRowsTotal", timing.schedule.createWrites.batchRowsTotal);
  addCounter("createBatchMaxRows", timing.schedule.createWrites.batchMaxRows);
  addCounter("createBatchFlushMs", timing.schedule.createWrites.batchFlushMs);
  addCounter(
    "syncImmediateCreateCount",
    timing.schedule.createWrites.syncImmediateCreateCount
  );
  addCounter(
    "syncImmediateCreateMs",
    timing.schedule.createWrites.syncImmediateCreateMs
  );
  addCounter(
    "finalSyncRetryBatchedCreateCount",
    timing.schedule.createWrites.finalSyncRetryBatchedCreateCount
  );
  addCounter(
    "finalSyncRetryBatchedCreateMs",
    timing.schedule.createWrites.finalSyncRetryBatchedCreateMs
  );
  addCounter("updated", timing.schedule.dbWrites.updates);
  addCounter("deleted", timing.schedule.dbWrites.deletes);
  addCounter("canceled", timing.schedule.dbWrites.cancels);
  addCounter("upserted", timing.schedule.dbWrites.upserts);
  addCounter("rowsAffected", timing.schedule.dbWrites.rowsAffected);
  addCounter("finalInvariantScanned", timing.schedule.finalInvariant.scanned);
  addCounter("finalInvariantCanceled", timing.schedule.finalInvariant.canceled);

  const summary: SchedulerTimingSummary = {
    totalMs: timing.route.totalMs,
    topPhases: Object.entries(timing.phases)
      .filter(([label]) => label !== "scheduler.route.total")
      .map(([label, ms]) => ({ label, ms }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 10),
    phaseCount: Object.keys(timing.phases).length,
    counters,
  };

  if (typeof timing.route.writeThroughDays === "number") {
    summary.writeThroughDays = timing.route.writeThroughDays;
  }
  if (typeof timing.route.status === "number") {
    summary.status = timing.route.status;
  }

  return summary;
}

export function recordSchedulerDbWrite(
  timing: SchedulerTiming | null | undefined,
  kind: keyof SchedulerTiming["schedule"]["dbWrites"],
  rowsAffected = 0
) {
  if (!timing) return;
  timing.schedule.dbWrites[kind] += 1;
  if (rowsAffected > 0) {
    timing.schedule.dbWrites.rowsAffected += rowsAffected;
  }
}

function createRunId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
