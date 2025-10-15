export interface Task {
  id: string;
  name: string;
  stage: string;
  skillId?: string | null;
  dueDate?: string;
  isNew?: boolean;
}

export interface Project {
  id: string;
  name: string;
  status: "Todo" | "In-Progress" | "Done" | "Active";
  progress: number; // 0-100
  dueDate?: string;
  energy: "No" | "Low" | "Medium" | "High" | "Ultra" | "Extreme";
  tasks: Task[];
  stage?: string;
  energyCode?: string;
  priorityCode?: string;
  isNew?: boolean;
}

export interface Goal {
  id: string;
  title: string;
  emoji?: string;
  dueDate?: string;
  priority: "Low" | "Medium" | "High";
  energy: "No" | "Low" | "Medium" | "High" | "Ultra" | "Extreme";
  progress: number; // 0-100
  status: "Active" | "Completed" | "Overdue" | "Inactive";
  active: boolean;
  updatedAt: string;
  projects: Project[];
  monumentId?: string | null;
  /** Associated skill IDs */
  skills?: string[];
  weight?: number;
  why?: string;
}
