"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Project } from "../types";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";

interface ProjectRowProps {
  project: Project;
}

const MAX_VISIBLE_TASKS = 12;

export function ProjectRow({ project }: ProjectRowProps) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);

  const hasTasks = project.tasks.length > 0;
  const [visibleTasks, hiddenCount] = useMemo(() => {
    const slice = project.tasks.slice(0, MAX_VISIBLE_TASKS);
    return [slice, project.tasks.length - slice.length] as const;
  }, [project.tasks]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between text-left text-sm text-white"
        aria-expanded={open}
        aria-controls={`project-${project.id}`}
      >
        <div className="flex items-center gap-2 text-white">
          <span className="font-semibold">{project.name}</span>
          <FlameEmber level={project.energy.toUpperCase() as FlameLevel} size="sm" />
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[11px] text-white/60">{project.progress}%</p>
          {project.dueDate && (
            <span className="text-xs text-white/60">
              {new Date(project.dueDate).toLocaleDateString()}
            </span>
          )}
          {hasTasks && (
            <ChevronDown
              className={`h-4 w-4 text-white/60 transition-transform ${open ? "rotate-180" : ""}`}
            />
          )}
        </div>
      </button>
      {hasTasks && (
        <ul
          id={`project-${project.id}`}
          className={`mt-3 space-y-1.5 overflow-hidden rounded-xl border border-white/5 bg-black/20 p-3 text-xs text-white/70 transition-all ${
            open ? "max-h-60" : "max-h-0"
          }`}
        >
          {open && (
            <>
              {visibleTasks.map((task) => (
                <li key={task.id} className="flex items-start gap-2">
                  <span className="mt-1 h-1 w-1 rounded-full bg-white/70" aria-hidden="true" />
                  <span>{task.name}</span>
                </li>
              ))}
              {hiddenCount > 0 && (
                <li className="text-white/50">+{hiddenCount} more tasks</li>
              )}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
