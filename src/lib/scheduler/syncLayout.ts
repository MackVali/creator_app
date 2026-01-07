import type { HabitScheduleItem } from "@/lib/scheduler/habits";

export type TimelineCardLayoutMode = "full" | "paired-left" | "paired-right";

export const DEFAULT_SYNC_MIN_DURATION_MS = 30 * 60 * 1000;

type HabitPlacementLike = {
  habitType?: HabitScheduleItem["habitType"] | null;
  instanceId?: string | null;
  start: Date;
  end: Date;
};

type ProjectInstanceLike = {
  instanceId?: string | null;
  instance?: { id?: string | null } | null;
  start: Date;
  end: Date;
};

type Candidate = {
  kind: "habit" | "project";
  index: number;
  instanceId?: string | null;
  startMs: number;
  endMs: number;
};

type ScoredCandidate = Candidate & {
  overlapStart: number;
  overlapDuration: number;
  startGap: number;
};

type SyncAlignment = { startMs: number; endMs: number };

type OverlapSegment = {
  start: number;
  end: number;
  candidateId: string;
};

export type SyncPairingsByInstanceId = Record<string, string[]>;

export function computeSyncHabitDuration({
  syncWindow,
  minDurationMs,
  candidates,
}: {
  syncWindow: { start: Date; end: Date };
  minDurationMs: number;
  candidates: Array<{ start: Date; end: Date; id: string }>;
}): {
  finalStart: Date | null;
  finalEnd: Date | null;
  pairedInstances: string[];
} {
  const syncStartMs = syncWindow.start.getTime();
  const syncEndMs = syncWindow.end.getTime();

  if (
    !Number.isFinite(syncStartMs) ||
    !Number.isFinite(syncEndMs) ||
    syncEndMs <= syncStartMs
  ) {
    return { finalStart: null, finalEnd: null, pairedInstances: [] };
  }

  // Compute overlap segments
  const segments: OverlapSegment[] = candidates
    .map((candidate) => {
      const overlapStart = Math.max(syncStartMs, candidate.start.getTime());
      const overlapEnd = Math.min(syncEndMs, candidate.end.getTime());
      if (overlapEnd <= overlapStart) return null;
      return {
        start: overlapStart,
        end: overlapEnd,
        candidateId: candidate.id,
      };
    })
    .filter((segment): segment is OverlapSegment => segment !== null);

  // Sort by overlap start
  segments.sort((a, b) => a.start - b.start);

  // Accumulate contiguous coverage
  let currentStart: number | null = null;
  let currentEnd: number | null = null;
  let pairedInstances: string[] = [];

  for (const segment of segments) {
    if (currentEnd === null || segment.start <= currentEnd) {
      // Contiguous: extend current span
      if (currentStart === null) {
        currentStart = segment.start;
      }
      currentEnd = Math.max(currentEnd ?? 0, segment.end);
      pairedInstances.push(segment.candidateId);

      // Check if we've met minimum duration
      if (currentEnd - currentStart >= minDurationMs) {
        break;
      }
    } else {
      // Gap: reset accumulation
      currentStart = segment.start;
      currentEnd = segment.end;
      pairedInstances = [segment.candidateId];
    }
  }

  // Check final accumulation
  if (
    currentStart !== null &&
    currentEnd !== null &&
    currentEnd - currentStart >= minDurationMs
  ) {
    return {
      finalStart: new Date(currentStart),
      finalEnd: new Date(currentEnd),
      pairedInstances,
    };
  }

  // No contiguous window reaches minDuration
  return { finalStart: null, finalEnd: null, pairedInstances: [] };
}

