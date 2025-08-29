"use client";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/Progress";
import { Project } from "./types";

interface ProjectRowProps {
  project: Project;
}

export function ProjectRow({ project }: ProjectRowProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{project.name}</p>
        <div className="mt-1 flex items-center gap-2">
          {project.status && (
            <Badge variant="outline" className="text-xs capitalize">
              {project.status}
            </Badge>
          )}
          <Progress value={project.progress ?? 0} className="w-24" />
          {project.dueDate && (
            <span className="text-xs text-gray-400">{project.dueDate}</span>
          )}
        </div>
      </div>
    </div>
  );
}
