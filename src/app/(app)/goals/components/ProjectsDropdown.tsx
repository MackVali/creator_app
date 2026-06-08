"use client";

import { useCallback, useMemo, useRef, type PointerEvent } from "react";
import { Plus } from "lucide-react";
import { ProjectRow, type ProjectCardMorphOrigin } from "./ProjectRow";
import type { Project } from "../types";
import { Progress } from "@/components/ui/Progress";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";

interface ProjectsDropdownProps {
  id: string;
  goalId?: string;
  goalTitle: string;
  projects: Project[];
  loading: boolean;
  onProjectLongPress?: (project: Project, origin: ProjectCardMorphOrigin | null) => void;
  onProjectUpdated?: (projectId: string, updates: Partial<Project>) => void;
  projectTasksOnly?: boolean;
  onAddProject?: (originRect?: DOMRect) => void;
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

const energyCodeToFlameLevel = (value?: string | null): FlameLevel => {
  switch (value?.toUpperCase()) {
    case "LOW":
      return "LOW";
    case "MEDIUM":
      return "MEDIUM";
    case "HIGH":
      return "HIGH";
    case "ULTRA":
      return "ULTRA";
    case "EXTREME":
      return "EXTREME";
    default:
      return "NO";
  }
};

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
  const selectedProject = useMemo(
    () => (projectTasksOnly ? projects[0] ?? null : null),
    [projectTasksOnly, projects]
  );

  const taskEntries = useMemo(() => {
    if (!projectTasksOnly) {
      return [] as TaskEntry[];
    }
    if (!selectedProject) {
      return [] as TaskEntry[];
    }
    return selectedProject.tasks.map((task) => ({ project: selectedProject, task }));
  }, [projectTasksOnly, selectedProject]);

  return (
    <div
      id={id}
      role="region"
      aria-label={
        projectTasksOnly ? `Tasks for ${goalTitle}` : `Projects for ${goalTitle}`
      }
      className="overflow-hidden px-1.5 pb-2.5 pt-1.5 sm:px-2 sm:pb-3 sm:pt-2"
    >
      <div className="space-y-2.5 text-sm text-white/70">
        {loading ? (
          <Progress
            value={100}
            className="mb-2 h-1.5"
            trackClass="bg-white/10"
            barClass="bg-gradient-to-r from-fuchsia-500 via-sky-400 to-lime-300 animate-pulse"
          />
        ) : projectTasksOnly ? (
          taskEntries.length > 0 ? (
            <div className="relative space-y-1.5" role="list">
              <div className="pointer-events-none absolute inset-y-3 left-2 w-px bg-white/10" />
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
          <div className="space-y-1 sm:space-y-1.5">
            {projects.map((p, index) => (
              <ProjectRow
                key={p.id}
                project={p}
                projectOrder={index + 1}
                variant="compactNested"
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
        <div className="pt-1">
          <button
            type="button"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onAddProject?.(event.currentTarget.getBoundingClientRect());
            }}
            disabled={addingProject || !onAddProject}
            className="relative flex w-full items-center gap-2 rounded-lg border border-white/8 bg-[linear-gradient(180deg,rgba(66,66,66,0.18)_0%,rgba(28,28,28,0.74)_100%)] px-2 py-1.5 text-left text-white transition shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/18 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2.5 sm:rounded-xl sm:px-2.5 sm:py-2"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/80 shadow-[inset_0_-1px_0_rgba(255,255,255,0.05)] sm:h-8 sm:w-8">
              <Plus aria-hidden="true" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium leading-tight text-white/84 sm:text-[13px]">
              {addingProject
                ? projectTasksOnly
                  ? "Adding task…"
                  : "Adding project…"
                : projectTasksOnly
                  ? "Add task"
                  : "Add project"}
            </span>
          </button>
        </div>
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
  energyCode?: string | null;
  skillIcon?: string | null;
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
  const taskRowClass = completed
    ? "border-emerald-300/60 bg-[linear-gradient(135deg,rgba(6,78,59,0.96)_0%,rgba(4,120,87,0.9)_48%,rgba(16,185,129,0.84)_100%)] text-emerald-50 ring-1 ring-emerald-200/30 shadow-[0_12px_26px_-16px_rgba(16,185,129,0.72),0_0_22px_rgba(16,185,129,0.14),inset_2px_0_0_rgba(209,250,229,0.24),inset_0_1px_0_rgba(255,255,255,0.14)]"
    : "border-white/8 bg-[linear-gradient(180deg,rgba(66,66,66,0.22)_0%,rgba(46,46,46,0.34)_24%,rgba(24,24,24,0.92)_100%)] text-white/78 shadow-[inset_2px_0_0_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.03)]";
  const markerClass = completed
    ? "border-emerald-50/40 bg-emerald-100/22 text-white shadow-[0_0_12px_rgba(16,185,129,0.28)]"
    : "border-white/10 bg-white/[0.05] text-white/50";

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
      className={`flex w-full min-w-0 items-start gap-2 rounded-lg border px-2 py-1.5 text-left text-xs leading-4 ${taskRowClass}`}
      role="listitem"
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold leading-none ${markerClass}`}
        aria-hidden="true"
      >
        {task.skillIcon ?? (
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        )}
      </span>
      <span className="min-w-0 flex-1 break-words pr-1">{task.name}</span>
      {task.energyCode ? (
        <FlameEmber
          level={energyCodeToFlameLevel(task.energyCode)}
          size="sm"
          className="shrink-0"
        />
      ) : null}
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
