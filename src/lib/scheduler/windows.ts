import { getSupabaseBrowser } from "../../../lib/supabase";
import type { Database } from "../../../types/supabase";

export type WindowRow = Database["public"]["Tables"]["windows"]["Row"];

export async function getWindowsForDate(date: Date, userId: string) {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Supabase client not available");
  const weekday = date.getDay();
  const prevWeekday = (weekday + 6) % 7;
  const { data: today, error: err1 } = await supabase
    .from("windows")
    .select("id,label,days,start_local,end_local,energy")
    .eq("user_id", userId)
    .contains("days", [weekday]);
  const { data: prev, error: err2 } = await supabase
    .from("windows")
    .select("id,label,days,start_local,end_local,energy")
    .eq("user_id", userId)
    .contains("days", [prevWeekday]);
  if (err1 || err2) throw err1 ?? err2;

  const crosses = (w: Pick<WindowRow, "start_local" | "end_local">) => {
    const [sh = 0, sm = 0] = (w.start_local || "0:0").split(":").map(Number);
    const [eh = 0, em = 0] = (w.end_local || "0:0").split(":").map(Number);
    return eh < sh || (eh === sh && em < sm);
  };

  const timeToMinutes = (value?: string | null): number => {
    const [h = 0, m = 0] = String(value ?? "0:0").split(":").map(Number);
    const safeH = Number.isFinite(h) ? h : 0;
    const safeM = Number.isFinite(m) ? m : 0;
    return safeH * 60 + safeM;
  };

  const overlapsPrevCross = (
    base: Pick<WindowRow, "start_local" | "end_local">,
    prevWindow: Pick<WindowRow, "start_local" | "end_local">
  ) => {
    const prevEnd = timeToMinutes(prevWindow.end_local);
    if (prevEnd <= 0) return false;
    const baseStart = timeToMinutes(base.start_local);
    let baseEnd = timeToMinutes(base.end_local);
    if (baseEnd <= baseStart) {
      baseEnd = 24 * 60;
    }
    return baseStart < prevEnd && baseEnd > 0;
  };

  const todayWindows = today ?? [];
  const prevCross = (prev ?? [])
    .filter(crosses)
    .map((w) => ({ ...w, fromPrevDay: true }))
    .filter(
      (prevWindow) =>
        !todayWindows.some((baseWindow) =>
          overlapsPrevCross(baseWindow, prevWindow)
        )
    );
  return [...todayWindows, ...prevCross] as (
    WindowRow & { fromPrevDay?: boolean }
  )[];
}

export interface Slot {
  windowId: string;
  start: Date;
  end: Date;
  index: number;
}

export function genSlots(
  date: Date,
  windows: (WindowRow & { fromPrevDay?: boolean })[]
): Slot[] {
  const slots: Slot[] = [];
  const slotMinutes = 5;
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60000);
  for (const w of windows) {
    const [sh, sm] = (w.start_local || "0:0").split(":").map(Number);
    const [eh, em] = (w.end_local || "0:0").split(":").map(Number);
    const startBase = w.fromPrevDay
      ? new Date(dayStart.getTime() - 24 * 60 * 60000)
      : dayStart;
    const windowStart = new Date(startBase);
    windowStart.setHours(sh, sm, 0, 0);
    const windowEndBase = w.fromPrevDay ? dayStart : startBase;
    let windowEnd = new Date(windowEndBase);
    windowEnd.setHours(eh, em, 0, 0);
    if (windowEnd <= windowStart) {
      windowEnd = new Date(windowEnd.getTime() + 24 * 60 * 60000);
    }
    let cursor = windowStart < dayStart ? new Date(dayStart) : new Date(windowStart);
    let index = 0;
    while (true) {
      const end = new Date(cursor.getTime() + slotMinutes * 60000);
      if (end > windowEnd || end > dayEnd) break;
      slots.push({
        windowId: w.id,
        start: new Date(cursor),
        end,
        index,
      });
      cursor = end;
      index++;
    }
  }
  return slots;
}
