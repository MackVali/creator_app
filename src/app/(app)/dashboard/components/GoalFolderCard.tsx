"use client";

import { CalendarDays, Clock3 } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
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
  const projectsToShow = goal.projects.slice(0, 3);
  const extraProjects = Math.max(goal.projects.length - projectsToShow.length, 0);

  const handleEdit = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onEdit?.();
  };

  const handleToggleActive = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggleActive?.();
  };

  const projectCards: ReactNode[] = projectsToShow.map((project, index) => (
    <div className="flex h-full flex-col gap-3 text-slate-900" key={project.id}>
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-sm font-semibold leading-tight">{project.name}</p>
        <span className="text-xs font-semibold text-slate-500">{project.progress}%</span>
      </div>
      <div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-slate-900 transition-all duration-300"
            style={{ width: `${project.progress}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
          <span className="inline-block truncate capitalize">{project.status.toLowerCase()}</span>
          <span>{project.tasks?.length ?? 0} tasks</span>
        </div>
      </div>
      {index === projectsToShow.length - 1 && extraProjects > 0 && (
        <div className="mt-auto rounded-md bg-slate-100/80 px-2 py-1 text-[11px] font-semibold text-slate-600">
          +{extraProjects} more project{extraProjects === 1 ? "" : "s"}
        </div>
      )}
    </div>
  ));

  const folderItems: (ReactNode | null)[] =
    projectCards.length === 0
      ? [
          null,
          (
            <div
              key="empty"
              className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/70 p-4 text-center text-xs font-medium text-slate-500"
            >
              No projects linked yet.
            </div>
          ),
          null,
        ]
      : projectCards.length === 1
      ? [null, projectCards[0], null]
      : projectCards.length === 2
      ? [projectCards[0], projectCards[1], null]
      : projectCards.slice(0, 3);

  return (
    <div className="flex w-full max-w-[360px] flex-col items-center gap-5 text-center">
      <Folder color={folderColors[goal.priority]} items={folderItems} />
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-100">
          {goal.emoji && (
            <span className="text-xl" aria-hidden>
              {goal.emoji}
            </span>
          )}
          <span className="max-w-[280px] truncate">{goal.title}</span>
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
          <span
            className={cn(
              "rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide",
              priorityBadgeClasses[goal.priority]
            )}
          >
            {goal.priority}
          </span>
        </div>
      </div>
      <div className="flex w-full max-w-[300px] flex-col gap-3 text-left text-slate-200">
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-full rounded-full bg-slate-100 transition-all duration-300"
              style={{ width: `${goal.progress}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
            <span>Progress</span>
            <span>{goal.progress}%</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          {dueDateLabel && (
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3 text-slate-500" aria-hidden />
              Due {dueDateLabel}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock3 className="h-3 w-3 text-slate-500" aria-hidden />
            Updated {updatedAtLabel ?? "—"}
          </span>
        </div>
        <div className="text-[11px] text-slate-400">
          {goal.projects.length > 0 ? (
            <>
              {goal.projects.length} linked project
              {goal.projects.length === 1 ? "" : "s"}
              {extraProjects > 0 && (
                <>
                  {" "}• +{extraProjects} more project{extraProjects === 1 ? "" : "s"} not shown
                </>
              )}
            </>
          ) : (
            "No projects linked yet."
          )}
        </div>
      </div>
      <div className="mt-2 flex w-full max-w-[300px] gap-2">
        <button
          type="button"
          onClick={handleEdit}
          className={cn(
            "flex-1 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition",
            "hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1 focus:ring-offset-slate-900"
          )}
        >
          Edit Goal
        </button>
        <button
          type="button"
          onClick={handleToggleActive}
          className={cn(
            "flex-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-100 transition",
            "hover:border-slate-100 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1 focus:ring-offset-slate-900"
          )}
        >
          {goal.active ? "Mark Inactive" : "Mark Active"}
        </button>
      </div>
    </div>
  );
}
