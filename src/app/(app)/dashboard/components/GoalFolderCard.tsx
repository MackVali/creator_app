"use client";

import { CalendarDays, Clock3, Flame, Gauge } from "lucide-react";
import type { MouseEvent } from "react";
import { Folder } from "./Folder";
import { cn } from "@/lib/utils";
import type { Goal } from "@/app/(app)/goals/types";

type GoalFolderCardProps = {
  goal: Goal;
  onEdit?: () => void;
  onToggleActive?: () => void;
};

const folderColors: Record<Goal["priority"], string> = {
  High: "#F97316",
  Medium: "#38BDF8",
  Low: "#A78BFA",
};

const priorityBadgeClasses: Record<Goal["priority"], string> = {
  High: "bg-rose-100 text-rose-700 border border-rose-200",
  Medium: "bg-sky-100 text-sky-700 border border-sky-200",
  Low: "bg-violet-100 text-violet-700 border border-violet-200",
};

const statusBadgeClasses: Record<Goal["status"], string> = {
  Active: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  Completed: "bg-slate-200 text-slate-700 border border-slate-300",
  Overdue: "bg-rose-100 text-rose-700 border border-rose-200",
  Inactive: "bg-slate-100 text-slate-500 border border-slate-200",
};

const energyBadgeClasses: Record<Goal["energy"], string> = {
  No: "bg-slate-100 text-slate-500 border border-slate-200",
  Low: "bg-sky-100 text-sky-700 border border-sky-200",
  Medium: "bg-amber-100 text-amber-700 border border-amber-200",
  High: "bg-orange-100 text-orange-700 border border-orange-200",
  Ultra: "bg-purple-100 text-purple-700 border border-purple-200",
  Extreme: "bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200",
};

const formatShortDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

export function GoalFolderCard({ goal, onEdit, onToggleActive }: GoalFolderCardProps) {
  const dueDateLabel = formatShortDate(goal.dueDate);
  const updatedAtLabel = formatShortDate(goal.updatedAt);
  const projectsToShow = goal.projects.slice(0, 2);
  const extraProjects = Math.max(goal.projects.length - projectsToShow.length, 0);

  const handleEdit = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onEdit?.();
  };

  const handleToggleActive = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggleActive?.();
  };

  const folderItems = [
    (
      <div className="flex h-full flex-col gap-3 text-slate-900" key="summary">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {goal.emoji && <span className="text-2xl" aria-hidden>{goal.emoji}</span>}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">{goal.title}</p>
              <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <Gauge className="h-3 w-3 text-slate-400" aria-hidden />
                {goal.status}
              </p>
            </div>
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide",
              priorityBadgeClasses[goal.priority]
            )}
          >
            {goal.priority}
          </span>
        </div>
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-900 transition-all duration-300"
              style={{ width: `${goal.progress}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>Progress</span>
            <span>{goal.progress}%</span>
          </div>
        </div>
        {dueDateLabel && (
          <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <CalendarDays className="h-3 w-3 text-slate-400" aria-hidden />
            Due {dueDateLabel}
          </div>
        )}
      </div>
    ),
    (
      <div className="flex h-full flex-col gap-3 text-slate-900" key="projects">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Linked Projects
        </div>
        {projectsToShow.length > 0 ? (
          <div className="flex flex-col gap-2">
            {projectsToShow.map((project) => (
              <div
                key={project.id}
                className="rounded-lg border border-slate-200 bg-white/80 p-2 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-slate-700">
                    {project.name}
                  </p>
                  <span className="text-[11px] font-medium text-slate-500">
                    {project.progress}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-slate-900 transition-all duration-300"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="capitalize">{project.status.toLowerCase()}</span>
                  <span>{project.tasks?.length ?? 0} tasks</span>
                </div>
              </div>
            ))}
            {extraProjects > 0 && (
              <div className="text-[11px] text-slate-500">
                +{extraProjects} more project{extraProjects === 1 ? "" : "s"}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-3 text-center text-xs text-slate-500">
            No projects linked yet.
          </div>
        )}
      </div>
    ),
    (
      <div className="flex h-full flex-col gap-3 text-slate-900" key="actions">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1 font-semibold uppercase tracking-wide">
            <Flame className="h-3 w-3 text-slate-400" aria-hidden />
            Energy
          </span>
          <span className="text-slate-700">{goal.energy}</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1 font-semibold uppercase tracking-wide">
            <Clock3 className="h-3 w-3 text-slate-400" aria-hidden />
            Updated
          </span>
          <span>{updatedAtLabel ?? "—"}</span>
        </div>
        <div className="mt-auto flex gap-2">
          <button
            type="button"
            onClick={handleEdit}
            className={cn(
              "flex-1 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition",
              "hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1 focus:ring-offset-white"
            )}
          >
            Edit Goal
          </button>
          <button
            type="button"
            onClick={handleToggleActive}
            className={cn(
              "flex-1 rounded-md border border-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 transition",
              "hover:bg-slate-900 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1 focus:ring-offset-white"
            )}
          >
            {goal.active ? "Mark Inactive" : "Mark Active"}
          </button>
        </div>
      </div>
    ),
  ];

  return (
    <div className="flex w-[240px] flex-col items-center gap-4 text-center">
      <Folder color={folderColors[goal.priority]} items={folderItems} />
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-100">
          {goal.emoji && <span className="text-xl" aria-hidden>{goal.emoji}</span>}
          <span className="max-w-[220px] truncate">{goal.title}</span>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide",
              statusBadgeClasses[goal.status]
            )}
          >
            {goal.status}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide",
              energyBadgeClasses[goal.energy]
            )}
          >
            {goal.energy} energy
          </span>
        </div>
        <div className="text-xs text-gray-400">{goal.projects.length} linked project{goal.projects.length === 1 ? "" : "s"}</div>
      </div>
    </div>
  );
}
