"use client";

import { useState } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import type { Goal } from "../types";
import { ProjectsDropdown } from "./ProjectsDropdown";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface GoalCardProps {
  goal: Goal;
  onEdit?: () => void;
  onToggleActive?: () => void;
}

export function GoalCard({ goal, onEdit, onToggleActive }: GoalCardProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggle = () => {
    setOpen((o) => !o);
    if (!open) {
      setLoading(true);
      setTimeout(() => setLoading(false), 500);
    }
  };

  const priorityColor = "bg-pill text-textmed";

  return (
    <div className="rounded-lg border border-border bg-card text-left">
      <div className="relative">
        <button
          onClick={toggle}
          aria-expanded={open}
          aria-controls={`goal-${goal.id}`}
          className="flex w-full items-start justify-between p-4 transition-colors duration-150 hover:bg-cardho active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border motion-reduce:transform-none"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {goal.emoji && <span className="text-xl text-icon" aria-hidden>{goal.emoji}</span>}
              <span id={`goal-${goal.id}-label`} className="truncate font-medium text-texthi">
                {goal.title}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-textmed">
              <div className="h-2 w-10 overflow-hidden rounded-full bg-track">
                <div
                  className="h-full bg-fill"
                  style={{ width: `${goal.progress}%` }}
                />
              </div>
              {goal.dueDate && (
                <span className="rounded-full bg-pill px-2 py-0.5">
                  {new Date(goal.dueDate).toLocaleDateString()}
                </span>
              )}
              <span className={`rounded-full px-2 py-0.5 ${priorityColor}`}>
                {goal.priority}
              </span>
              <span className="rounded-full bg-pill px-2 py-0.5">
                {goal.projects.length} projects
              </span>
            </div>
          </div>
          <ChevronDown
            className={`ml-2 h-5 w-5 transition-transform text-icon ${open ? "rotate-180" : ""}`}
          />
        </button>
        <div className="absolute top-2 right-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Goal actions"
                className="rounded bg-pill p-1 text-icon hover:bg-cardho focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit?.()}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onToggleActive?.()}>
                {goal.active ? "Mark Inactive" : "Mark Active"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ProjectsDropdown
        id={`goal-${goal.id}`}
        goalTitle={goal.title}
        projects={goal.projects}
        open={open}
        loading={loading}
      />
    </div>
  );
}
