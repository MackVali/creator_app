import type { PlacementFailureWindowDiagnostic } from "./placement";

export type PlacementReasonCode =
  | "DAY_TYPE_INCOMPATIBLE"
  | "ITEM_TYPE_NOT_ALLOWED"
  | "SKILL_NOT_ALLOWED"
  | "MONUMENT_NOT_ALLOWED"
  | "LOCATION_MISMATCH"
  | "ENERGY_MISMATCH"
  | "COLLISION"
  | "INSUFFICIENT_TIME"
  | "NOW_CONSTRAINT"
  | "EARLY_EXIT_NOT_ATTEMPTED"
  | "UNKNOWN";

export type PlacementReasonExample = {
  blockId: string | null;
  details: string | null;
};

export type PlacementTraceItem = {
  itemId: string;
  type: "PROJECT";
  wasConsidered: boolean;
  placed: boolean;
  placedAt?: string | null;
  daysScanned: number;
  blocksScanned: number;
  candidatesGenerated: number;
  placementAttempts: number;
  attemptedCandidateCount: number;
  topReasons: Array<{
    code: PlacementReasonCode;
    count: number;
    examples: PlacementReasonExample[];
  }>;
  attemptedBlockCount: number;
  attemptedBlockIdsSample: string[];
  blockGateSamples: BlockGateSample[];
  closestCandidates: ClosestCandidateTrace[];
  noSlotDetails: NoSlotDetail[];
  passedGatesButNoSlot?: NoSlotDetail | null;
  windowDiagnostics: PlacementFailureWindowDiagnostic[];
};

export type GateStageResult = {
  name: string;
  passed: boolean;
  details?: string | null;
};

export type BlockGateSample = {
  blockId: string;
  dateIso: string;
  windowId?: string | null;
  dayTypeTimeBlockId?: string | null;
  timeBlockId?: string | null;
  energy?: string | null;
  locationContextId?: string | null;
  locationContextValue?: string | null;
  durationMin: number;
  freeSegmentMinutes?: number | null;
  collisionCount?: number | null;
  attempted: boolean;
  stageResults: GateStageResult[];
  firstFailGate?: string | null;
};

export type ClosestCandidateTrace = {
  blockId: string;
  dateIso: string;
  firstFailGate: string | null;
  energy?: string | null;
  locationContextId?: string | null;
  locationContextValue?: string | null;
  freeSegmentMinutes?: number | null;
  collisionCount?: number | null;
  requiredDurationMin: number;
  largestFreeSegmentMin: number;
};

export type NoSlotDetail = {
  blockId: string;
  dateIso: string;
  largestFreeSegmentMin: number;
  requiredDurationMin: number;
  firstCollision?: {
    itemId: string;
    type: "PROJECT" | "HABIT";
    start: string;
    end: string;
  };
};

export type BlockOccupancyEntry = {
  itemId: string;
  type: "PROJECT" | "HABIT";
  start: string;
  end: string;
  pass: "HABIT" | "PROJECT";
  orderIndex: number;
};

export type PlacementFilterWaterfall = {
  totalWindows: number;
  dayTypeIncompatible: number;
  itemTypeNotAllowed: number;
  skillNotAllowed: number;
  monumentNotAllowed: number;
  locationMismatch: number;
  energyMismatch: number;
};

export type PlacementTruthTrace = {
  runId: string;
  tz: string;
  baseDateIso: string;
  projectPass: {
    queuedCount: number;
    placedCount: number;
    unplacedCount: number;
    waterfall: PlacementFilterWaterfall;
    items: PlacementTraceItem[];
    occupancyLedger: Array<{
      blockId: string;
      entries: BlockOccupancyEntry[];
    }>;
  };
};

const ensureArray = <T>(value?: T[] | null): T[] =>
  Array.isArray(value) ? value : [];

const MAX_BLOCK_GATE_SAMPLES = 4;
const MAX_CLOSEST_CANDIDATES = 3;
const MAX_NO_SLOT_DETAILS = 3;
const MAX_ATTEMPTED_BLOCK_IDS = 3;

type PlacementReasonRecord = {
  count: number;
  examples: PlacementReasonExample[];
};

