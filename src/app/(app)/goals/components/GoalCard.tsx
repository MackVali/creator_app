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

  const priorityColor = "bg-[#3C3C3C] text-[#A0A0A0]";

  return (
    <div className="bg-[#2B2B2B] border border-[#3C3C3C] rounded-lg text-left">
      <div className="relative">
        <button
          onClick={toggle}
          aria-expanded={open}
          aria-controls={`goal-${goal.id}`}
          className="w-full flex items-start justify-between p-4 active:scale-95 hover:bg-[#353535] transition-transform motion-safe:duration-150 motion-reduce:transform-none"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {goal.emoji && <span className="text-xl" aria-hidden>{goal.emoji}</span>}
              <span id={`goal-${goal.id}-label`} className="font-medium truncate">
                {goal.title}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-[#A0A0A0]">
              <div className="w-10 h-2 bg-[#3C3C3C] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#A0A0A0]"
                  style={{ width: `${goal.progress}%` }}
                />
              </div>
              {goal.dueDate && (
                <span className="px-2 py-0.5 bg-[#3C3C3C] rounded-full">
                  {new Date(goal.dueDate).toLocaleDateString()}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full ${priorityColor}`}>
                {goal.priority}
              </span>
              <span className="px-2 py-0.5 bg-[#3C3C3C] rounded-full">
                {goal.projects.length} projects
              </span>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 ml-2 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        <div className="absolute top-2 right-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Goal actions"
                className="p-1 rounded bg-[#2B2B2B] border border-[#3C3C3C] hover:bg-[#353535]"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleActive}>
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
