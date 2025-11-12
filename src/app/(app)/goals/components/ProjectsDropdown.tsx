"use client";

import Link from "next/link";
import { ProjectRow } from "./ProjectRow";
import type { Project } from "../types";
import { Progress } from "@/components/ui/Progress";

interface ProjectsDropdownProps {
  id: string;
  goalTitle: string;
  projects: Project[];
  loading: boolean;
}

export function ProjectsDropdown({
  id,
  goalTitle,
  projects,
  loading,
}: ProjectsDropdownProps) {
  return (
    <div
      id={id}
      role="region"
      aria-labelledby={`${id}-label`}
      className="overflow-hidden px-5 pb-5 pt-4"
    >
      <div className="space-y-4 text-sm text-white/70">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
          Project threads for {goalTitle}
        </h4>
        {loading ? (
          <Progress
            value={100}
            className="mb-2 h-1.5"
            trackClass="bg-white/10"
            barClass="bg-gradient-to-r from-fuchsia-500 via-sky-400 to-lime-300 animate-pulse"
          />
        ) : projects.length > 0 ? (
          <div className="space-y-2">
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/20 px-4 py-3 text-sm text-white/60">
            No projects linked yet. Head to Projects to tether the first track.
          </div>
        )}
        <Link
          href="/projects"
          className="mt-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/60 transition hover:text-white"
        >
          View all projects
          <span aria-hidden className="h-px w-8 bg-gradient-to-r from-transparent via-white/60 to-transparent" />
        </Link>
      </div>
    </div>
  );
}
