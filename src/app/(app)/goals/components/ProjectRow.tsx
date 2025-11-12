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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between text-left text-sm text-white"
        aria-expanded={open}
        aria-controls={`project-${project.id}`}
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-white">
            <span className="font-semibold">{project.name}</span>
            <FlameEmber level={project.energy.toUpperCase() as FlameLevel} size="sm" />
          </div>
          <span className="text-[10px] uppercase tracking-[0.4em] text-white/50">
            {project.status}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 via-cyan-400 to-emerald-400"
                style={{ width: `${project.progress}%` }}
              />
            </div>
            <p className="text-[10px] text-white/60">{project.progress}%</p>
          </div>
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
          {open &&
            project.tasks.map((task) => (
              <li key={task.id} className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 rounded-full bg-white/70" aria-hidden="true" />
                <span>{task.name}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
