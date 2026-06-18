export type SchedulerTiming = {
  tag: "SCHEDULER_TIMING";
  runId: string;
  route: {
    totalMs: number;
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
    habitPasses: { totalMs: number };
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
    route: {
      totalMs: 0,
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
      habitPasses: { totalMs: 0 },
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

export function addSchedulerTimingMs(
  target: { ms?: number; totalMs?: number },
  key: "ms" | "totalMs",
  ms: number
) {
  target[key] = Math.round(((target[key] ?? 0) + ms) * 100) / 100;
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
