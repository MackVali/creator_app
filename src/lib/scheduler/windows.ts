import { getSupabaseBrowser } from "../../../lib/supabase";
import type { Database } from "../../../types/supabase";

export type WindowRow = Database["public"]["Tables"]["windows"]["Row"];

export async function getWindowsForDate(date: Date, userId: string) {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Supabase client not available");
  const weekday = date.getDay();
  const { data, error } = await supabase
    .from("windows")
    .select(
      "id,label,days_of_week,start_local,end_local,energy_cap,tags,max_consecutive_min"
    )
    .eq("user_id", userId)
    .contains("days_of_week", [weekday]);
  if (error) throw error;
  return (data ?? []) as WindowRow[];
}

export interface Slot {
  windowId: string;
  start: Date;
  end: Date;
  index: number;
  maxConsecutiveMin: number | null;
}

export function genSlots(
  date: Date,
  windows: WindowRow[],
  slotMinutes = 5
): Slot[] {
  const slots: Slot[] = [];
  for (const w of windows) {
    const [sh, sm] = (w.start_local || "0:0").split(":").map(Number);
    const [eh, em] = (w.end_local || "0:0").split(":").map(Number);
    const windowStart = new Date(date);
    windowStart.setHours(sh, sm, 0, 0);
    const windowEnd = new Date(date);
    windowEnd.setHours(eh, em, 0, 0);
    let index = 0;
    let cursor = new Date(windowStart);
    while (true) {
      const end = new Date(cursor.getTime() + slotMinutes * 60000);
      if (end > windowEnd) break;
      slots.push({
        windowId: w.id,
        start: new Date(cursor),
        end,
        index,
        maxConsecutiveMin: w.max_consecutive_min ?? null,
      });
      cursor = end;
      index++;
    }
  }
  return slots;
}

