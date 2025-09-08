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

  const crosses = (w: WindowRow) => {
    const [sh = 0, sm = 0] = (w.start_local || "0:0").split(":").map(Number);
    const [eh = 0, em = 0] = (w.end_local || "0:0").split(":").map(Number);
    return eh < sh || (eh === sh && em < sm);
  };

  const prevCross = (prev ?? []).filter(crosses).map((w) => ({ ...w, fromPrevDay: true }));
  return ([...(today ?? []), ...prevCross] as (WindowRow & { fromPrevDay?: boolean })[]);
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

