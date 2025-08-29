export interface Goal {
  id: string;
  title: string;
  emoji?: string | null;
  progressPct: number;
  projectCount: number;
  taskCount: number;
  openTaskCount: number;
  nextDueAt?: string | null;
  updatedAt?: string | null;
  priority?: number | null;
}

export interface Project {
  id: string;
  title: string;
  progressPct: number;
  openTaskCount: number;
  totalTaskCount: number;
  nextDueAt?: string | null;
}

export interface Task {
  id: string;
  title: string;
  status: string;
  dueAt?: string | null;
}

export type GoalFilter = "all" | "active" | "due";
export type GoalSort = "priority" | "progress" | "due" | "updated";

