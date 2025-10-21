import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

export interface Habit {
  id: string;
  name: string;
  description: string | null;
  habit_type: string;
  recurrence: string | null;
  recurrence_days: number[] | null;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
  skill_id: string | null;
  energy: string | null;
  goal_id: string | null;
  completion_target: number | null;
  location_context: string | null;
  location_context_id: string | null;
  location_context_label: string | null;
  skill: {
    id: string;
    name: string | null;
    icon: string | null;
  } | null;
  goal?: {
    id: string;
    name: string | null;
  } | null;
  routine_id?: string | null;
  routine?: {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  } | null;
}

type HabitRow = Database["public"]["Tables"]["habits"]["Row"];
type LocationContextRow = Database["public"]["Tables"]["location_contexts"]["Row"];

type HabitSkill = {
  id: string;
  name: string | null;
  icon: string | null;
};

type HabitGoal = {
  id: string;
  name: string | null;
};

type HabitRoutine = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type HabitRecord = HabitRow & {
  skill?: HabitSkill | null;
  goal?: HabitGoal | null;
  routine_id?: string | null;
  routine?: HabitRoutine | null;
};

type LocationMetadata = {
  id: string | null;
  label: string | null;
};

export function normalizeLocationValue(input: string | null | undefined) {
  if (!input) return null;
  const normalized = input.replace(/\s+/g, " ").trim().toUpperCase();
  return normalized || null;
}

export function formatLocationLabel(input: string | null | undefined) {
  if (!input) return null;
  const normalized = input.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return null;
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function fetchLocationContextOptions(
  supabase: SupabaseClient<Database>,
  values: string[],
) {
  const unique = Array.from(new Set(values)).filter(Boolean);
  if (unique.length === 0) {
    return new Map<string, LocationMetadata>();
  }

  try {
    const { data, error } = await supabase
      .from("location_contexts")
      .select("id, value, label")
      .in("value", unique);

    if (error) throw error;

    const map = new Map<string, LocationMetadata>();
    for (const row of (data ?? []) as LocationContextRow[]) {
      const normalized = normalizeLocationValue(row.value);
      if (!normalized) continue;
      map.set(normalized, {
        id: row.id ?? null,
        label: row.label?.trim() || formatLocationLabel(row.value) || normalized,
      });
    }

    return map;
  } catch (err) {
    console.warn("Failed to resolve location context labels", err);
    return new Map<string, LocationMetadata>();
  }
}

function mapHabitRecord(
  record: HabitRecord,
  locations: Map<string, LocationMetadata>,
): Habit {
  const normalizedLocation = normalizeLocationValue(record.location_context);
  const locationFallbackLabel =
    formatLocationLabel(record.location_context) ??
    (typeof record.location_context === "string"
      ? record.location_context
      : null);
  const locationMetadata =
    normalizedLocation && locations.size > 0
      ? locations.get(normalizedLocation) ?? null
      : null;

  return {
    id: record.id,
    name: record.name,
    description: record.description ?? null,
    habit_type: record.habit_type,
    recurrence: record.recurrence ?? null,
    recurrence_days: record.recurrence_days ?? null,
    duration_minutes: record.duration_minutes ?? null,
    created_at: record.created_at,
    updated_at: record.updated_at,
    skill_id: record.skill_id ?? null,
    energy: record.energy ?? null,
    goal_id: record.goal_id ?? null,
    completion_target: record.completion_target ?? null,
    location_context: normalizedLocation,
    location_context_id: locationMetadata?.id ?? null,
    location_context_label:
      locationMetadata?.label ?? locationFallbackLabel ?? normalizedLocation,
    skill: record.skill
      ? {
          id: record.skill.id,
          name: record.skill.name ?? null,
          icon: record.skill.icon ?? null,
        }
      : null,
    goal: record.goal
      ? {
          id: record.goal.id,
          name: record.goal.name ?? null,
        }
      : null,
    routine_id: typeof record.routine_id === "string" ? record.routine_id : null,
    routine: record.routine
      ? {
          id: record.routine.id,
          name: record.routine.name,
          description: record.routine.description ?? null,
          created_at: record.routine.created_at,
          updated_at: record.routine.updated_at,
        }
      : null,
  } satisfies Habit;
}

async function hydrateHabits(
  supabase: SupabaseClient<Database>,
  records: HabitRecord[],
) {
  const locationValues = records
    .map((habit) => normalizeLocationValue(habit.location_context))
    .filter((value): value is string => Boolean(value));
  const locationLookup = await fetchLocationContextOptions(
    supabase,
    locationValues,
  );

  return records.map((record) => mapHabitRecord(record, locationLookup));
}

export async function getHabits(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Habit[]> {
  const { data, error } = await supabase
    .from("habits")
    .select(
      [
        "id",
        "name",
        "description",
        "habit_type",
        "recurrence",
        "recurrence_days",
        "duration_minutes",
        "created_at",
        "updated_at",
        "skill_id",
        "energy",
        "goal_id",
        "completion_target",
        "location_context",
        "routine_id",
        "skill:skills(id, name, icon)",
        "goal:goals(id, name)",
        "routine:habit_routines(id, name, description, created_at, updated_at)",
      ].join(", "),
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.warn("Error fetching habits with routines, falling back:", error);

    const fallback = await supabase
      .from("habits")
      .select(
        [
          "id",
          "name",
          "description",
          "habit_type",
          "recurrence",
          "recurrence_days",
          "duration_minutes",
          "created_at",
          "updated_at",
          "skill_id",
          "energy",
          "goal_id",
          "completion_target",
          "location_context",
          "routine_id",
        ].join(", "),
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (fallback.error) {
      console.error("Error fetching habits:", fallback.error);
      throw fallback.error;
    }

    const records = (fallback.data ?? []) as HabitRecord[];
    return hydrateHabits(
      supabase,
      records.map((habit) => ({
        ...habit,
        skill: null,
        goal: null,
        routine: null,
      })),
    );
  }

  const records = (data ?? []) as HabitRecord[];
  return hydrateHabits(supabase, records);
}
