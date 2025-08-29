"use client";

import { Goal } from "./types";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/Progress";
import { ProjectsDropdown } from "./ProjectsDropdown";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, MoreVertical } from "lucide-react";

interface GoalCardProps {
  goal: Goal;
  isOpen: boolean;
  onToggle: () => void;
  loading: boolean;
}

export function GoalCard({ goal, isOpen, onToggle, loading }: GoalCardProps) {
  const priorityVariant =
    goal.priority === "High"
      ? "destructive"
      : goal.priority === "Medium"
      ? "default"
      : "secondary";

  return (
    <div className="rounded-lg bg-gray-800 p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <button
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={`goal-${goal.id}`}
          className="flex-1 text-left motion-safe:transition-transform active:scale-95"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {goal.emoji && <span className="text-xl">{goal.emoji}</span>}
              <span className="truncate font-medium">{goal.title}</span>
            </div>
            <ChevronDown
              className={`size-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <Progress value={goal.progress} className="w-20" />
            {goal.dueDate && (
              <Badge variant="outline" className="text-xs">
                {goal.dueDate}
              </Badge>
            )}
            {goal.priority && (
              <Badge variant={priorityVariant} className="text-xs capitalize">
                {goal.priority}
              </Badge>
            )}
            <span>{goal.projects.length} proj</span>
          </div>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="ml-2">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Edit</DropdownMenuItem>
            <DropdownMenuItem>Mark Done</DropdownMenuItem>
            <DropdownMenuItem>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ProjectsDropdown goal={goal} isOpen={isOpen} loading={loading} />
    </div>
  );
}
