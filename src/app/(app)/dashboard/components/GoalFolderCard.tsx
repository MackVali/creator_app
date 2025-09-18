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

const gemstoneGradient =
  "linear-gradient(140deg, #16092B 0%, #301352 38%, #4C1E78 66%, #9B55F5 100%)";

const folderThemes: Record<Goal["priority"], { base: string; gradient: string }> = {
  High: { base: "#150828", gradient: gemstoneGradient },
  Medium: { base: "#16092B", gradient: gemstoneGradient },
  Low: { base: "#150828", gradient: gemstoneGradient },
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
  const projectsToShow = goal.projects.slice(0, 5);
  const extraProjects = Math.max(goal.projects.length - projectsToShow.length, 0);
  const theme = folderThemes[goal.priority] ?? folderThemes.High;

  const handleEdit = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onEdit?.();
  };

  const handleToggleActive = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onToggleActive?.();
  };

  const projectCards: ReactNode[] = projectsToShow.map((project, index) => {
    const showOverflow = index === projectsToShow.length - 1 && extraProjects > 0;

    return (
      <div
        className="flex h-full w-full flex-col text-left text-slate-900"
        key={project.id}
      >
        <p className="min-w-0 flex-1 whitespace-normal break-words text-xs font-semibold leading-snug">
          {project.name}
        </p>
        {showOverflow && (
          <div className="mt-3 rounded-md bg-slate-100/90 px-2 py-1 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-600">
            +{extraProjects} more
          </div>
        )}
      </div>
    );
  });

  const folderItems: ReactNode[] =
    projectCards.length > 0
      ? projectCards
      : [
          <div
            key="empty"
            className="flex h-full w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-300/70 bg-white/75 p-3 text-center text-[10px] font-medium text-slate-500"
          >
            No projects linked yet.
          </div>,
        ];

  const folderLabel = (
    <div className="flex items-center gap-1.5">
      {goal.emoji ? (
        <span className="text-lg leading-none" aria-hidden>
          {goal.emoji}
        </span>
      ) : null}
      <span className="folder-label-text text-[11px] font-semibold uppercase tracking-[0.12em]">
        {goal.title}
      </span>
    </div>
  );

  return (
    <div className="flex w-full max-w-[260px] flex-col items-center gap-4 text-center">
      <Folder
        color={theme.base}
        gradient={theme.gradient}
        items={folderItems}
        size={0.48}
        label={folderLabel}
      />
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex flex-wrap justify-center gap-1.5">
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
      <div className="flex w-full max-w-[220px] flex-col gap-2 text-left text-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] text-slate-400">
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
        <div className="text-[10px] text-slate-400">
          {goal.projects.length > 0 ? (
            <>
              {goal.projects.length} linked project
              {goal.projects.length === 1 ? "" : "s"}
              {extraProjects > 0 && (
                <>
                  {" "}• +{extraProjects} more not shown
                </>
              )}
            </>
          ) : (
            "No projects linked yet."
          )}
        </div>
      </div>
      <div className="mt-2 flex w-full max-w-[220px] gap-2">
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
