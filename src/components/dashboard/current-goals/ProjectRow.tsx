"use client";

import { FileText, ChevronDown, ChevronRight } from "lucide-react";
import { Progress } from "../../../../components/ui/Progress";
import type { Project } from "./types";
import { useRouter } from "next/navigation";
import { projectDetailRoute } from "../../../../lib/route-helpers";

interface ProjectRowProps {
  project: Project;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

export function ProjectRow({
  project,
  expanded,
  onToggle,
  children,
}: ProjectRowProps) {
  const router = useRouter();
  return (
    <div className="border-b border-white/5">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-2 text-left hover:bg-white/5"
      >
        <div className="flex items-center flex-1 overflow-hidden">
          <FileText className="w-4 h-4 mr-2 flex-shrink-0" />
          <div
            className="flex-1 min-w-0"
            onClick={(e) => {
              e.stopPropagation();
              router.push(projectDetailRoute(project.id));
            }}
          >
            <div className="text-sm font-medium truncate">{project.title}</div>
            <div className="text-xs text-zinc-400 truncate">
              {project.openTaskCount}/{project.totalTaskCount} tasks
              {project.nextDueAt && (
                <>
                  {" "}• {new Date(project.nextDueAt).toLocaleDateString()}
                </>
              )}
            </div>
            <Progress
              value={project.progressPct}
              className="mt-1 h-1"
              trackClass="bg-zinc-800"
              barClass="bg-zinc-300"
            />
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
        )}
      </button>
      {expanded && children && <div className="pl-6">{children}</div>}
    </div>
  );
}

