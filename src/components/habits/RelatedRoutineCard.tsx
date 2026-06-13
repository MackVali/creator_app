"use client";

import clsx from "clsx";
import { Folder } from "@/components/goals/Folder";

export type RelatedRoutineCardHabit = {
  id: string;
  name: string;
  dueLabel?: string | null;
  skillIcon?: string | null;
};

export type RelatedRoutineCardRoutine = {
  id: string;
  name: string;
  description?: string | null;
  habits: RelatedRoutineCardHabit[];
};

type RelatedRoutineCardProps = {
  routine: RelatedRoutineCardRoutine;
  density: "large" | "small";
  fallbackIcon?: string;
};

const routineFolderGradient =
  "linear-gradient(145deg,#D1D5DB 0%,#9CA3AF 46%,#4B5563 100%)";
const routineFolderBase = "#6B7280";

function getRoutineInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "RT";
}

function groupRoutineHabits(habits: RelatedRoutineCardHabit[]) {
  if (habits.length === 0) return [];

  const sheetCount = Math.min(5, habits.length);
  const grouped: RelatedRoutineCardHabit[][] = [];
  let cursor = 0;

  for (let index = 0; index < sheetCount; index += 1) {
    const remaining = habits.length - cursor;
    const slotsLeft = sheetCount - index;
    const chunkSize = Math.ceil(remaining / slotsLeft);
    grouped.push(habits.slice(cursor, cursor + chunkSize));
    cursor += chunkSize;
  }

  return grouped;
}

export function RelatedRoutineCard({
  routine,
  density,
  fallbackIcon = "💡",
}: RelatedRoutineCardProps) {
  const isSmall = density === "small";
  const routineName = routine.name?.trim() || "Untitled routine";
  const routineHabits = Array.isArray(routine.habits) ? routine.habits : [];
  const groupedHabits = groupRoutineHabits(routineHabits);
  const habitCount = routineHabits.length;
  const labelIcon = getRoutineInitials(routineName);
  const folderItems =
    groupedHabits.length > 0
      ? groupedHabits.map((sheet, sheetIndex) => (
          <div
            key={sheet[0]?.id ?? `routine-sheet-${sheetIndex}`}
            className="grid h-full w-full grid-cols-2 gap-1 overflow-y-auto text-left text-slate-900"
          >
            {sheet.map((habit) => (
              <div
                key={habit.id}
                className="flex min-h-0 flex-col items-center justify-center rounded-lg bg-white px-1 py-1 text-center text-[8px] font-semibold leading-tight text-slate-900 shadow"
                title={habit.name}
              >
                <span className="leading-none" aria-hidden="true">
                  {habit.skillIcon || fallbackIcon}
                </span>
                <span className="mt-0.5 line-clamp-2 break-words">
                  {habit.name}
                </span>
              </div>
            ))}
          </div>
        ))
      : [
          <div
            key="empty-routine"
            className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-slate-300/70 bg-white/75 p-2 text-center text-[9px] font-medium text-slate-500"
          >
            No habits linked yet.
          </div>,
        ];

  const folderLabel = (
    <div className="flex min-w-0 flex-col items-center gap-0.5">
      <span className="folder-label-text text-[10px] font-semibold uppercase tracking-[0.1em]">
        {routineName}
      </span>
      <span className="whitespace-nowrap text-[7px] font-semibold uppercase tracking-[0.18em] text-slate-600">
        {habitCount} {habitCount === 1 ? "Habit" : "Habits"}
      </span>
    </div>
  );

  return (
    <div
      className={clsx(
        "goal-card group relative flex aspect-[5/6] w-full transform-gpu flex-col items-center justify-center overflow-visible border border-white/10 bg-[#0A0B0F]/88 text-white shadow-[0_10px_26px_-14px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.06)] transition duration-200 select-none hover:-translate-y-0.5 hover:border-white/18",
        isSmall
          ? "min-h-[70px] rounded-xl p-1 sm:min-h-[82px]"
          : "min-h-[96px] rounded-2xl p-2 sm:p-2.5"
      )}
      title={`${routineName} routine`}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.10),transparent_60%)] [mask-image:linear-gradient(to_bottom,black,transparent_72%)]" />
      <span
        className={clsx(
          "pointer-events-none absolute right-1.5 top-1.5 z-[8] rounded-full border border-white/10 bg-black/30 font-semibold uppercase leading-none tracking-[0.12em] text-white/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
          isSmall ? "px-1 py-0.5 text-[6px]" : "px-1.5 py-0.5 text-[7px]"
        )}
      >
        Routine
      </span>
      <Folder
        color={routineFolderBase}
        gradient={routineFolderGradient}
        items={folderItems}
        size={isSmall ? 0.31 : 0.42}
        ariaLabel={`${routineName}. Routine with ${habitCount} ${
          habitCount === 1 ? "habit" : "habits"
        }.`}
        label={
          <div className="flex items-center gap-1.5">
            <span aria-hidden="true">{labelIcon}</span>
            {folderLabel}
          </div>
        }
        bareItems
      />
    </div>
  );
}

export default RelatedRoutineCard;