type PlacementTraceItemBuilder = {
  itemId: string;
  type: "PROJECT";
  wasConsidered: boolean;
  placed: boolean;
  placedAt?: string | null;
  daysScanned: number;
  blocksScanned: number;
  candidatesGenerated: number;
  placementAttempts: number;
  attemptedCandidateCount: number;
  reasonRecords: Map<PlacementReasonCode, PlacementReasonRecord>;
  recordedCandidates: Set<string>;
  attemptedBlockCount: number;
  attemptedBlockIdsSample: string[];
  blockGateSamplesById: Map<string, BlockGateSample>;
  blockGateSampleOrder: string[];
  closestCandidates: ClosestCandidateTrace[];
  noSlotDetails: NoSlotDetail[];
  passedGatesButNoSlot?: NoSlotDetail | null;
  windowDiagnostics: PlacementFailureWindowDiagnostic[];
};

export class SchedulerPlacementDebugCollector {
  private readonly builders = new Map<string, PlacementTraceItemBuilder>();
  private waterfall: PlacementFilterWaterfall = {
    totalWindows: 0,
    dayTypeIncompatible: 0,
    itemTypeNotAllowed: 0,
    skillNotAllowed: 0,
    monumentNotAllowed: 0,
    locationMismatch: 0,
    energyMismatch: 0,
  };
  private readonly occupancyLedger = new Map<string, BlockOccupancyEntry[]>();
  private readonly blockOrderCounters = new Map<string, number>();
  private queued = 0;
  private placed = 0;
  constructor(
    private readonly timeZone: string,
    private readonly baseDateIso: string,
    private readonly runId = Math.random().toString(36).slice(2)
  ) {}

  setQueuedCount(count: number) {
    this.queued = count;
  }

  incrementPlaced() {
    this.placed += 1;
  }

  recordProjectQueued(itemId: string) {
    this.ensureBuilder(itemId);
  }

  recordDayScan(projectId: string, data: {
    dayOffset: number;
    blocksConsidered: number;
    candidatesGenerated: number;
    filterCounters?: PlacementFilterWaterfall;
  }) {
    const builder = this.ensureBuilder(projectId);
    builder.daysScanned += 1;
    builder.blocksScanned += data.blocksConsidered;
    builder.candidatesGenerated += data.candidatesGenerated;
    builder.attemptedCandidateCount += data.candidatesGenerated;
    if (data.filterCounters) {
      this.accumulateWaterfall(data.filterCounters);
    }
    if (data.blocksConsidered > 0 || data.candidatesGenerated > 0) {
      builder.wasConsidered = true;
    }
  }

  recordPlacementAttempt(projectId: string) {
    const builder = this.ensureBuilder(projectId);
    builder.placementAttempts += 1;
    builder.wasConsidered = true;
  }

  recordBlockGateSample(projectId: string, sample: BlockGateSample) {
    const builder = this.ensureBuilder(projectId);
    const attemptedBlockIdsSample = builder.attemptedBlockIdsSample ??= [];
    const existing = builder.blockGateSamplesById.get(sample.blockId);
    const wasPreviouslyAttempted = existing?.attempted ?? false;
    if (sample.attempted && !wasPreviouslyAttempted) {
      builder.attemptedBlockCount += 1;
      if (
        attemptedBlockIdsSample.length < MAX_ATTEMPTED_BLOCK_IDS &&
        !attemptedBlockIdsSample.includes(sample.blockId)
      ) {
        attemptedBlockIdsSample.push(sample.blockId);
      }
    }
    const shouldReplace =
      !existing ||
      (sample.attempted && !existing.attempted) ||
      (sample.stageResults?.length ?? 0) >
        (existing.stageResults?.length ?? 0);
    if (shouldReplace) {
      builder.blockGateSamplesById.set(sample.blockId, sample);
    }
    const blockGateSampleOrder = builder.blockGateSampleOrder ??= [];
    if (!blockGateSampleOrder.includes(sample.blockId)) {
      blockGateSampleOrder.push(sample.blockId);
    }
    while (blockGateSampleOrder.length > MAX_BLOCK_GATE_SAMPLES) {
      const removed = blockGateSampleOrder.shift();
      if (removed) {
        builder.blockGateSamplesById.delete(removed);
      }
    }
  }

