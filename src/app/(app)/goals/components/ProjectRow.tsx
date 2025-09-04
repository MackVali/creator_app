"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FlameEmber } from "@/components/ui/FlameEmber";
import type { Project } from "../types";

interface ProjectRowProps {
  project: Project;
}

export function ProjectRow({ project }: ProjectRowProps) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);

  const statusColor =
    project.status === "Done"
      ? "bg-green-600"
      : project.status === "In-Progress"
      ? "bg-yellow-600"
      : "bg-gray-600";

  const hasTasks = project.tasks.length > 0;

  return (
    <div className="py-1">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between"
        aria-expanded={open}
        aria-controls={`project-${project.id}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{project.name}</span>
          <FlameEmber level={project.energy} size="sm" />
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
          {hasTasks && (
            <ChevronDown
              className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          )}
        </div>
      </button>
      {hasTasks && (
        <ul
          id={`project-${project.id}`}
          className={`ml-4 mt-1 space-y-1 overflow-hidden transition-all ${
            open ? "max-h-96" : "max-h-0"
          }`}
        >
          {open &&
            project.tasks.map((t) => (
              <li key={t.id} className="text-xs text-gray-400">
                • {t.name}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
