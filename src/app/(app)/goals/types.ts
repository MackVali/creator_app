export interface Task {
  id: string;
  name: string;
  stage: string;
}

export interface Project {
  id: string;
  name: string;
  status: "Todo" | "In-Progress" | "Done" | "Active";
  progress: number; // 0-100
  dueDate?: string;
  tasks: Task[];
}

export interface Goal {
  id: string;
  title: string;
  emoji?: string;
  dueDate?: string;
  priority: "Low" | "Medium" | "High";
  energy: "NO" | "LOW" | "MEDIUM" | "HIGH" | "ULTRA" | "EXTREME";
  progress: number; // 0-100
  status: "Active" | "Completed" | "Overdue" | "Inactive";
  active: boolean;
  updatedAt: string;
  projects: Project[];
}
