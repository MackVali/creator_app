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
          <div className="flex-1 overflow-hidden rounded-xl border border-slate-200/70 bg-white/90 p-2 shadow-sm">
            <ul className="flex h-full flex-col gap-2 overflow-y-auto pr-1">
              {sheet.map((project) => {
                const meta: string[] = [project.status];
                if (project.energy && project.energy !== "No") {
                  meta.push(`${project.energy} energy`);
                }

                return (
                  <li
                    key={project.id}
                    className="rounded-lg border border-slate-200/70 bg-white px-2 py-1.5 shadow-sm"
                  >
                    <p className="text-[11px] font-semibold leading-snug">
                      {project.name}
                    </p>
                    {meta.length ? (
                      <p className="mt-1 text-[9px] font-medium uppercase tracking-wide text-slate-500">
                        {meta.join(" • ")}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
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
