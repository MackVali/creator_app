"use client";

import type { Project } from "../types";

interface ProjectRowProps {
  project: Project;
}

export function ProjectRow({ project }: ProjectRowProps) {
  const statusColor =
    project.status === "Done"
      ? "bg-green-600"
      : project.status === "In-Progress"
      ? "bg-yellow-600"
      : "bg-gray-600";

  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <span className="text-sm">{project.name}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor}`}>{
          project.status
        }</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500"
            style={{ width: `${project.progress}%` }}
          />
        </div>
        {project.dueDate && (
          <span className="text-xs text-gray-400">
            {new Date(project.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}
