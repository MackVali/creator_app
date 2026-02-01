import type { TaskLite } from "./weight";
import { ENERGY, type Energy } from "./config";
import {
  addDaysInTimeZone,
  normalizeTimeZone,
  setTimeInTimeZone,
  startOfDayInTimeZone,
} from "./timezone";

export type WindowLite = {
  id: string;
  label: string;
  energy: string;
  start_local: string;
  end_local: string;
  fromPrevDay?: boolean;
};

export type Slot = {
  windowId: string;
  start: Date;
  end: Date;
  freeMin: number;
};

export function addMin(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 60000);
}

function parseTime(date: Date, time: string, timeZone: string): Date {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return setTimeInTimeZone(date, timeZone, h, m);
}


export function genSlotsForWindow(
  win: WindowLite,
  date: Date,
  slotMinutes = 5,
  timeZone?: string
): Slot[] {
  const zone = normalizeTimeZone(timeZone);
  const dayStart = startOfDayInTimeZone(date, zone);
  const dayEnd = addDaysInTimeZone(dayStart, 1, zone);
  const prevDayStart = addDaysInTimeZone(dayStart, -1, zone);
  const base = win.fromPrevDay ? prevDayStart : dayStart;
  const start = parseTime(base, win.start_local, zone);
  const endBase = win.fromPrevDay ? dayStart : base;
  let end = parseTime(endBase, win.end_local, zone);
  if (end <= start) end = addMin(end, 24 * 60);

  let cursor = start < dayStart ? new Date(dayStart) : new Date(start);
  const slots: Slot[] = [];
  while (true) {
    const next = addMin(cursor, slotMinutes);
    if (next > end || next > dayEnd) break;
    slots.push({
      windowId: win.id,
      start: new Date(cursor),
      end: next,
      freeMin: slotMinutes,
    });
    cursor = next;
  }
  return slots;
}

function findFirstFit(slots: Slot[], durationMin: number): number | null {
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].freeMin <= 0) continue;
    let remaining = durationMin;
    for (let j = i; j < slots.length && remaining > 0; j++) {
      if (slots[j].freeMin <= 0) break;
      remaining -= slots[j].freeMin;
    }
    if (remaining <= 0) return i;
  }
  return null;
}

function consume(slots: Slot[], startIndex: number, durationMin: number) {
  let remaining = durationMin;
  for (let i = startIndex; i < slots.length && remaining > 0; i++) {
    const slot = slots[i];
    const take = Math.min(slot.freeMin, remaining);
    slot.freeMin -= take;
    remaining -= take;
  }
}

export type Schedulable = TaskLite & { weight: number };

export function placeByEnergyWeight(
  tasks: Schedulable[],
  windows: WindowLite[],
  date: Date,
  timeZone?: string
) {
  const zone = normalizeTimeZone(timeZone);
  const dayStart = startOfDayInTimeZone(date, zone);
  const prevDayStart = addDaysInTimeZone(dayStart, -1, zone);
  const startTime = (w: WindowLite) =>
    parseTime(
      w.fromPrevDay ? prevDayStart : dayStart,
      w.start_local,
      zone
    ).getTime();
  const windowsSorted = [...windows].sort((a, b) => {
    const aStart = startTime(a);
    const bStart = startTime(b);
    if (aStart !== bStart) return aStart - bStart;
    return a.id.localeCompare(b.id);
  });

  const slotsByWindow: Record<string, Slot[]> = {};
  for (const w of windowsSorted) {
    slotsByWindow[w.id] = genSlotsForWindow(w, date, undefined, zone);
  }

  const placements: {
    taskId: string;
    windowId: string;
    start: Date;
    end: Date;
    weight: number;
  }[] = [];
  const unplaced: { taskId: string; reason: string }[] = [];

  const energyIdx = (e?: string | null) =>
    ENERGY.LIST.indexOf((e ?? "").toUpperCase() as Energy);
  const sortedTasks = [...tasks].sort((a, b) => {
    const energyDiff = energyIdx(b.energy) - energyIdx(a.energy);
    if (energyDiff !== 0) return energyDiff;
    const weightDiff = b.weight - a.weight;
    return weightDiff !== 0 ? weightDiff : a.id.localeCompare(b.id);
  });

  for (const task of sortedTasks) {
    const taskEnergyIdx = energyIdx(task.energy);
    if (taskEnergyIdx === -1) {
      unplaced.push({ taskId: task.id, reason: "no-window" });
      continue;
    }
    const candidates = windowsSorted
      .filter((w) => energyIdx(w.energy) >= taskEnergyIdx)
      .sort((a, b) => {
        const eDiff = energyIdx(a.energy) - energyIdx(b.energy);
        if (eDiff !== 0) return eDiff;
        const aStart = startTime(a);
        const bStart = startTime(b);
        if (aStart !== bStart) return aStart - bStart;
        return a.id.localeCompare(b.id);
      });
    if (candidates.length === 0) {
      unplaced.push({ taskId: task.id, reason: "no-window" });
      continue;
    }
    let placed = false;
    for (const w of candidates) {
      const slots = slotsByWindow[w.id];
      const idx = findFirstFit(slots, task.duration_min);
      if (idx === null) continue;
      const start = new Date(slots[idx].start);
      const end = addMin(start, task.duration_min);
      consume(slots, idx, task.duration_min);
      placements.push({
        taskId: task.id,
        windowId: w.id,
        start,
        end,
        weight: task.weight,
      });
      placed = true;
      break;
    }
    if (!placed) {
      unplaced.push({ taskId: task.id, reason: "no-slot" });
    }
  }

  return { placements, unplaced };
}
