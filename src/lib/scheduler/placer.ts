import type { TaskLite } from "./weight";
import { ENERGY } from "./config";

export type WindowLite = {
  id: string;
  label: string;
  energy: string;
  start_local: string;
  end_local: string;
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

function parseTime(date: Date, time: string): Date {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

function energyIndex(level: string | null | undefined): number {
  const idx = (ENERGY.LIST as readonly string[]).indexOf(level ?? "");
  return idx === -1 ? ENERGY.LIST.length : idx;
}

export function genSlotsForWindow(
  win: WindowLite,
  date: Date,
  slotMinutes = 5
): Slot[] {
  const start = parseTime(date, win.start_local);
  const end = parseTime(date, win.end_local);
  const slots: Slot[] = [];
  let cursor = new Date(start);
  while (true) {
    const next = addMin(cursor, slotMinutes);
    if (next > end) break;
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
  date: Date
) {
  const windowsSorted = [...windows].sort((a, b) => {
    const aStart = parseTime(date, a.start_local).getTime();
    const bStart = parseTime(date, b.start_local).getTime();
    if (aStart !== bStart) return aStart - bStart;
    return a.id.localeCompare(b.id);
  });

  const slotsByWindow: Record<string, Slot[]> = {};
  for (const w of windowsSorted) {
    slotsByWindow[w.id] = genSlotsForWindow(w, date);
  }

  const placements: {
    taskId: string;
    windowId: string;
    start: Date;
    end: Date;
    weight: number;
  }[] = [];
  const unplaced: { taskId: string; reason: string }[] = [];

  const sortedTasks = [...tasks].sort((a, b) => {
    const diff = b.weight - a.weight;
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  for (const task of sortedTasks) {
    const candidates = windowsSorted.filter(
      (w) => energyIndex(task.energy) <= energyIndex(w.energy)
    );
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

