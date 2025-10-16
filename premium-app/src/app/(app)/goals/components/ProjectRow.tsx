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
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between text-left text-sm text-white"
        aria-expanded={open}
        aria-controls={`project-${project.id}`}
      >
        <div className="flex items-center gap-2 text-white/80">
          <span className="font-medium">{project.name}</span>
          <FlameEmber
            level={project.energy.toUpperCase() as FlameLevel}
            size="sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="relative block h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400"
              style={{ width: `${project.progress}%` }}
            />
          </span>
          {project.dueDate && (
            <span className="text-xs text-white/50">
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
          className={`ml-4 mt-2 space-y-1 overflow-hidden text-xs text-white/60 transition-all ${
            open ? "max-h-96" : "max-h-0"
          }`}
        >
          {open &&
            project.tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-1">
                • {t.name}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
