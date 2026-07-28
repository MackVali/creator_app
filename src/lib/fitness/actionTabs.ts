export const FITNESS_ACTION_TAB_SPECS = [
  { id: "start", label: "Workout" },
  { id: "exercises", label: "Exercises" },
  { id: "favorites", label: "Favorites" },
  { id: "workout-routines", label: "Routines" },
  { id: "plans", label: "Plans" },
  { id: "custom", label: "Custom" },
  { id: "me", label: "ME" },
] as const;

export type FitnessActionTabId = (typeof FITNESS_ACTION_TAB_SPECS)[number]["id"];

export const DEFAULT_FITNESS_ACTION_TAB_ID: FitnessActionTabId = "start";
