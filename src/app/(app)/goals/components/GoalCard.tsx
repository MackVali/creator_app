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

  const priorityStyles =
    goal.priority === "High"
      ? "bg-gradient-to-r from-rose-500/20 to-orange-400/20 text-rose-100"
      : goal.priority === "Medium"
      ? "bg-gradient-to-r from-amber-400/20 to-yellow-300/10 text-amber-100"
      : goal.priority === "Low"
      ? "bg-gradient-to-r from-emerald-400/15 to-teal-300/10 text-emerald-100"
      : "bg-white/5 text-white/70";

  return (
    <div className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left shadow-[0_20px_50px_-20px_rgba(79,70,229,0.35)] transition hover:border-indigo-400/40 hover:shadow-[0_30px_90px_-40px_rgba(99,102,241,0.65)]">
      <div className="relative">
        <button
          onClick={toggle}
          aria-expanded={open}
          aria-controls={`goal-${goal.id}`}
          className="w-full flex items-start justify-between gap-4 p-5 transition-transform duration-150 hover:scale-[1.01] active:scale-100"
        >
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              {goal.emoji && (
                <span className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-xl" aria-hidden>
                  {goal.emoji}
                </span>
              )}
              <span
                id={`goal-${goal.id}-label`}
                className="text-base font-medium tracking-tight text-white sm:text-lg"
              >
                {goal.title}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/60">
              <span className="flex items-center gap-2">
                <span className="relative block h-2 w-20 overflow-hidden rounded-full bg-white/10">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400"
                    style={{ width: `${goal.progress}%` }}
                  />
                </span>
                <span className="hidden text-xs font-medium text-white/70 sm:inline">
                  {goal.progress}%
                </span>
              </span>
              {goal.dueDate && (
                <span className="rounded-full border border-white/10 bg-white/[0.08] px-2 py-0.5 text-white/70">
                  {new Date(goal.dueDate).toLocaleDateString()}
                </span>
              )}
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${priorityStyles}`}>
                {goal.priority}
              </span>
              <span className="rounded-full border border-white/5 bg-white/[0.05] px-2 py-0.5">
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
                className="rounded-full border border-white/10 bg-white/10 p-1.5 text-white/70 transition hover:border-indigo-400/40 hover:text-white"
              >
                <MoreHorizontal className="w-4 h-4" />
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
      <div className="border-t border-white/5 bg-black/10">
        <ProjectsDropdown
          id={`goal-${goal.id}`}
          goalTitle={goal.title}
          projects={goal.projects}
          open={open}
          loading={loading}
        />
      </div>
    </div>
  );
}
