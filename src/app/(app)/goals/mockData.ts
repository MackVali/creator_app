import type { Goal } from "./types";

export const mockGoals: Goal[] = [
  {
    id: "1",
    title: "Learn TypeScript",
    emoji: "📘",
    dueDate: "2025-06-01",
    priority: "High",
    progress: 40,
    status: "Active",
    updatedAt: "2025-01-01",
    projects: [
      { id: "p1", name: "Read handbook", status: "Done", progress: 100, dueDate: "2025-02-01" },
      { id: "p2", name: "Build sample app", status: "In-Progress", progress: 50 },
      { id: "p3", name: "Practice daily", status: "Todo", progress: 10 }
    ]
  },
  {
    id: "2",
    title: "Fitness Routine",
    emoji: "💪",
    dueDate: "2025-07-15",
    priority: "Medium",
    progress: 70,
    status: "Active",
    updatedAt: "2025-02-10",
    projects: [
      { id: "p4", name: "Morning run", status: "In-Progress", progress: 60 },
      { id: "p5", name: "Gym sessions", status: "Todo", progress: 20 }
    ]
  },
  {
    id: "3",
    title: "Launch Portfolio",
    emoji: "🚀",
    dueDate: "2025-05-20",
    priority: "High",
    progress: 20,
    status: "Overdue",
    updatedAt: "2025-02-01",
    projects: [
      { id: "p6", name: "Design layout", status: "Done", progress: 100 },
      { id: "p7", name: "Write content", status: "In-Progress", progress: 30 },
      { id: "p8", name: "Deploy site", status: "Todo", progress: 0 }
    ]
  },
  {
    id: "4",
    title: "Read 12 Books",
    emoji: "📚",
    dueDate: "2025-12-31",
    priority: "Low",
    progress: 90,
    status: "Completed",
    updatedAt: "2025-01-25",
    projects: [
      { id: "p9", name: "Finish novel", status: "Done", progress: 100 },
      { id: "p10", name: "Book club", status: "Done", progress: 100 }
    ]
  },
  {
    id: "5",
    title: "Master Cooking",
    emoji: "🍳",
    dueDate: "2025-08-30",
    priority: "Medium",
    progress: 10,
    status: "Active",
    updatedAt: "2025-03-01",
    projects: [
      { id: "p11", name: "Try new recipe", status: "Todo", progress: 0 },
      { id: "p12", name: "Cooking class", status: "Todo", progress: 0 },
      { id: "p13", name: "Buy equipment", status: "In-Progress", progress: 30 }
    ]
  }
];
