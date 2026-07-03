export type CampaignDrawerRowLifecycleStatus =
  | "active"
  | "completing"
  | "completed"
  | "rewarding"
  | "exiting"
  | "completed-hidden"
  | "undoing";

export type CampaignDrawerRowLifecycle = {
  status: CampaignDrawerRowLifecycleStatus;
  completedAt?: string | null;
  lastAction?: "complete" | "undo";
  lastPersistenceResult?: "success" | "failed";
  lastXpResult?: "success" | "failed" | "deduped" | "none";
};

export type CampaignDrawerRowLifecycleById = Record<
  string,
  CampaignDrawerRowLifecycle
>;

export const campaignDrawerGoalRowKey = (goalId: string) => `goal:${goalId}`;
export const campaignDrawerProjectRowKey = (projectId: string) =>
  `project:${projectId}`;
export const campaignDrawerTaskRowKey = (taskId: string) => `task:${taskId}`;

export const campaignDrawerGoalLayoutId = (goalId: string) =>
  `campaign-drawer-goal:${goalId}`;
export const campaignDrawerProjectLayoutId = (projectId: string) =>
  `campaign-drawer-project:${projectId}`;
export const campaignDrawerTaskLayoutId = (taskId: string) =>
  `campaign-drawer-task:${taskId}`;

export function campaignDrawerRowOverrideCompleted(
  lifecycle: CampaignDrawerRowLifecycle | undefined
) {
  if (!lifecycle) return null;
  switch (lifecycle.status) {
    case "completing":
    case "completed":
    case "rewarding":
    case "exiting":
    case "completed-hidden":
      return true;
    case "active":
    case "undoing":
      return false;
  }
}
