export interface Task {
  id: string;
  name: string;
  stage: string;
  skillId?: string | null;
}

export interface Project {
  id: string;
  name: string;
  status: "Todo" | "In-Progress" | "Done" | "Active";
  progress: number; // 0-100
  dueDate?: string;
  skillId?: string | null;
  tasks: Task[];
}

export interface Goal {
  id: string;
  title: string;
  emoji?: string;
  priority: "Low" | "Medium" | "High";
  monumentId?: string | null;
  skillId?: string | null;
  progress: number; // 0-100
  status: "Active" | "Completed" | "Overdue" | "Inactive";
  active: boolean;
  updatedAt: string;
  projects: Project[];
}
