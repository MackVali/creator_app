export interface Task {
  id: string;
  name: string;
  stage: string;
}

export type EnergyLevel =
  | "NO"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "ULTRA"
  | "EXTREME";

export interface Project {
  id: string;
  name: string;
  status: "Todo" | "In-Progress" | "Done" | "Active";
  progress: number; // 0-100
  energy: EnergyLevel;
  dueDate?: string;
  tasks: Task[];
}

export interface Goal {
  id: string;
  title: string;
  emoji?: string;
  dueDate?: string;
  priority: "Low" | "Medium" | "High";
  energy: EnergyLevel;
  progress: number; // 0-100
  status: "Active" | "Completed" | "Overdue" | "Inactive";
  active: boolean;
  updatedAt: string;
  projects: Project[];
}
