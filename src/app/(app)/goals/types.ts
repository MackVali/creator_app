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
  emoji?: string | null;
  tasks: Task[];
  stage?: string;
  energyCode?: string;
  priorityCode?: string;
  durationMinutes?: number | null;
  skillIds?: string[];
  priorityId?: string | number | null;
  energyId?: string | number | null;
  weight?: number;
  isNew?: boolean;
}

export interface Goal {
  id: string;
  /** Optional parent goal id when rendering derived goal views (e.g., skill details) */
  parentGoalId?: string | null;
  title: string;
  emoji?: string;
  dueDate?: string;
  estimatedCompletionAt?: string | null;
  priority: "Low" | "Medium" | "High" | "Critical" | "Ultra-Critical";
  energy: "No" | "Low" | "Medium" | "High" | "Ultra" | "Extreme";
  progress: number; // 0-100
  status: "Active" | "Completed" | "Overdue" | "Inactive";
  active: boolean;
  createdAt: string;
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
