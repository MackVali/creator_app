"use client";

import { useId, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import { Badge } from "./badge";
import { Card, CardContent } from "./card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    goal_name: string;
    priority: string;
    energy: string;
    stage: string;
  };
}

export function ProjectCard({ project }: ProjectCardProps) {
  const [isCompleted, setIsCompleted] = useState(false);
  const checkboxId = useId();

  const handleEdit = () => {
    // Placeholder for future edit functionality
    console.log("Edit project", project.id);
  };

  return (
    <Card
      className={cn(
        "transition-colors duration-500",
        isCompleted
          ? "bg-gradient-to-br from-emerald-600 via-emerald-500 to-emerald-700 border-emerald-300/60 text-emerald-50 shadow-lg shadow-emerald-900/30"
          : "hover:bg-gray-800/50"
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center">
              <input
                id={checkboxId}
                type="checkbox"
                checked={isCompleted}
                onChange={(event) => setIsCompleted(event.target.checked)}
                className={cn(
                  "h-5 w-5 cursor-pointer appearance-none rounded-md border transition-all",
                  "border-gray-600 bg-transparent",
                  "checked:border-emerald-200 checked:bg-emerald-400/90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70"
                )}
                aria-label={`Mark ${project.name} as complete`}
              />
              <svg
                className={cn(
                  "pointer-events-none absolute inset-0 m-auto h-3 w-3 text-emerald-950 transition-opacity",
                  isCompleted ? "opacity-100" : "opacity-0"
                )}
                viewBox="0 0 12 10"
                aria-hidden="true"
              >
                <path
                  d="M1 5.5 4.5 9 11 1"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <label
              htmlFor={checkboxId}
              className={cn(
                "cursor-pointer select-none font-medium transition-colors",
                isCompleted ? "text-emerald-50" : "text-white"
              )}
            >
              {project.name}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <FlameEmber level={project.energy as FlameLevel} size="sm" />
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                isCompleted && "border-emerald-200/70 text-emerald-50"
              )}
            >
              {project.goal_name}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Project actions"
                  className={cn(
                    "p-1 rounded transition-colors",
                    isCompleted ? "bg-emerald-700/60 text-emerald-50" : "bg-gray-700"
                  )}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleEdit}>
                  Edit
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge
            variant={getPriorityVariant(project.priority)}
            className={cn(isCompleted && "bg-emerald-600/30 text-emerald-50")}
          >
            {project.priority}
          </Badge>
          <Badge
            variant={getEnergyVariant(project.energy)}
            className={cn(isCompleted && "bg-emerald-600/30 text-emerald-50")}
          >
            {project.energy}
          </Badge>
          <Badge
            variant="secondary"
            className={cn(isCompleted && "bg-emerald-600/30 text-emerald-50")}
          >
            {project.stage}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function getPriorityVariant(
  priority: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (priority) {
    case "CRITICAL":
    case "ULTRA-CRITICAL":
      return "destructive";
    case "HIGH":
      return "default";
    case "MEDIUM":
      return "secondary";
    default:
      return "outline";
  }
}

function getEnergyVariant(
  energy: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (energy) {
    case "EXTREME":
      return "destructive";
    case "ULTRA":
      return "default";
    case "HIGH":
      return "secondary";
    default:
      return "outline";
  }
}