  recordClosestCandidate(
    projectId: string,
    candidate: ClosestCandidateTrace
  ) {
    const builder = this.ensureBuilder(projectId);
    const closestCandidates = builder.closestCandidates ??= [];
    const existingIndex = closestCandidates.findIndex(
      (entry) =>
        entry.blockId === candidate.blockId &&
        entry.dateIso === candidate.dateIso
    );
    if (existingIndex >= 0) {
      if (
        candidate.largestFreeSegmentMin >
        closestCandidates[existingIndex].largestFreeSegmentMin
      ) {
        closestCandidates[existingIndex] = candidate;
      }
    } else {
      closestCandidates.push(candidate);
    }
    closestCandidates.sort(
      (a, b) => b.largestFreeSegmentMin - a.largestFreeSegmentMin
    );
    if (closestCandidates.length > MAX_CLOSEST_CANDIDATES) {
      closestCandidates.length = MAX_CLOSEST_CANDIDATES;
    }
  }

  recordNoSlotDetail(projectId: string, detail: NoSlotDetail) {
    const builder = this.ensureBuilder(projectId);
    const noSlotDetails = builder.noSlotDetails ??= [];
    const existingIndex = noSlotDetails.findIndex(
      (entry) =>
        entry.blockId === detail.blockId && entry.dateIso === detail.dateIso
    );
    if (existingIndex >= 0) {
      if (
        detail.largestFreeSegmentMin >
        noSlotDetails[existingIndex].largestFreeSegmentMin
      ) {
        noSlotDetails[existingIndex] = detail;
      }
    } else {
      noSlotDetails.push(detail);
    }
    noSlotDetails.sort(
      (a, b) => b.largestFreeSegmentMin - a.largestFreeSegmentMin
    );
    if (noSlotDetails.length > MAX_NO_SLOT_DETAILS) {
      noSlotDetails.length = MAX_NO_SLOT_DETAILS;
    }
  }

  recordPassedGatesButNoSlot(projectId: string, detail: NoSlotDetail) {
    const builder = this.ensureBuilder(projectId);
    const current = builder.passedGatesButNoSlot;
    if (
      !current ||
      detail.largestFreeSegmentMin > current.largestFreeSegmentMin
    ) {
      builder.passedGatesButNoSlot = detail;
    }
  }

  recordBlockOccupancy(
    blockId: string,
    entry: Omit<BlockOccupancyEntry, "orderIndex">
  ) {
    let ledger = this.occupancyLedger.get(blockId);
    if (!ledger) {
      ledger = [];
      this.occupancyLedger.set(blockId, ledger);
    }
    const nextIndex = this.blockOrderCounters.get(blockId) ?? 0;
    this.blockOrderCounters.set(blockId, nextIndex + 1);
    const enrichedEntry: BlockOccupancyEntry = {
      ...entry,
      orderIndex: nextIndex,
    };
    ledger.push(enrichedEntry);
    this.occupancyLedger.set(blockId, ledger);
  }

  recordCandidateFailure(
    projectId: string,
    candidateKey: string,
    reason: PlacementReasonCode,
    example: PlacementReasonExample,
    count = 1
  ) {
    const builder = this.ensureBuilder(projectId);
    if (builder.recordedCandidates.has(candidateKey)) return;
    builder.recordedCandidates.add(candidateKey);
    builder.wasConsidered = true;
    const record = builder.reasonRecords.get(reason) ?? {
      count: 0,
      examples: [],
    };
    record.count += count;
    const examples = (record.examples ??= []);
    if (examples.length < 3) {
      examples.push(example);
    }
    builder.reasonRecords.set(reason, record);
  }

  recordEarlyExit(
    projectId: string,
    reason: PlacementReasonCode,
    detail: string | null = null
  ) {
    const builder = this.ensureBuilder(projectId);
    if (builder.attemptedCandidateCount === 0) {
      builder.wasConsidered = false;
    }
    const example: PlacementReasonExample = {
      blockId: null,
      details: detail,
    };
    this.recordCandidateFailure(projectId, `early-exit-${reason}`, reason, example);
  }

