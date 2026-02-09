"use client";

import { useCallback, useMemo, useRef, type PointerEvent } from "react";
import { ProjectRow, type ProjectCardMorphOrigin } from "./ProjectRow";
import type { Project } from "../types";
import { Progress } from "@/components/ui/Progress";

interface ProjectsDropdownProps {
  id: string;
  goalId?: string;
  goalTitle: string;
  projects: Project[];
  loading: boolean;
  onProjectLongPress?: (project: Project, origin: ProjectCardMorphOrigin | null) => void;
  onProjectUpdated?: (projectId: string, updates: Partial<Project>) => void;
  projectTasksOnly?: boolean;
  onAddProject?: () => void;
  addingProject?: boolean;
  onTaskToggleCompletion?: (
    goalId: string,
    projectId: string,
    taskId: string,
    currentStage: string
  ) => void;
}

const LONG_PRESS_MS = 650;
const DOUBLE_TAP_MS = 325;

export function ProjectsDropdown({
  id,
  goalId,
  goalTitle,
  projects,
  loading,
  onProjectLongPress,
  onProjectUpdated,
  projectTasksOnly = false,
  onAddProject,
  addingProject = false,
  onTaskToggleCompletion,
}: ProjectsDropdownProps) {
  const taskEntries = useMemo(() => {
    if (!projectTasksOnly) {
      return [] as TaskEntry[];
    }
    return projects.flatMap((project) =>
      project.tasks.map((task) => ({ project, task }))
    );
  }, [projects, projectTasksOnly]);

  return (
    <div
      id={id}
      role="region"
      aria-label={`Projects for ${goalTitle}`}
      className="overflow-hidden px-5 pb-5 pt-4"
    >
      <div className="space-y-4 text-sm text-white/70">
        {loading ? (
          <Progress
            value={100}
            className="mb-2 h-1.5"
            trackClass="bg-white/10"
            barClass="bg-gradient-to-r from-fuchsia-500 via-sky-400 to-lime-300 animate-pulse"
          />
        ) : projectTasksOnly ? (
          taskEntries.length > 0 ? (
            <div className="space-y-3">
              {taskEntries.map(({ project, task }) => (
                <TaskRow
                  key={`${project.id}-${task.id}`}
                  project={project}
                  goalId={goalId ?? ""}
                  task={task}
                  onTaskToggleCompletion={onTaskToggleCompletion}
                  onProjectLongPress={onProjectLongPress}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/20 px-4 py-3 text-sm text-white/60">
              No tasks available for these projects yet.
            </div>
          )
        ) : projects.length > 0 ? (
          <div className="space-y-2">
            {projects.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                onLongPress={onProjectLongPress}
                onUpdated={onProjectUpdated}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/20 px-4 py-3 text-sm text-white/60">
            No projects linked yet. Head to Projects to tether the first track.
          </div>
        )}
        <button
          type="button"
          onClick={onAddProject}
          disabled={addingProject || !onAddProject}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.07] px-4 py-3 text-xs font-semibold uppercase tracking-[0.28em] text-white/80 transition hover:border-white/30 hover:bg-white/[0.12] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {addingProject ? "Adding project" : "Add a new project"}
        </button>
      </div>
    </div>
  );
}

type TaskEntry = {
  project: Project;
  task: TaskLite;
};

type TaskLite = {
  id: string;
  name: string;
  stage: string;
};

interface TaskRowProps {
  goalId: string;
  project: Project;
  task: TaskLite;
  onTaskToggleCompletion?: (
    goalId: string,
    projectId: string,
    taskId: string,
    currentStage: string
  ) => void;
  onProjectLongPress?: (project: Project, origin: ProjectCardMorphOrigin | null) => void;
}

function TaskRow({
  goalId,
  project,
  task,
  onTaskToggleCompletion,
  onProjectLongPress,
}: TaskRowProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const originRef = useRef<HTMLButtonElement | null>(null);
  const lastTapTimeRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const triggerLongPress = useCallback(() => {
    longPressTriggeredRef.current = true;
    const element = originRef.current;
    const origin = buildOrigin(element, project);
    onProjectLongPress?.(project, origin);
    originRef.current = null;
  }, [onProjectLongPress, project]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      originRef.current = event.currentTarget;
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        triggerLongPress();
      }, LONG_PRESS_MS);
    },
    [clearTimer, triggerLongPress]
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      clearTimer();
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
      }
      const now = Date.now();
      if (now - lastTapTimeRef.current <= DOUBLE_TAP_MS) {
        lastTapTimeRef.current = 0;
        event.preventDefault();
        if (onTaskToggleCompletion && goalId && project.id && task.id) {
          onTaskToggleCompletion(goalId, project.id, task.id, task.stage);
        }
        return;
      }
      lastTapTimeRef.current = now;
    },
    [clearTimer, goalId, onTaskToggleCompletion, project.id, task.id, task.stage]
  );

  const handlePointerCancel = useCallback(() => {
    clearTimer();
    longPressTriggeredRef.current = false;
  }, [clearTimer]);

  const completed = task.stage === "PERFECT";

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
      className={`flex w-full flex-col gap-2 rounded-[26px] border px-5 py-4 text-left transition-transform duration-200 ${
        completed
          ? "border-emerald-400/60 bg-[linear-gradient(135deg,_rgba(6,78,59,0.96)_0%,_rgba(4,120,87,0.94)_42%,_rgba(16,185,129,0.9)_100%)] text-emerald-50 shadow-[0_22px_42px_rgba(4,47,39,0.55)] ring-1 ring-emerald-300/60 backdrop-blur hover:-translate-y-1 hover:shadow-[0_35px_50px_rgba(4,47,39,0.65)]"
          : "border-white/10 bg-gradient-to-br from-white/[0.08] to-black/20 text-white shadow-[0_25px_40px_rgba(0,0,0,0.55),inset_0_-2px_1px_rgba(255,255,255,0.1)] hover:-translate-y-1 hover:shadow-[0_35px_50px_rgba(0,0,0,0.65),inset_0_-2px_2px_rgba(255,255,255,0.2)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold leading-tight">{task.name}</span>
        <span className="text-[10px] uppercase tracking-[0.3em] text-white/60">
          {task.stage}
        </span>
      </div>
    </button>
  );
}

function buildOrigin(
  element: HTMLElement | null,
  project: Project
): ProjectCardMorphOrigin | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const computed = window.getComputedStyle(element);
  const radius = computed.borderRadius?.trim().length
    ? computed.borderRadius
    : [
        computed.borderTopLeftRadius,
        computed.borderTopRightRadius,
        computed.borderBottomRightRadius,
        computed.borderBottomLeftRadius,
      ]
        .filter(Boolean)
        .join(" ") || "0px";
  const backgroundColor =
    computed.backgroundColor &&
    computed.backgroundColor !== "rgba(0, 0, 0, 0)" &&
    computed.backgroundColor.toLowerCase() !== "transparent"
      ? computed.backgroundColor
      : undefined;
  const boxShadow = computed.boxShadow && computed.boxShadow !== "none" ? computed.boxShadow : undefined;

  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    borderRadius: radius,
    backgroundColor,
    boxShadow,
    emoji: project.emoji,
  };
}
