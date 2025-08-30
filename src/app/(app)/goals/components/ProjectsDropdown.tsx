"use client";

import { ProjectRow } from "./ProjectRow";
import type { Project } from "../types";

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
      className={`px-4 transition-all overflow-hidden ${
        open ? "max-h-96 opacity-100 py-4" : "max-h-0 opacity-0"
      }`}
    >
      {open && (
        <div>
          <h4 className="text-sm font-medium mb-2">
            Projects for {goalTitle}
          </h4>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-6 bg-[#3C3C3C] rounded animate-pulse" />
              ))}
            </div>
          ) : projects.length > 0 ? (
            <div className="space-y-2">
              {projects.map((p) => (
                <ProjectRow key={p.id} project={p} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-[#A0A0A0]">
              No projects linked yet
              <button className="ml-2 px-2 py-1 rounded bg-[#2B2B2B] border border-[#3C3C3C] text-[#E0E0E0] hover:bg-[#353535]">
                Add Project
              </button>
            </div>
          )}
          <button className="mt-3 text-xs px-2 py-1 rounded bg-[#2B2B2B] border border-[#3C3C3C] text-[#E0E0E0] hover:bg-[#353535]">
            View all projects
          </button>
        </div>
      )}
    </div>
  );
}