export function computeTimelineLayoutForSyncHabits({
  habitPlacements,
  projectInstances,
  syncPairingsByInstanceId,
}: {
  habitPlacements: HabitPlacementLike[];
  projectInstances: ProjectInstanceLike[];
  syncPairingsByInstanceId?: SyncPairingsByInstanceId | null;
}) {
  const habitLayouts = habitPlacements.map<TimelineCardLayoutMode>(
    () => "full"
  );
  const projectLayouts = projectInstances.map<TimelineCardLayoutMode>(
    () => "full"
  );
  const syncHabitAlignment = new Map<number, SyncAlignment>();
  const pairingLookup = syncPairingsByInstanceId ?? null;

  const candidates: Candidate[] = [];

  habitPlacements.forEach((placement, index) => {
    const startMs = placement.start.getTime();
    const endMs = placement.end.getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
    candidates.push({
      kind: "habit",
      index,
      instanceId: placement.instanceId ?? null,
      startMs,
      endMs,
    });
  });

  projectInstances.forEach((instance, index) => {
    const startMs = instance.start.getTime();
    const endMs = instance.end.getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
    candidates.push({
      kind: "project",
      index,
      instanceId: instance.instanceId ?? instance.instance?.id ?? null,
      startMs,
      endMs,
    });
  });

  const sortedCandidates = candidates.sort((a, b) => {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs;
    return a.endMs - b.endMs;
  });

  const usedCandidates = new Set<string>();

  const syncHabits = habitPlacements
    .map((placement, index) => ({ placement, index }))
    .filter(({ placement }) => {
      const habitType = (placement.habitType ?? "HABIT").toUpperCase();
      return habitType === "SYNC";
    })
    .map(({ placement, index }) => ({
      index,
      instanceId: placement.instanceId ?? null,
      startMs: placement.start.getTime(),
      endMs: placement.end.getTime(),
    }))
    .filter(
      ({ startMs, endMs }) => Number.isFinite(startMs) && Number.isFinite(endMs)
    )
    .sort((a, b) => {
      if (a.startMs !== b.startMs) return a.startMs - b.startMs;
      return a.endMs - b.endMs;
    });

  syncHabits.forEach((syncHabit) => {
    const { index: habitIndex, startMs, endMs, instanceId } = syncHabit;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
    if (habitLayouts[habitIndex] !== "full") return;
    const pairingIds = instanceId ? pairingLookup?.[instanceId] : null;
    const pairingSet =
      pairingIds && pairingIds.length > 0 ? new Set(pairingIds) : null;
    // If we have no pairing entry for this instance, fall back to overlap-based pairing
    // instead of bailing. Only restrict to explicit pairings when we actually have them.

    const overlapping: ScoredCandidate[] = [];

    for (const candidate of sortedCandidates) {
      const candidateKey = `${candidate.kind}:${candidate.index}`;
      if (candidate.kind === "habit" && candidate.index === habitIndex)
        continue;
      if (candidate.kind === "habit") {
        const candidatePlacement = habitPlacements[candidate.index];
        const candidateType = (
          candidatePlacement?.habitType ?? "HABIT"
        ).toUpperCase();
        if (candidateType === "SYNC") {
          continue;
        }
      }
      if (candidate.endMs <= startMs) continue;
      if (candidate.startMs >= endMs) break;
      if (usedCandidates.has(candidateKey)) continue;
      const overlapStart = Math.max(startMs, candidate.startMs);
      const overlapEnd = Math.min(endMs, candidate.endMs);
      if (overlapEnd <= overlapStart) continue;
      overlapping.push({
        ...candidate,
        overlapStart,
        overlapDuration: overlapEnd - overlapStart,
        startGap: Math.abs(candidate.startMs - startMs),
      });
    }

    if (overlapping.length === 0) return;

    // Prefer explicit pairings when present; otherwise use any overlap
    const explicitMatches =
      pairingSet && pairingSet.size > 0
        ? overlapping.filter(
            (candidate) =>
              candidate.instanceId && pairingSet.has(candidate.instanceId)
          )
        : [];
    const targetCandidates =
      explicitMatches.length > 0 ? explicitMatches : overlapping;

    targetCandidates.sort((a, b) => {
      if (a.overlapStart !== b.overlapStart)
        return a.overlapStart - b.overlapStart;
      if (a.startGap !== b.startGap) return a.startGap - b.startGap;
      if (a.startMs !== b.startMs) return a.startMs - b.startMs;
      if (a.overlapDuration !== b.overlapDuration) {
        return b.overlapDuration - a.overlapDuration;
      }
      return a.endMs - b.endMs;
    });

    const winners =
      explicitMatches.length > 0 && targetCandidates.length > 1
        ? targetCandidates // pair with all explicit partners that overlap
        : [targetCandidates[0]]; // fall back to best overlap

    habitLayouts[habitIndex] = "paired-right";
    syncHabitAlignment.set(habitIndex, {
      startMs: winners[0].startMs,
      endMs: winners[0].endMs,
    });

    for (const winner of winners) {
      const winnerKey = `${winner.kind}:${winner.index}`;
      usedCandidates.add(winnerKey);
      if (winner.kind === "habit") {
        habitLayouts[winner.index] = "paired-left";
      } else {
        projectLayouts[winner.index] = "paired-left";
      }
    }
  });

  return { habitLayouts, projectLayouts, syncHabitAlignment };
}
