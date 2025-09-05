import { getSupabaseBrowser } from "@/lib/supabase";
import type { ScheduleIconName } from "@/lib/icons";

export type ScheduleItem = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  icon?: ScheduleIconName | null;
  accent?: "none" | "blue" | "violet" | "pink" | null;
};

export async function fetchScheduleItems(): Promise<ScheduleItem[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("schedule_items")
    .select("id, title, start_time, end_time")
    .order("start_time", { ascending: true });

  if (error) {
    console.error("Failed to fetch schedule items", error);
    return [];
  }

  return (data ?? []) as ScheduleItem[];
}
