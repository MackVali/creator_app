"use client";

import type { ReactNode } from "react";
import { Folder } from "./Folder";
import type { Goal, Project } from "@/app/(app)/goals/types";
import { cn } from "@/lib/utils";

type GoalFolderCardProps = {
  goal: Goal;
  onEdit?: () => void;
  onToggleActive?: () => void;
  size?: number;
  className?: string;
};

const darkGrayGradient =
  "linear-gradient(145deg, #D1D5DB 0%, #9CA3AF 45%, #4B5563 100%)";

const folderThemes: Record<Goal["priority"], { base: string; gradient: string }> = {
  High: { base: "#6B7280", gradient: darkGrayGradient },
  Medium: { base: "#6B7280", gradient: darkGrayGradient },
  Low: { base: "#6B7280", gradient: darkGrayGradient },
};

const MAX_FOLDER_SHEETS = 5;

function groupProjectsBySheet(projects: Project[]) {
  if (!projects.length) {
    return [] as Project[][];
  }

  const sheetCount = Math.min(MAX_FOLDER_SHEETS, projects.length);
  const grouped: Project[][] = [];
  let cursor = 0;

  for (let index = 0; index < sheetCount; index += 1) {
    const remaining = projects.length - cursor;
    const slotsLeft = sheetCount - index;
    const chunkSize = Math.ceil(remaining / slotsLeft);
    grouped.push(projects.slice(cursor, cursor + chunkSize));
    cursor += chunkSize;
  }

  return grouped;
}

export function GoalFolderCard({
  goal,
  onEdit: _onEdit,
  onToggleActive: _onToggleActive,
  size = 0.42,
  className,
}: GoalFolderCardProps) {
  void _onEdit;
  void _onToggleActive;
  const theme = folderThemes[goal.priority] ?? folderThemes.High;
  const groupedProjects = groupProjectsBySheet(goal.projects);

  const folderItems: ReactNode[] = groupedProjects.length
    ? groupedProjects.map((sheet, sheetIndex) => (
        <div
          key={sheet[0]?.id ?? `sheet-${sheetIndex}`}
          className="flex h-full w-full flex-col text-left text-slate-900"
        >
          <div className="flex-1 overflow-hidden rounded-xl border border-slate-200/60 bg-white/85 p-1.5 shadow-sm">
            <div className="grid h-full grid-cols-2 gap-1 overflow-y-auto pr-0.5">
              {sheet.map((project) => (
                <div
                  key={project.id}
                  className="flex aspect-square items-center justify-center rounded-lg bg-white text-center text-[9px] font-semibold leading-tight text-slate-900 shadow"
                >
                  <span className="line-clamp-3 px-1">{project.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))
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
    <div
      className={cn(
        "flex w-full flex-col items-center gap-2 text-center",
        className,
      )}
    >
      <Folder
        color={theme.base}
        gradient={theme.gradient}
        items={folderItems}
        size={size}
        label={folderLabel}
      />
    </div>
  );
}
