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
    name: string;
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

type HabitRow = Database["public"]["Tables"]["habits"]["Row"] & {
  skill: { id: string; name: string; icon: string | null } | null;
  goal: { id: string; name: string | null } | null;
  routine: {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  } | null;
};

type LocationContextRow = Pick<
  Database["public"]["Tables"]["location_contexts"]["Row"],
  "id" | "value" | "label"
>;

function normalizeLocationValue(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function formatLocationLabel(
  value: string | null,
  label: string | null
): string | null {
  const trimmedLabel = label?.trim();
  if (trimmedLabel) return trimmedLabel;
  if (!value) return null;

  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

async function fetchLocationContextOptions(
  supabase: SupabaseClient<Database>,
  userId: string,
  values: Array<string | null | undefined>
): Promise<Map<string, LocationContextRow>> {
  const uniqueValues = Array.from(
    new Set(
      values
        .map((value) => normalizeLocationValue(value))
        .filter((value): value is string => Boolean(value))
    )
  );

  if (uniqueValues.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("location_contexts")
    .select("id, value, label")
    .eq("user_id", userId)
    .in("value", uniqueValues);

  if (error) {
    console.warn(
      "Error fetching location context options, falling back to raw values:",
      error
    );
    return new Map();
  }

  const options = new Map<string, LocationContextRow>();

  for (const option of data ?? []) {
    const normalized = normalizeLocationValue(option.value);
    if (!normalized) continue;
    options.set(normalized, option);
  }

  return options;
}

export async function getHabits(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Habit[]> {
  const { data, error } = await supabase
    .from("habits")
    .select(
      "id, name, description, habit_type, recurrence, recurrence_days, duration_minutes, created_at, updated_at, skill_id, energy, goal_id, completion_target, location_context, skill:skills(id, name, icon), goal:goals(id, name), routine_id, routine:habit_routines(id, name, description, created_at, updated_at)"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.warn("Error fetching habits with routines, falling back:", error);

    const fallback = await supabase
      .from("habits")
      .select(
        "id, name, description, habit_type, recurrence, recurrence_days, duration_minutes, created_at, updated_at, skill_id, energy, goal_id, completion_target, location_context"
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (fallback.error) {
      console.error("Error fetching habits:", fallback.error);
      throw fallback.error;
    }

    const rows = fallback.data ?? [];
    const locationOptions = await fetchLocationContextOptions(
      supabase,
      userId,
      rows.map((habit) => habit.location_context)
    );

    return rows.map((habit) => {
      const normalizedLocation = normalizeLocationValue(
        habit.location_context
      );
      const resolvedOption = normalizedLocation
        ? locationOptions.get(normalizedLocation) ?? null
        : null;

      const locationValue = normalizeLocationValue(
        resolvedOption?.value ?? habit.location_context
      );
      const locationLabel = formatLocationLabel(
        locationValue,
        resolvedOption?.label ?? null
      );

      return {
        id: habit.id,
        name: habit.name,
        description: habit.description ?? null,
        habit_type: habit.habit_type,
        recurrence: habit.recurrence ?? null,
        recurrence_days: habit.recurrence_days ?? null,
        duration_minutes: habit.duration_minutes ?? null,
        created_at: habit.created_at,
        updated_at: habit.updated_at,
        skill_id: habit.skill_id ?? null,
        energy: habit.energy ?? null,
        goal_id: habit.goal_id ?? null,
        completion_target: habit.completion_target ?? null,
        location_context: locationValue,
        location_context_id: resolvedOption?.id ?? null,
        location_context_label: locationLabel,
        skill: null,
        goal: null,
        routine_id: null,
        routine: null,
      } satisfies Habit;
    });
  }

  const rows = (data ?? []) as HabitRow[];
  const locationOptions = await fetchLocationContextOptions(
    supabase,
    userId,
    rows.map((habit) => habit.location_context)
  );

  return rows.map((habit) => {
    const normalizedLocation = normalizeLocationValue(habit.location_context);
    const resolvedOption = normalizedLocation
      ? locationOptions.get(normalizedLocation) ?? null
      : null;
    const locationValue = normalizeLocationValue(
      resolvedOption?.value ?? habit.location_context
    );
    const locationLabel = formatLocationLabel(
      locationValue,
      resolvedOption?.label ?? null
    );

    return {
      id: habit.id,
      name: habit.name,
      description: habit.description ?? null,
      habit_type: habit.habit_type,
      recurrence: habit.recurrence ?? null,
      recurrence_days: habit.recurrence_days ?? null,
      duration_minutes: habit.duration_minutes ?? null,
      created_at: habit.created_at,
      updated_at: habit.updated_at,
      skill_id: habit.skill_id ?? null,
      energy: habit.energy ?? null,
      goal_id: habit.goal_id ?? null,
      completion_target: habit.completion_target ?? null,
      location_context: locationValue,
      location_context_id: resolvedOption?.id ?? null,
      location_context_label: locationLabel,
      skill: habit.skill
        ? {
            id: habit.skill.id,
            name: habit.skill.name,
            icon: habit.skill.icon ?? null,
          }
        : null,
      goal: habit.goal
        ? {
            id: habit.goal.id,
            name: habit.goal.name ?? null,
          }
        : null,
      routine_id: habit.routine_id ?? null,
      routine: habit.routine
        ? {
            id: habit.routine.id,
            name: habit.routine.name,
            description: habit.routine.description,
            created_at: habit.routine.created_at,
            updated_at: habit.routine.updated_at,
          }
        : null,
    } satisfies Habit;
  });
}
