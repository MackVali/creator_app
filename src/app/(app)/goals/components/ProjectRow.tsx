"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Project } from "../types";
import { TaskRow } from "./TaskRow";

interface ProjectRowProps {
  project: Project;
}

export function ProjectRow({ project }: ProjectRowProps) {
  const [open, setOpen] = useState(false);
  const statusColor =
    project.status === "Done"
      ? "bg-green-600"
      : project.status === "In-Progress"
      ? "bg-yellow-600"
      : "bg-gray-600";

  return (
    <div className="border-b border-gray-700 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`project-${project.id}`}
        className="w-full flex items-center justify-between py-1 active:scale-95 transition-transform motion-reduce:transform-none"
      >
        <div className="flex items-center gap-2">
          <span id={`project-${project.id}-label`} className="text-sm">
            {project.name}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor}`}>
            {project.status}
          </span>
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
          <ChevronDown
            className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>
      <div
        id={`project-${project.id}`}
        role="region"
        aria-labelledby={`project-${project.id}-label`}
        className={`pl-4 transition-all overflow-hidden ${
          open ? "max-h-64 opacity-100 py-2" : "max-h-0 opacity-0"
        }`}
      >
        {open && (
          project.tasks.length > 0 ? (
            <div className="space-y-1">
              {project.tasks.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-400">No tasks to show</div>
          )
        )}
      </div>
    </div>
  );
}

