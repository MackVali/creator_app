import { safeDate } from "@/lib/scheduler/safeDate";

export type OverlapFilterInstance = {
  id: string;
  source_type: string | null;
  source_id?: string | null;
  start_utc: string;
  end_utc?: string | null;
  duration_min?: number | null;
  status?: string | null;
  locked?: boolean | null;
  weight_snapshot?: number | null;
};

type ParsedInstance = {
  instance: OverlapFilterInstance;
  startMs: number;
  endMs: number;
  isHabit: boolean;
  isProject: boolean;
  locked: boolean;
  weight: number;
};

const parseInstance = (
  instance: OverlapFilterInstance
): ParsedInstance | null => {
  const startDate = safeDate(instance.start_utc);
  if (!startDate) return null;
  const startMs = startDate.getTime();
  if (!Number.isFinite(startMs)) return null;
  let endMs = safeDate(instance.end_utc ?? null)?.getTime() ?? Number.NaN;
  if (!Number.isFinite(endMs)) {
    const durationMs =
      typeof instance.duration_min === "number" &&
      Number.isFinite(instance.duration_min)
        ? instance.duration_min * 60000
        : Number.NaN;
    if (!Number.isFinite(durationMs)) return null;
    endMs = startMs + durationMs;
  }
  if (!Number.isFinite(endMs) || endMs <= startMs) return null;
  const isHabit = instance.source_type === "HABIT";
  const isProject = instance.source_type === "PROJECT";
  const weight =
    typeof instance.weight_snapshot === "number" &&
    Number.isFinite(instance.weight_snapshot)
      ? instance.weight_snapshot
      : 0;
  return {
    instance,
    startMs,
    endMs,
    isHabit,
    isProject,
    locked: instance.locked === true,
    weight,
  };
};

const comparePriority = (a: ParsedInstance, b: ParsedInstance) => {
  if (a.startMs !== b.startMs) return a.startMs - b.startMs;
  if (a.locked !== b.locked) return a.locked ? -1 : 1;
  if (a.isHabit !== b.isHabit) return a.isHabit ? -1 : 1;
  if (a.weight !== b.weight) return b.weight - a.weight;
  return (a.instance.id ?? "").localeCompare(b.instance.id ?? "");
};

export const filterIllegalOverlapsForRender = (
  instances: OverlapFilterInstance[]
) => {
  const parsed = instances
    .map((instance) => parseInstance(instance))
    .filter((value): value is ParsedInstance => value !== null)
    .sort(comparePriority);

  const kept: OverlapFilterInstance[] = [];
  const droppedIds: string[] = [];
  let lastKept: ParsedInstance | null = null;

  for (const current of parsed) {
    if (!lastKept) {
      kept.push(current.instance);
      lastKept = current;
      continue;
    }
    const overlaps =
      current.startMs < lastKept.endMs &&
      current.endMs > lastKept.startMs;
    if (overlaps) {
      droppedIds.push(current.instance.id);
      continue;
    }
    kept.push(current.instance);
    lastKept = current;
  }

  return { kept, droppedIds };
};
