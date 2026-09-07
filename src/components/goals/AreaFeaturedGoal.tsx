"use client";

import { GoalWorkspace } from "@/app/(app)/goals/components/GoalWorkspace";
import type { Goal, Project, Task } from "@/app/(app)/goals/types";
import type { ProjectCardMorphOrigin } from "@/app/(app)/goals/components/ProjectRow";

export type AreaFeaturedGoalControls = {
  onProjectLongPress?: (
    project: Project,
    origin: ProjectCardMorphOrigin | null
  ) => void;
  onProjectUpdated?: (projectId: string, updates: Partial<Project>) => void;
  onTaskEditOpen?: (
    task: Task,
    project: Project,
    origin: ProjectCardMorphOrigin | null
  ) => void;
  onTaskToggleCompletion?: (
    goalId: string,
    projectId: string,
    taskId: string,
    currentCompletedAt: string | null
  ) => void;
  onAddProject?: (originRect?: DOMRect) => void;
  addingProject?: boolean;
};

type AreaFeaturedGoalProps = AreaFeaturedGoalControls & {
  goal: Goal | null;
  areaLabel: string;
  areaEmoji?: string | null;
};

export function AreaFeaturedGoal({
  goal,
  areaEmoji,
  onProjectLongPress,
  onProjectUpdated,
  onTaskEditOpen,
  onTaskToggleCompletion,
  onAddProject,
  addingProject = false,
}: AreaFeaturedGoalProps) {
  if (!goal) return null;

  const icon =
    goal.emoji ?? goal.monumentEmoji ?? areaEmoji ?? goal.title.slice(0, 2);
  const progress = Math.min(Math.max(goal.progress ?? 0, 0), 100);
  const projectCount = goal.projects.length;

  return (
    <section className="relative w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F13] px-3 py-2 text-white shadow-[0_24px_70px_-52px_rgba(0,0,0,0.86),inset_0_1px_0_rgba(255,255,255,0.055),inset_0_-1px_0_rgba(0,0,0,0.48)] sm:px-4 sm:py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.045] text-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:h-10 sm:w-10">
          {icon}
        </div>
        <div className="min-w-0 flex-1 leading-none">
          <h2 className="truncate text-[16px] font-semibold leading-tight tracking-normal text-white sm:text-[18px]">
            {goal.title}
          </h2>
          <p className="mt-0.5 text-[11px] font-medium leading-tight text-white/48">
            {projectCount} {projectCount === 1 ? "project" : "projects"}
          </p>
        </div>
        <div className="shrink-0 pl-1 text-right text-[11px] font-semibold leading-none text-white/56">
          {progress}%
        </div>
      </div>

      <div className="mt-1.5 overflow-visible border-t border-white/[0.07] pt-1.5 sm:pt-2">
        <GoalWorkspace
          goal={goal}
          loading={false}
          alwaysShowNotes
          presentation="area-featured"
          onProjectLongPress={onProjectLongPress}
          onProjectUpdated={onProjectUpdated}
          onAddProject={onAddProject}
          addingProject={addingProject}
          onTaskEditOpen={onTaskEditOpen}
          onTaskToggleCompletion={onTaskToggleCompletion}
        />
      </div>
    </section>
  );
}
