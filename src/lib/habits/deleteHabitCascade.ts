import { getSupabaseBrowser } from "@/lib/supabase";

/**
 * Remove a habit plus its related schedule instances and memo notes.
 */
export async function deleteHabitCascade(habitId: string): Promise<void> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { error: deleteScheduleInstancesError } = await supabase
    .from("schedule_instances")
    .delete()
    .eq("source_type", "HABIT")
    .eq("source_id", habitId);

  if (deleteScheduleInstancesError) {
    throw deleteScheduleInstancesError;
  }

  const { error: deleteNotesError } = await supabase
    .from("notes")
    .delete()
    .contains("metadata", { memoHabitId: habitId });

  if (deleteNotesError) {
    throw deleteNotesError;
  }

  const { error: deleteHabitError } = await supabase
    .from("habits")
    .delete()
    .eq("id", habitId);

  if (deleteHabitError) {
    throw deleteHabitError;
  }
}
