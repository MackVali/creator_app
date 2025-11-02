import { getSupabaseBrowser } from "@/lib/supabase";

type GoalMetadataSupportState = "unknown" | "supported" | "unsupported";

let goalMetadataSupport: GoalMetadataSupportState = "unknown";

function shouldIncludeGoalMetadata(maybeError?: unknown): boolean {
  if (goalMetadataSupport === "unsupported") {
    return false;
  }
  if (!maybeError || typeof maybeError !== "object") {
    return goalMetadataSupport !== "unsupported";
  }
  const message =
    "message" in maybeError && typeof maybeError.message === "string"
      ? maybeError.message.toLowerCase()
      : "";
  if (!message) {
    return goalMetadataSupport !== "unsupported";
  }
  const missing =
    message.includes("goal_id") || message.includes("completion_target");
  if (missing) {
    goalMetadataSupport = "unsupported";
  }
  return !missing;
}

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
  location_context_id: string | null;
  location_context?: {
    id: string;
    value: string | null;
    label: string | null;
  } | null;
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

export async function getHabits(userId: string): Promise<Habit[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const baseColumns =
    "id, name, description, habit_type, recurrence, recurrence_days, duration_minutes, created_at, updated_at, skill_id, energy, location_context_id";
  const extendedColumns = `${baseColumns}, goal_id, completion_target`;
  const includeGoalMetadata = goalMetadataSupport !== "unsupported";
  const selectColumns = includeGoalMetadata ? extendedColumns : baseColumns;

  const { data, error } = await supabase
    .from("habits")
    .select(
      `${selectColumns}, location_context:location_contexts(id, value, label), skill:skills(id, name, icon), goal:goals(id, name), routine_id, routine:habit_routines(id, name, description, created_at, updated_at)`
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    const includeFallback = shouldIncludeGoalMetadata(error);
    if (!includeFallback) {
      console.warn(
        "Error fetching habits with goal metadata, retrying without goal fields:",
        error
      );
      const fallback = await supabase
        .from("habits")
        .select(
          `${baseColumns}, location_context:location_contexts(id, value, label), skill:skills(id, name, icon), routine_id, routine:habit_routines(id, name, description, created_at, updated_at)`
        )
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (fallback.error) {
        console.error("Error fetching habits:", fallback.error);
        throw fallback.error;
      }

      goalMetadataSupport = "unsupported";

      return (
        fallback.data?.map((habit) => ({
          ...habit,
          skill_id: habit.skill_id ?? null,
          energy: habit.energy ?? null,
          location_context_id: habit.location_context_id ?? null,
          location_context: habit.location_context
            ? {
                id: habit.location_context.id,
                value: habit.location_context.value ?? null,
                label: habit.location_context.label ?? null,
              }
            : null,
          skill: habit.skill
            ? {
                id: habit.skill.id,
                name: habit.skill.name,
                icon: habit.skill.icon ?? null,
              }
            : null,
          goal_id: null,
          completion_target: null,
          goal: null,
          routine_id: habit.routine_id ?? null,
          routine: habit.routine
            ? {
                id: habit.routine.id,
                name: habit.routine.name,
                description: habit.routine.description ?? null,
                created_at: habit.routine.created_at,
                updated_at: habit.routine.updated_at,
              }
            : null,
        })) || []
      );
    }

    console.error("Error fetching habits:", error);
    throw error;
  }

  if (includeGoalMetadata && goalMetadataSupport === "unknown") {
    goalMetadataSupport = "supported";
  }

  return (
    data?.map((habit) => ({
      ...habit,
      skill_id: habit.skill_id ?? null,
      energy: habit.energy ?? null,
      location_context_id: habit.location_context_id ?? null,
      location_context: habit.location_context
        ? {
            id: habit.location_context.id,
            value: habit.location_context.value ?? null,
            label: habit.location_context.label ?? null,
          }
        : null,
      skill: habit.skill
        ? {
            id: habit.skill.id,
            name: habit.skill.name,
            icon: habit.skill.icon ?? null,
          }
        : null,
      goal_id:
        includeGoalMetadata && habit.goal_id !== undefined
          ? habit.goal_id ?? null
          : null,
      completion_target:
        includeGoalMetadata && habit.completion_target !== undefined
          ? habit.completion_target ?? null
          : null,
      goal:
        includeGoalMetadata && habit.goal
          ? {
              id: habit.goal.id,
              name: habit.goal.name ?? null,
            }
          : null,
    })) ?? []
  );
}
