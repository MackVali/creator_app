"use client";

import type { Task } from "../types";

interface TaskRowProps {
  task: Task;
}

export function TaskRow({ task }: TaskRowProps) {
  const statusColor =
    task.status === "Done"
      ? "bg-green-600"
      : task.status === "In-Progress"
      ? "bg-yellow-600"
      : "bg-gray-600";

  return (
    <div className="flex items-center justify-between text-sm pl-2 pr-4">
      <span>{task.name}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor}`}>
        {task.status}
      </span>
    </div>
  );
}

