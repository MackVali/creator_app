export interface Task {
  id: string;
  name: string;
  stage: string;
  skillId?: string | null;
  isNew?: boolean;
  priorityCode?: string | null;
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
  weight?: number;
  isNew?: boolean;
}

export interface Goal {
  id: string;
  title: string;
  emoji?: string;
  dueDate?: string;
  priority: "Low" | "Medium" | "High" | "Critical" | "Ultra-Critical";
  energy: "No" | "Low" | "Medium" | "High" | "Ultra" | "Extreme";
  progress: number; // 0-100
  status: "Active" | "Completed" | "Overdue" | "Inactive";
  active: boolean;
  updatedAt: string;
  projects: Project[];
  monumentId?: string | null;
  monumentEmoji?: string | null;
  priorityCode?: string | null;
  /** Associated skill IDs */
  skills?: string[];
  weight?: number;
  weightBoost?: number;
  why?: string;
}
