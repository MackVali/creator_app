"use client";

import { useState } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import type { Goal } from "../types";
import { ProjectsDropdown } from "./ProjectsDropdown";
import { GoalDrawer } from "./GoalDrawer";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface GoalCardProps {
  goal: Goal;
}

export function GoalCard({ goal }: GoalCardProps) {
  const [currentGoal, setCurrentGoal] = useState(goal);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const toggle = () => {
    setOpen((o) => !o);
    if (!open) {
      setLoading(true);
      setTimeout(() => setLoading(false), 500);
    }
  };

  const priorityColor =
    currentGoal.priority === "High"
      ? "bg-red-600"
      : currentGoal.priority === "Medium"
      ? "bg-yellow-600"
      : "bg-green-600";

  return (
    <div className="bg-gray-800 rounded-lg shadow text-left">
      <div className="relative">
        <button
          onClick={toggle}
          aria-expanded={open}
          aria-controls={`goal-${currentGoal.id}`}
          className="w-full flex items-start justify-between p-4 active:scale-95 transition-transform motion-safe:duration-150 motion-reduce:transform-none"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {currentGoal.emoji && (
                <span className="text-xl" aria-hidden>
                  {currentGoal.emoji}
                </span>
              )}
              <span
                id={`goal-${currentGoal.id}-label`}
                className="font-medium truncate"
              >
                {currentGoal.title}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-300">
              <div className="w-10 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${currentGoal.progress}%` }}
                />
              </div>
              {currentGoal.dueDate && (
                <span className="px-2 py-0.5 bg-gray-700 rounded-full">
                  {new Date(currentGoal.dueDate).toLocaleDateString()}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full ${priorityColor}`}>
                {currentGoal.priority}
              </span>
              <span className="px-2 py-0.5 bg-gray-700 rounded-full">
                {currentGoal.projects.length} projects
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
                className="p-1 rounded bg-gray-700"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDrawer(true)}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  const supabase = getSupabaseBrowser();
                  if (!supabase) return;
                  const newActive = !currentGoal.active;
                  await supabase
                    .from("goals")
                    .update({
                      active: newActive,
                      status: newActive ? "Active" : "Inactive",
                    })
                    .eq("id", currentGoal.id);
                  setCurrentGoal((g) => ({
                    ...g,
                    active: newActive,
                    status: newActive ? "Active" : "Inactive",
                  }));
                }}
              >
                {currentGoal.active ? "Mark Inactive" : "Mark Active"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ProjectsDropdown
        id={`goal-${currentGoal.id}`}
        goalTitle={currentGoal.title}
        projects={currentGoal.projects}
        open={open}
        loading={loading}
      />
      <GoalDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        goal={currentGoal}
        onSave={(g) => setCurrentGoal(g)}
      />
    </div>
  );
}