  recordPlacementSuccess(projectId: string, startUtc?: string | null) {
    const builder = this.ensureBuilder(projectId);
    builder.placed = true;
    builder.placedAt = startUtc ?? null;
    this.incrementPlaced();
  }

  buildTrace(): PlacementTruthTrace {
    const items = ensureArray(
      Array.from(this.builders.values()).map((builder) => ({
        itemId: builder.itemId,
        type: builder.type,
        wasConsidered: builder.wasConsidered,
        placed: builder.placed,
        placedAt: builder.placedAt ?? null,
        daysScanned: builder.daysScanned,
        blocksScanned: builder.blocksScanned,
        candidatesGenerated: builder.candidatesGenerated,
        placementAttempts: builder.placementAttempts,
        attemptedCandidateCount: builder.attemptedCandidateCount,
        topReasons: ensureArray(
          Array.from(builder.reasonRecords.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .map(([code, record]) => ({
              code,
              count: record.count,
              examples: ensureArray(record.examples),
            }))
        ),
        attemptedBlockCount: builder.attemptedBlockCount,
        attemptedBlockIdsSample: ensureArray(builder.attemptedBlockIdsSample),
        blockGateSamples: ensureArray(
          builder.blockGateSampleOrder
            .map((blockId) => builder.blockGateSamplesById.get(blockId))
            .filter((sample): sample is BlockGateSample => Boolean(sample))
        ).map((sample) => ({
          ...sample,
          stageResults: ensureArray(sample.stageResults),
        })),
        closestCandidates: ensureArray(builder.closestCandidates).map((entry) => ({
          ...entry,
        })),
        noSlotDetails: ensureArray(builder.noSlotDetails).map((entry) => ({
          ...entry,
        })),
        windowDiagnostics: ensureArray(builder.windowDiagnostics),
        passedGatesButNoSlot: builder.passedGatesButNoSlot ?? null,
      }))
    );

    return {
      runId: this.runId,
      tz: this.timeZone,
      baseDateIso: this.baseDateIso,
      projectPass: {
        queuedCount: this.queued,
        placedCount: this.placed,
        unplacedCount: Math.max(0, this.queued - this.placed),
        waterfall: { ...this.waterfall },
        items,
        occupancyLedger: ensureArray(
          Array.from(this.occupancyLedger.entries()).map(([blockId, entries]) => ({
            blockId,
            entries: ensureArray(entries).map((entry) => ({ ...entry })),
          }))
        ),
      },
    };
  }

  private ensureBuilder(projectId: string): PlacementTraceItemBuilder {
    let builder = this.builders.get(projectId);
    if (!builder) {
      builder = {
        itemId: projectId,
        type: "PROJECT",
        wasConsidered: false,
        placed: false,
        daysScanned: 0,
        blocksScanned: 0,
        candidatesGenerated: 0,
        placementAttempts: 0,
        attemptedCandidateCount: 0,
        reasonRecords: new Map(),
        recordedCandidates: new Set(),
        attemptedBlockCount: 0,
        attemptedBlockIdsSample: [],
        blockGateSamplesById: new Map(),
        blockGateSampleOrder: [],
        closestCandidates: [],
        noSlotDetails: [],
        passedGatesButNoSlot: null,
        windowDiagnostics: [],
      };
      this.builders.set(projectId, builder);
    }
    return builder;
  }

  private accumulateWaterfall(counters: PlacementFilterWaterfall) {
    this.waterfall.totalWindows += counters.totalWindows;
    this.waterfall.dayTypeIncompatible += counters.dayTypeIncompatible;
    this.waterfall.itemTypeNotAllowed += counters.itemTypeNotAllowed;
    this.waterfall.skillNotAllowed += counters.skillNotAllowed;
    this.waterfall.monumentNotAllowed += counters.monumentNotAllowed;
    this.waterfall.locationMismatch += counters.locationMismatch;
    this.waterfall.energyMismatch += counters.energyMismatch;
  }
}
