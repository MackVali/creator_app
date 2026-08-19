import type { FitnessWorkoutDatabaseEntry } from "@/lib/focus/fitnessWorkoutFocusSession";
import { getCurrentUserId } from "@/lib/auth";
import { FITNESS_DATABASE_ID } from "@/lib/skillStarterNotes";
import { getSupabaseBrowser } from "@/lib/supabase";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function getCurrentUserFitnessWorkoutEntries(): Promise<
  FitnessWorkoutDatabaseEntry[]
> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [];

  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("notes")
    .select("metadata")
    .eq("user_id", userId)
    .not("metadata", "is", null);

  if (error) {
    throw error;
  }

  const entriesById = new Map<string, FitnessWorkoutDatabaseEntry>();

  for (const note of data ?? []) {
    if (!isRecord(note.metadata)) continue;

    const databaseEntries = note.metadata.databaseEntries;
    if (!isRecord(databaseEntries)) continue;

    const entries = databaseEntries[FITNESS_DATABASE_ID];
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      if (!isRecord(entry) || typeof entry.id !== "string") continue;

      entriesById.set(
        entry.id,
        entry as unknown as FitnessWorkoutDatabaseEntry,
      );
    }
  }

  return Array.from(entriesById.values());
}
