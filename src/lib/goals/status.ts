export const GOAL_STATUS_VALUES = ["ACTIVE", "PAUSED", "COMPLETED"] as const;

export type GoalStatus = (typeof GOAL_STATUS_VALUES)[number];

export function normalizeGoalStatus(
  status?: string | null,
  active?: boolean | null,
): GoalStatus {
  const normalized = typeof status === "string" ? status.trim().toUpperCase() : "";

  switch (normalized) {
    case "COMPLETED":
    case "DONE":
      return "COMPLETED";
    case "PAUSED":
    case "INACTIVE":
      return "PAUSED";
    case "ACTIVE":
    case "IN_PROGRESS":
    case "IN PROGRESS":
      return "ACTIVE";
    default:
      return active === false ? "PAUSED" : "ACTIVE";
  }
}

export function getGoalStatusLabel(
  status: GoalStatus,
): "Active" | "Paused" | "Completed" {
  switch (status) {
    case "COMPLETED":
      return "Completed";
    case "PAUSED":
      return "Paused";
    case "ACTIVE":
    default:
      return "Active";
  }
}
