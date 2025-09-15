"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Project } from "../types";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";

interface ProjectRowProps {
  project: Project;
}

export function ProjectRow({ project }: ProjectRowProps) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);

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
          <FlameEmber
            level={project.energy.toUpperCase() as FlameLevel}
            size="sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary"
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
