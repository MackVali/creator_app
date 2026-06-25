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
    habitPlacementInstrumentation: {
      noFitCacheHit: number;
      noFitCacheMiss: number;
      noFitCacheSet: number;
      noFitCacheBypass: number;
      placeCallsInitialDaily: number;
      placeCallsPostProject: number;
      placeCallsCleanup: number;
      placeCallsNonDaily: number;
      placeCallsFinalSyncRetry: number;
      placeNoFitInitialDaily: number;
      placeNoFitPostProject: number;
      placeNoFitCleanup: number;
      placeNoFitNonDaily: number;
      placeNoFitFinalSyncRetry: number;
      compatibleWindowCallsInitialDaily: number;
      compatibleWindowCallsPostProject: number;
      compatibleWindowCallsCleanup: number;
      compatibleWindowCallsNonDaily: number;
      compatibleWindowCallsFinalSyncRetry: number;
      compatibleWindowMsInitialDaily: number;
      compatibleWindowMsPostProject: number;
      compatibleWindowMsCleanup: number;
      compatibleWindowMsNonDaily: number;
      compatibleWindowMsFinalSyncRetry: number;
      candidateWindowsConsideredInitialDaily: number;
      candidateWindowsConsideredPostProject: number;
      candidateWindowsConsideredCleanup: number;
      candidateWindowsConsideredNonDaily: number;
      candidateWindowsConsideredFinalSyncRetry: number;
      daysConsideredInitialDaily: number;
      daysConsideredPostProject: number;
      daysConsideredCleanup: number;
      daysConsideredNonDaily: number;
      daysConsideredFinalSyncRetry: number;
      eligibilitySkipsInitialDaily: number;
      eligibilitySkipsPostProject: number;
      eligibilitySkipsCleanup: number;
      eligibilitySkipsNonDaily: number;
      eligibilitySkipsFinalSyncRetry: number;
      existingInstanceChecksInitialDaily: number;
      existingInstanceChecksPostProject: number;
      existingInstanceChecksCleanup: number;
      existingInstanceChecksNonDaily: number;
      existingInstanceChecksFinalSyncRetry: number;
      asyncReadsInitialDaily: number;
      asyncReadsPostProject: number;
      asyncReadsCleanup: number;
      asyncReadsNonDaily: number;
      asyncReadsFinalSyncRetry: number;
      asyncReadMsInitialDaily: number;
      asyncReadMsPostProject: number;
      asyncReadMsCleanup: number;
      asyncReadMsNonDaily: number;
      asyncReadMsFinalSyncRetry: number;
      reservationChecksInitialDaily: number;
      reservationChecksPostProject: number;
      reservationChecksCleanup: number;
      reservationChecksNonDaily: number;
      reservationChecksFinalSyncRetry: number;
      practiceHistoryChecksInitialDaily: number;
      practiceHistoryChecksPostProject: number;
      practiceHistoryChecksCleanup: number;
      practiceHistoryChecksNonDaily: number;
      practiceHistoryChecksFinalSyncRetry: number;
      sortDedupeMsInitialDaily: number;
      sortDedupeMsPostProject: number;
      sortDedupeMsCleanup: number;
      sortDedupeMsNonDaily: number;
      sortDedupeMsFinalSyncRetry: number;
      dueEvaluationMsInitialDaily: number;
      dueEvaluationMsPostProject: number;
      dueEvaluationMsCleanup: number;
      dueEvaluationMsNonDaily: number;
      dueEvaluationMsFinalSyncRetry: number;
      prePlacementMsInitialDaily: number;
      prePlacementMsPostProject: number;
      prePlacementMsCleanup: number;
      prePlacementMsNonDaily: number;
      prePlacementMsFinalSyncRetry: number;
      nonDailyPreloadMs: number;
      nonDailyRoleLoopMs: number;
      nonDailyDayLoopMs: number;
      nonDailyExistingInstanceScanMs: number;
      nonDailyCandidateBuildMs: number;
      nonDailyPrepareWindowsForDayMs: number;
      nonDailyGetDayInstancesMs: number;
      nonDailySunlightResolveMs: number;
      nonDailyFetchCompatibleWindowsOuterMs: number;
      nonDailyCompatibilityCacheHit: number;
      nonDailyCompatibilityCacheMiss: number;
      nonDailyCompatibilityCacheSet: number;
      nonDailyCompatibilityCacheBypass: number;
      nonDailyCompatibilityCacheBypassDebug: number;
      nonDailyCompatibilityCacheBypassTiming: number;
      nonDailyCompatibilityCacheBypassParity: number;
      nonDailyCompatibilityCacheEnabled: number;
      nonDailyCompatibilityCacheDisabled: number;
      nonDailySunlightCacheHit: number;
      nonDailySunlightCacheMiss: number;
      nonDailySunlightCacheSet: number;
      nonDailyAllDaySunlightSkipCount: number;
      nonDailyCandidateBuildOtherMs: number;
      nonDailyPlaceRoleMs: number;
      nonDailyPlaceItemInWindowsMs: number;
      nonDailyPersistMs: number;
      nonDailyMetadataUpdateMs: number;
      nonDailyPruneCancelMs: number;
      nonDailyOverrideClearMs: number;
      nonDailySortDedupeMs: number;
      nonDailySkippedRoleCount: number;
      nonDailyPlacedRoleCount: number;
      nonDailyFailedRoleCount: number;
    };
    habitAsyncReadSources: Record<
      string,
      {
        count: number;
        ms: number;
      }
    >;
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
      habitPlacementInstrumentation: {
        noFitCacheHit: 0,
        noFitCacheMiss: 0,
        noFitCacheSet: 0,
        noFitCacheBypass: 0,
        placeCallsInitialDaily: 0,
        placeCallsPostProject: 0,
        placeCallsCleanup: 0,
        placeCallsNonDaily: 0,
        placeCallsFinalSyncRetry: 0,
        placeNoFitInitialDaily: 0,
        placeNoFitPostProject: 0,
        placeNoFitCleanup: 0,
        placeNoFitNonDaily: 0,
        placeNoFitFinalSyncRetry: 0,
        compatibleWindowCallsInitialDaily: 0,
        compatibleWindowCallsPostProject: 0,
        compatibleWindowCallsCleanup: 0,
        compatibleWindowCallsNonDaily: 0,
        compatibleWindowCallsFinalSyncRetry: 0,
        compatibleWindowMsInitialDaily: 0,
        compatibleWindowMsPostProject: 0,
        compatibleWindowMsCleanup: 0,
        compatibleWindowMsNonDaily: 0,
        compatibleWindowMsFinalSyncRetry: 0,
        candidateWindowsConsideredInitialDaily: 0,
        candidateWindowsConsideredPostProject: 0,
        candidateWindowsConsideredCleanup: 0,
        candidateWindowsConsideredNonDaily: 0,
        candidateWindowsConsideredFinalSyncRetry: 0,
        daysConsideredInitialDaily: 0,
        daysConsideredPostProject: 0,
        daysConsideredCleanup: 0,
        daysConsideredNonDaily: 0,
        daysConsideredFinalSyncRetry: 0,
        eligibilitySkipsInitialDaily: 0,
        eligibilitySkipsPostProject: 0,
        eligibilitySkipsCleanup: 0,
        eligibilitySkipsNonDaily: 0,
        eligibilitySkipsFinalSyncRetry: 0,
        existingInstanceChecksInitialDaily: 0,
        existingInstanceChecksPostProject: 0,
        existingInstanceChecksCleanup: 0,
        existingInstanceChecksNonDaily: 0,
        existingInstanceChecksFinalSyncRetry: 0,
        asyncReadsInitialDaily: 0,
        asyncReadsPostProject: 0,
        asyncReadsCleanup: 0,
        asyncReadsNonDaily: 0,
        asyncReadsFinalSyncRetry: 0,
        asyncReadMsInitialDaily: 0,
        asyncReadMsPostProject: 0,
        asyncReadMsCleanup: 0,
        asyncReadMsNonDaily: 0,
        asyncReadMsFinalSyncRetry: 0,
        reservationChecksInitialDaily: 0,
        reservationChecksPostProject: 0,
        reservationChecksCleanup: 0,
        reservationChecksNonDaily: 0,
        reservationChecksFinalSyncRetry: 0,
        practiceHistoryChecksInitialDaily: 0,
        practiceHistoryChecksPostProject: 0,
        practiceHistoryChecksCleanup: 0,
        practiceHistoryChecksNonDaily: 0,
        practiceHistoryChecksFinalSyncRetry: 0,
        sortDedupeMsInitialDaily: 0,
        sortDedupeMsPostProject: 0,
        sortDedupeMsCleanup: 0,
        sortDedupeMsNonDaily: 0,
        sortDedupeMsFinalSyncRetry: 0,
        dueEvaluationMsInitialDaily: 0,
        dueEvaluationMsPostProject: 0,
        dueEvaluationMsCleanup: 0,
        dueEvaluationMsNonDaily: 0,
        dueEvaluationMsFinalSyncRetry: 0,
        prePlacementMsInitialDaily: 0,
        prePlacementMsPostProject: 0,
        prePlacementMsCleanup: 0,
        prePlacementMsNonDaily: 0,
        prePlacementMsFinalSyncRetry: 0,
        nonDailyPreloadMs: 0,
        nonDailyRoleLoopMs: 0,
        nonDailyDayLoopMs: 0,
        nonDailyExistingInstanceScanMs: 0,
        nonDailyCandidateBuildMs: 0,
        nonDailyPrepareWindowsForDayMs: 0,
        nonDailyGetDayInstancesMs: 0,
        nonDailySunlightResolveMs: 0,
        nonDailyFetchCompatibleWindowsOuterMs: 0,
        nonDailyCompatibilityCacheHit: 0,
        nonDailyCompatibilityCacheMiss: 0,
        nonDailyCompatibilityCacheSet: 0,
        nonDailyCompatibilityCacheBypass: 0,
        nonDailyCompatibilityCacheBypassDebug: 0,
        nonDailyCompatibilityCacheBypassTiming: 0,
        nonDailyCompatibilityCacheBypassParity: 0,
        nonDailyCompatibilityCacheEnabled: 0,
        nonDailyCompatibilityCacheDisabled: 0,
        nonDailySunlightCacheHit: 0,
        nonDailySunlightCacheMiss: 0,
        nonDailySunlightCacheSet: 0,
        nonDailyAllDaySunlightSkipCount: 0,
        nonDailyCandidateBuildOtherMs: 0,
        nonDailyPlaceRoleMs: 0,
        nonDailyPlaceItemInWindowsMs: 0,
        nonDailyPersistMs: 0,
        nonDailyMetadataUpdateMs: 0,
        nonDailyPruneCancelMs: 0,
        nonDailyOverrideClearMs: 0,
        nonDailySortDedupeMs: 0,
        nonDailySkippedRoleCount: 0,
        nonDailyPlacedRoleCount: 0,
        nonDailyFailedRoleCount: 0,
      },
      habitAsyncReadSources: {},
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
  addCounter("markedAffected", timing.runner.markMissed.affected);
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
  addCounter("syncFallbackCount", timing.schedule.syncPairings.fallbackLookups);
  addCounter("syncFallbackTotalMs", timing.schedule.syncPairings.fallbackLookupMs);
  addCounter(
    "syncFallbackPartnerCount",
    timing.schedule.syncPairings.fallbackPartners
  );
  addCounter("syncPairingUpserted", timing.schedule.syncPairings.persistedRows);
  addCounter("projectQueued", timing.schedule.projectPass.queued);
  addCounter("projectPlaced", timing.schedule.projectPass.placed);
  addCounter("projectFailed", timing.schedule.projectPass.failed);
  addCounter("placeCalls", timing.schedule.placeItem.calls);
  addCounter("placeSuccess", timing.schedule.placeItem.success);
  addCounter("placeNoFit", timing.schedule.placeItem.noFit);
  addCounter(
    "habitNoFitCacheHit",
    timing.schedule.habitPlacementInstrumentation.noFitCacheHit
  );
  addCounter(
    "habitNoFitCacheMiss",
    timing.schedule.habitPlacementInstrumentation.noFitCacheMiss
  );
  addCounter(
    "habitNoFitCacheSet",
    timing.schedule.habitPlacementInstrumentation.noFitCacheSet
  );
  addCounter(
    "habitNoFitCacheBypass",
    timing.schedule.habitPlacementInstrumentation.noFitCacheBypass
  );
  addCounter(
    "habitPlaceCallsInitialDaily",
    timing.schedule.habitPlacementInstrumentation.placeCallsInitialDaily
  );
  addCounter(
    "habitPlaceCallsPostProject",
    timing.schedule.habitPlacementInstrumentation.placeCallsPostProject
  );
  addCounter(
    "habitPlaceCallsCleanup",
    timing.schedule.habitPlacementInstrumentation.placeCallsCleanup
  );
  addCounter(
    "habitPlaceCallsNonDaily",
    timing.schedule.habitPlacementInstrumentation.placeCallsNonDaily
  );
  addCounter(
    "habitPlaceCallsFinalSyncRetry",
    timing.schedule.habitPlacementInstrumentation.placeCallsFinalSyncRetry
  );
  addCounter(
    "habitPlaceNoFitInitialDaily",
    timing.schedule.habitPlacementInstrumentation.placeNoFitInitialDaily
  );
  addCounter(
    "habitPlaceNoFitPostProject",
    timing.schedule.habitPlacementInstrumentation.placeNoFitPostProject
  );
  addCounter(
    "habitPlaceNoFitCleanup",
    timing.schedule.habitPlacementInstrumentation.placeNoFitCleanup
  );
  addCounter(
    "habitPlaceNoFitNonDaily",
    timing.schedule.habitPlacementInstrumentation.placeNoFitNonDaily
  );
  addCounter(
    "habitPlaceNoFitFinalSyncRetry",
    timing.schedule.habitPlacementInstrumentation.placeNoFitFinalSyncRetry
  );
  const habitInstrumentation = timing.schedule.habitPlacementInstrumentation;
  const habitPassMetricGroups = [
    ["habitCompatibleWindowCalls", "compatibleWindowCalls"],
    ["habitCompatibleWindowMs", "compatibleWindowMs"],
    ["habitCandidateWindowsConsidered", "candidateWindowsConsidered"],
    ["habitDaysConsidered", "daysConsidered"],
    ["habitEligibilitySkips", "eligibilitySkips"],
    ["habitExistingInstanceChecks", "existingInstanceChecks"],
    ["habitAsyncReads", "asyncReads"],
    ["habitAsyncReadMs", "asyncReadMs"],
    ["habitReservationChecks", "reservationChecks"],
    ["habitPracticeHistoryChecks", "practiceHistoryChecks"],
    ["habitSortDedupeMs", "sortDedupeMs"],
    ["habitDueEvaluationMs", "dueEvaluationMs"],
    ["habitPrePlacementMs", "prePlacementMs"],
  ] as const;
  const habitPassSuffixes = [
    "InitialDaily",
    "PostProject",
    "Cleanup",
    "NonDaily",
    "FinalSyncRetry",
  ] as const;
  for (const [summaryPrefix, fieldPrefix] of habitPassMetricGroups) {
    for (const suffix of habitPassSuffixes) {
      const field =
        `${fieldPrefix}${suffix}` as keyof typeof habitInstrumentation;
      addCounter(
        `${summaryPrefix}${suffix}`,
        habitInstrumentation[field]
      );
    }
  }
  const nonDailyMetricNames = [
    "nonDailyPreloadMs",
    "nonDailyRoleLoopMs",
    "nonDailyDayLoopMs",
    "nonDailyExistingInstanceScanMs",
    "nonDailyCandidateBuildMs",
    "nonDailyPrepareWindowsForDayMs",
    "nonDailyGetDayInstancesMs",
    "nonDailySunlightResolveMs",
    "nonDailyFetchCompatibleWindowsOuterMs",
    "nonDailyCompatibilityCacheHit",
    "nonDailyCompatibilityCacheMiss",
    "nonDailyCompatibilityCacheSet",
    "nonDailyCompatibilityCacheBypass",
    "nonDailyCompatibilityCacheBypassDebug",
    "nonDailyCompatibilityCacheBypassTiming",
    "nonDailyCompatibilityCacheBypassParity",
    "nonDailyCompatibilityCacheEnabled",
    "nonDailyCompatibilityCacheDisabled",
    "nonDailySunlightCacheHit",
    "nonDailySunlightCacheMiss",
    "nonDailySunlightCacheSet",
    "nonDailyAllDaySunlightSkipCount",
    "nonDailyCandidateBuildOtherMs",
    "nonDailyPlaceRoleMs",
    "nonDailyPlaceItemInWindowsMs",
    "nonDailyPersistMs",
    "nonDailyMetadataUpdateMs",
    "nonDailyPruneCancelMs",
    "nonDailyOverrideClearMs",
    "nonDailySortDedupeMs",
    "nonDailySkippedRoleCount",
    "nonDailyPlacedRoleCount",
    "nonDailyFailedRoleCount",
  ] as const;
  for (const metricName of nonDailyMetricNames) {
    addCounter(metricName, habitInstrumentation[metricName]);
  }
  for (const [sourcePassKey, sourceTiming] of Object.entries(
    timing.schedule.habitAsyncReadSources
  )) {
    const passSuffix =
      habitPassSuffixes.find((suffix) => sourcePassKey.endsWith(suffix)) ??
      "";
    const sourceKey = passSuffix
      ? sourcePassKey.slice(0, -passSuffix.length)
      : sourcePassKey;
    addCounter(
      `habitAsyncRead${sourceKey}Count${passSuffix}`,
      sourceTiming.count
    );
    addCounter(`habitAsyncRead${sourceKey}Ms${passSuffix}`, sourceTiming.ms);
  }
  addCounter("created", timing.schedule.dbWrites.inserts);
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
