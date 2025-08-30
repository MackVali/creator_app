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
import { getSupabaseBrowser } from "@/lib/supabase";
import { CreateGoalDrawer } from "./CreateGoalDrawer";

interface GoalCardProps {
  goal: Goal;
  onChange?(goal: Goal): void;
}

export function GoalCard({ goal, onChange }: GoalCardProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(goal);
  const [editOpen, setEditOpen] = useState(false);

  const handleUpdate = (g: Goal) => {
    setData(g);
    onChange?.(g);
  };

  const toggleActive = async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const newActive = !data.active;
    await supabase
      .from("goals")
      .update({ active: newActive, status: newActive ? "Active" : "Inactive" })
      .eq("id", data.id);
    const updated = { ...data, active: newActive, status: newActive ? "Active" : "Inactive" };
    setData(updated);
    onChange?.(updated);
  };

  const toggle = () => {
    setOpen((o) => !o);
    if (!open) {
      setLoading(true);
      setTimeout(() => setLoading(false), 500);
    }
  };

  const priorityColor =
    data.priority === "High"
      ? "bg-red-600"
      : data.priority === "Medium"
      ? "bg-yellow-600"
      : "bg-green-600";

  return (
    <div className="bg-gray-800 rounded-lg shadow text-left">
      <div className="relative">
        <button
          onClick={toggle}
          aria-expanded={open}
          aria-controls={`goal-${data.id}`}
          className={`w-full flex items-start justify-between p-4 active:scale-95 transition-transform motion-safe:duration-150 motion-reduce:transform-none`}
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {data.emoji && <span className="text-xl" aria-hidden>{data.emoji}</span>}
              <span id={`goal-${data.id}-label`} className="font-medium truncate">
                {data.title}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-300">
              <div className="w-10 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${data.progress}%` }}
                />
              </div>
              {data.dueDate && (
                <span className="px-2 py-0.5 bg-gray-700 rounded-full">
                  {new Date(data.dueDate).toLocaleDateString()}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full ${priorityColor}`}>
                {data.priority}
              </span>
              <span className="px-2 py-0.5 bg-gray-700 rounded-full">
                {data.projects.length} projects
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
              <button aria-label="Goal actions" className="p-1 rounded bg-gray-700">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleActive}>
                {data.active ? "Mark Inactive" : "Mark Active"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ProjectsDropdown
        id={`goal-${data.id}`}
        goalTitle={data.title}
        projects={data.projects}
        open={open}
        loading={loading}
      />
      <CreateGoalDrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onUpdate={handleUpdate}
        goal={data}
      />
    </div>
  );
}
