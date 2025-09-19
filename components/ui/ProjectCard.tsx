"use client";

import { DateTime } from "luxon";
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

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    goal_name: string;
    priority: string;
    energy: string;
    stage: string;
    created_at: string;
  };
}

export function ProjectCard({ project }: ProjectCardProps) {
  const handleEdit = () => {
    // Placeholder for future edit functionality
    console.log("Edit project", project.id);
  };

  const createdAt = DateTime.fromISO(project.created_at);
  const createdAtLabel = createdAt.isValid
    ? createdAt.toLocaleString(DateTime.DATETIME_MED_WITH_WEEKDAY)
    : null;

  return (
    <Card className="hover:bg-gray-800/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-medium text-white">{project.name}</h3>
          <div className="flex items-center gap-2">
            <FlameEmber level={project.energy as FlameLevel} size="sm" />
            <Badge variant="outline" className="text-xs">
              {project.goal_name}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Project actions"
                  className="p-1 rounded bg-gray-700"
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
          <Badge variant={getPriorityVariant(project.priority)}>
            {project.priority}
          </Badge>
          <Badge variant={getEnergyVariant(project.energy)}>
            {project.energy}
          </Badge>
          <Badge variant="secondary">{project.stage}</Badge>
        </div>
        {createdAtLabel && (
          <p className="mt-2 text-xs text-gray-400">
            Created {createdAtLabel}
          </p>
        )}
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
