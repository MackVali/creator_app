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
            <Progress
              value={100}
              className="mb-2"
              trackClass="bg-gray-700"
              barClass="bg-primary animate-pulse"
            />
          ) : projects.length > 0 ? (
            <div className="space-y-2">
              {projects.map((p) => (
                <ProjectRow key={p.id} project={p} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-400">
              No projects linked yet
              <button className="ml-2 text-accent">Add Project</button>
            </div>
          )}
          <Link
            href="/projects"
            className="mt-3 inline-block text-xs text-accent"
          >
            View all projects
          </Link>
        </div>
      )}
    </div>
  );
}
