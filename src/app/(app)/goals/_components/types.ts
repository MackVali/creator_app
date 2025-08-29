export type ProjectStatus = "Todo" | "In-Progress" | "Done";

export interface Project {
  id: string;
  name: string;
  status?: ProjectStatus;
  progress?: number;
  dueDate?: string;
}

export type GoalStatus = "Active" | "Completed" | "Overdue";
export type GoalPriority = "Low" | "Medium" | "High";

export interface Goal {
  id: string;
  title: string;
  emoji?: string;
  dueDate?: string;
  priority?: GoalPriority;
  progress?: number;
  status?: GoalStatus;
  updatedAt?: string;
  projectCount?: number;
  projects: Project[];
}
