export type HabitType = "HABIT" | "CHORE";

export type HabitRecurrence =
  | "daily"
  | "weekly"
  | "bi-weekly"
  | "monthly"
  | "bi-monthly"
  | "yearly"
  | "every x days";

export type HabitRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  habit_type: HabitType;
  recurrence: HabitRecurrence | null;
  created_at: string | null;
  updated_at: string | null;
};

export type HabitInput = {
  name: string;
  description: string | null;
  habit_type: HabitType;
  recurrence: HabitRecurrence;
};
