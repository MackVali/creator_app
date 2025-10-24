import { ENERGY } from './config';
export function addMin(date, n) {
    return new Date(date.getTime() + n * 60000);
}
function parseTime(date, time) {
    const [h = 0, m = 0] = time.split(":").map(Number);
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d;
}
export function genSlotsForWindow(win, date, slotMinutes = 5) {
    const base = win.fromPrevDay
        ? addMin(date, -24 * 60)
        : date;
    const start = parseTime(base, win.start_local);
    let end = parseTime(win.fromPrevDay ? date : base, win.end_local);
    if (end <= start)
        end = addMin(end, 24 * 60);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = addMin(dayStart, 24 * 60);
    let cursor = start < dayStart ? new Date(dayStart) : new Date(start);
    const slots = [];
    while (true) {
        const next = addMin(cursor, slotMinutes);
        if (next > end || next > dayEnd)
            break;
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
function findFirstFit(slots, durationMin) {
    for (let i = 0; i < slots.length; i++) {
        if (slots[i].freeMin <= 0)
            continue;
        let remaining = durationMin;
        for (let j = i; j < slots.length && remaining > 0; j++) {
            if (slots[j].freeMin <= 0)
                break;
            remaining -= slots[j].freeMin;
        }
        if (remaining <= 0)
            return i;
    }
    return null;
}
function consume(slots, startIndex, durationMin) {
    let remaining = durationMin;
    for (let i = startIndex; i < slots.length && remaining > 0; i++) {
        const slot = slots[i];
        const take = Math.min(slot.freeMin, remaining);
        slot.freeMin -= take;
        remaining -= take;
    }
}
export function placeByEnergyWeight(tasks, windows, date) {
    const startTime = (w) => parseTime(w.fromPrevDay ? addMin(date, -24 * 60) : date, w.start_local).getTime();
    const windowsSorted = [...windows].sort((a, b) => {
        const aStart = startTime(a);
        const bStart = startTime(b);
        if (aStart !== bStart)
            return aStart - bStart;
        return a.id.localeCompare(b.id);
    });
    const slotsByWindow = {};
    for (const w of windowsSorted) {
        slotsByWindow[w.id] = genSlotsForWindow(w, date);
    }
    const placements = [];
    const unplaced = [];
    const energyIdx = (e) => ENERGY.LIST.indexOf((e ?? "").toUpperCase());
    const sortedTasks = [...tasks].sort((a, b) => {
        const energyDiff = energyIdx(b.energy) - energyIdx(a.energy);
        if (energyDiff !== 0)
            return energyDiff;
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
            if (eDiff !== 0)
                return eDiff;
            const aStart = startTime(a);
            const bStart = startTime(b);
            if (aStart !== bStart)
                return aStart - bStart;
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
            if (idx === null)
                continue;
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
