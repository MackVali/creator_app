"use client";

import Link from "next/link";
import { ProjectRow } from "./ProjectRow";
import type { Project } from "../types";
import { Progress } from "@/components/ui/Progress";

interface ProjectsDropdownProps {
  id: string;
  goalTitle: string;
  projects: Project[];
  open: boolean;
  loading: boolean;
}

export function ProjectsDropdown({
  id,
  goalTitle,
  projects,
  open,
  loading,
}: ProjectsDropdownProps) {
  return (
    <div
      id={id}
      role="region"
      aria-labelledby={`${id}-label`}
      className={`overflow-hidden px-6 transition-all ${
        open ? "max-h-96 opacity-100 pb-6 pt-4" : "max-h-0 opacity-0"
      }`}
    >
      {open && (
        <div className="space-y-4 text-sm text-white/70">
          <h4 className="text-sm font-semibold uppercase tracking-[0.25em] text-white/60">
            Projects for {goalTitle}
          </h4>
          {loading ? (
            <Progress
              value={100}
              className="mb-2"
              trackClass="bg-white/10"
              barClass="bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400 animate-pulse"
            />
          ) : projects.length > 0 ? (
            <div className="space-y-2">
              {projects.map((p) => (
                <ProjectRow key={p.id} project={p} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-white/50">
              No projects linked yet
              <button className="ml-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:border-indigo-300/40 hover:text-white">
                Add Project
              </button>
            </div>
          )}
          <Link
            href="/projects"
            className="mt-3 inline-block text-xs font-medium text-white/60 transition hover:text-white"
          >
            View all projects
          </Link>
        </div>
      )}
    </div>
  );
}
