"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectRow } from "./ProjectRow";
import { Goal } from "./types";

interface ProjectsDropdownProps {
  goal: Goal;
  isOpen: boolean;
  loading: boolean;
}

export function ProjectsDropdown({ goal, isOpen, loading }: ProjectsDropdownProps) {
  return (
    <div
      id={`goal-${goal.id}`}
      role="region"
      aria-label={`Projects for ${goal.title}`}
      className={cn(
        "overflow-hidden transition-all motion-safe:duration-300",
        isOpen ? "max-h-screen opacity-100 pt-2" : "max-h-0 opacity-0"
      )}
    >
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-400">
            Projects for {goal.title}
          </p>
          {goal.projects.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span>No projects linked yet</span>
              <Button variant="link" className="h-auto p-0 text-sm">
                Add Project
              </Button>
            </div>
          ) : (
            goal.projects.map((p) => <ProjectRow key={p.id} project={p} />)
          )}
          <Button variant="link" className="h-auto p-0 text-xs">
            View all projects
          </Button>
        </div>
      )}
    </div>
  );
}
