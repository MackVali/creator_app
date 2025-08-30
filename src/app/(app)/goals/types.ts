export interface Task {
  id: string;
  name: string;
  status: "Todo" | "In-Progress" | "Done";
}

export interface Project {
  id: string;
  name: string;
  status: "Todo" | "In-Progress" | "Done";
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
  progress: number; // 0-100
  status: "Active" | "Completed" | "Overdue";
  updatedAt: string;
  projects: Project[];
}
