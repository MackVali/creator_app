export interface Task {
  id: string;
  name: string;
  stage: string;
  skillId?: string | null;
  dueDate?: string | null;
  isNew?: boolean;
}

export interface Project {
  id: string;
  name: string;
  status: "Todo" | "In-Progress" | "Done" | "Active";
  progress: number; // 0-100
  dueDate?: string | null;
  energy: "No" | "Low" | "Medium" | "High" | "Ultra" | "Extreme";
  tasks: Task[];
  stage?: string;
  energyCode?: string;
  priorityCode?: string;
  isNew?: boolean;
  /** Associated skill IDs */
  skillIds?: string[];
}

export interface Goal {
  id: string;
  title: string;
  emoji?: string;
  dueDate?: string | null;
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
