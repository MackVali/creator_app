"use client";

import type { ReactNode } from "react";
import { Folder } from "./Folder";
import type { Goal } from "@/app/(app)/goals/types";

type GoalFolderCardProps = {
  goal: Goal;
  onEdit?: () => void;
  onToggleActive?: () => void;
};

const darkGrayGradient =
  "linear-gradient(145deg, #D1D5DB 0%, #9CA3AF 45%, #4B5563 100%)";

const folderThemes: Record<Goal["priority"], { base: string; gradient: string }> = {
  High: { base: "#6B7280", gradient: darkGrayGradient },
  Medium: { base: "#6B7280", gradient: darkGrayGradient },
  Low: { base: "#6B7280", gradient: darkGrayGradient },
};

export function GoalFolderCard({
  goal,
  onEdit: _onEdit,
  onToggleActive: _onToggleActive,
}: GoalFolderCardProps) {
  void _onEdit;
  void _onToggleActive;
  const projectsToShow = goal.projects.slice(0, 5);
  const extraProjects = Math.max(goal.projects.length - projectsToShow.length, 0);
  const theme = folderThemes[goal.priority] ?? folderThemes.High;

  const projectCards: ReactNode[] = projectsToShow.map((project, index) => {
    const showOverflow = index === projectsToShow.length - 1 && extraProjects > 0;

    return (
      <div
        className="flex h-full w-full flex-col text-left text-slate-900"
        key={project.id}
      >
        <p className="min-w-0 flex-1 whitespace-normal break-words text-[11px] font-semibold leading-snug">
          {project.name}
        </p>
        {showOverflow && (
          <div className="mt-2 rounded-md bg-slate-100/90 px-1.5 py-1 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-600">
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
    <div className="flex w-full flex-col items-center gap-2 text-center">
      <Folder
        color={theme.base}
        gradient={theme.gradient}
        items={folderItems}
        size={0.42}
        label={folderLabel}
      />
    </div>
  );
}
