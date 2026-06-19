"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { Plus } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  getProjectTasksListClasses,
  MAX_VISIBLE_PROJECT_TASKS,
  ProjectRow,
  ProjectTasksList,
  useProjectRowTaskInteractions,
  type ProjectCardMorphOrigin,
} from "./ProjectRow";
import type { Project, Task } from "../types";
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

const completedProjectsRevealMotion = {
  hidden: {
    opacity: 0,
    height: 0,
    y: -8,
  },
  visible: {
    opacity: 1,
    height: "auto",
    y: 0,
    transition: {
      height: { duration: 0.52, ease: [0.16, 1, 0.3, 1] },
      opacity: { duration: 0.32, ease: "easeOut", delay: 0.08 },
      y: { duration: 0.52, ease: [0.16, 1, 0.3, 1] },
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    y: -6,
    transition: {
      height: { duration: 0.42, ease: [0.33, 0, 0.2, 1] },
      opacity: { duration: 0.24, ease: "easeOut" },
      y: { duration: 0.42, ease: [0.33, 0, 0.2, 1] },
    },
  },
} as const;

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
  const prefersReducedMotion = useReducedMotion();
  const [showCompletedProjects, setShowCompletedProjects] = useState(false);
  const selectedProject = useMemo(
    () => (projectTasksOnly ? projects[0] ?? null : null),
    [projectTasksOnly, projects]
  );
  const [activeProjects, completedProjects] = useMemo(() => {
    const active: Project[] = [];
    const completed: Project[] = [];

    for (const project of projects) {
      if (isProjectCompleted(project)) {
        completed.push(project);
      } else {
        active.push(project);
      }
    }

    return [active, completed] as const;
  }, [projects]);

  useEffect(() => {
    if (completedProjects.length === 0) {
      setShowCompletedProjects(false);
    }
  }, [completedProjects.length]);

  const completedProjectsRegionId = `${id}-completed-projects`;
  const completedProjectsToggleLabel = `${
    showCompletedProjects ? "Hide completed Projects" : "Show completed Projects"
  } (${completedProjects.length})`;

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
          selectedProject && selectedProject.tasks.length > 0 ? (
            <ProjectTasksOnlyRows
              project={selectedProject}
              goalId={goalId ?? ""}
              onTaskToggleCompletion={onTaskToggleCompletion}
              onProjectLongPress={onProjectLongPress}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-white/20 px-4 py-3 text-sm text-white/60">
              No tasks available for these projects yet.
            </div>
          )
        ) : projects.length > 0 ? (
          <div className="space-y-1 sm:space-y-1.5">
            {activeProjects.map((p, index) => (
              <ProjectRow
                key={p.id}
                project={p}
                projectOrder={index + 1}
                variant="compactNested"
                onLongPress={onProjectLongPress}
                onUpdated={onProjectUpdated}
              />
            ))}
            {completedProjects.length > 0 ? (
              <button
                type="button"
                aria-expanded={showCompletedProjects}
                aria-controls={completedProjectsRegionId}
                onClick={() =>
                  setShowCompletedProjects((current) => !current)
                }
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-medium text-white/45 transition hover:bg-white/[0.03] hover:text-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
              >
                <span>{completedProjectsToggleLabel}</span>
              </button>
            ) : null}
            <AnimatePresence initial={false}>
              {showCompletedProjects ? (
                <motion.div
                  id={completedProjectsRegionId}
                  className="flex flex-col gap-1 overflow-hidden sm:gap-1.5"
                  initial={prefersReducedMotion ? { opacity: 0 } : "hidden"}
                  animate={prefersReducedMotion ? { opacity: 1 } : "visible"}
                  exit={prefersReducedMotion ? { opacity: 0 } : "exit"}
                  variants={
                    prefersReducedMotion ? undefined : completedProjectsRevealMotion
                  }
                  transition={
                    prefersReducedMotion ? { duration: 0.12 } : undefined
                  }
                >
                  {completedProjects.map((p, index) => (
                    <ProjectRow
                      key={p.id}
                      project={p}
                      projectOrder={activeProjects.length + index + 1}
                      variant="compactNested"
                      onLongPress={onProjectLongPress}
                      onUpdated={onProjectUpdated}
                    />
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
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
                  ? "adding TASK"
                  : "adding PROJECT"
                : projectTasksOnly
                  ? "add TASK"
                  : "add PROJECT"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProjectTasksOnlyRowsProps {
  goalId: string;
  project: Project;
  onTaskToggleCompletion?: (
    goalId: string,
    projectId: string,
    taskId: string,
    currentStage: string
  ) => void;
  onProjectLongPress?: (
    project: Project,
    origin: ProjectCardMorphOrigin | null
  ) => void;
}

function ProjectTasksOnlyRows({
  goalId,
  project,
  onTaskToggleCompletion,
  onProjectLongPress,
}: ProjectTasksOnlyRowsProps) {
  const taskInteractionContext = useProjectRowTaskInteractions();
  const resolvedGoalId = goalId || taskInteractionContext.goalId || "";
  const onTaskEditOpen = taskInteractionContext.onTaskEditOpen;
  const resolvedTaskToggleCompletion =
    onTaskToggleCompletion ?? taskInteractionContext.onTaskToggleCompletion;
  const taskSingleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const taskLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const taskLongPressTriggeredRef = useRef(false);
  const taskOriginRef = useRef<HTMLButtonElement | null>(null);
  const lastTaskTapRef = useRef<{ taskId: string; time: number } | null>(null);

  useEffect(
    () => () => {
      if (taskSingleTapTimeoutRef.current) {
        clearTimeout(taskSingleTapTimeoutRef.current);
      }
      if (taskLongPressTimerRef.current) {
        clearTimeout(taskLongPressTimerRef.current);
      }
    },
    []
  );

  const [visibleTasks, hiddenCount] = useMemo(() => {
    const slice = project.tasks.slice(0, MAX_VISIBLE_PROJECT_TASKS);
    return [slice, project.tasks.length - slice.length] as const;
  }, [project.tasks]);

  const {
    tertiaryTextClass,
    completedTaskRowClass,
    incompleteTaskRowClass,
    completedTaskMarkerClass,
    incompleteTaskMarkerClass,
  } = getProjectTasksListClasses(isProjectCompleteForTaskRows(project));

  const cancelTaskSingleTap = useCallback(() => {
    if (taskSingleTapTimeoutRef.current) {
      clearTimeout(taskSingleTapTimeoutRef.current);
      taskSingleTapTimeoutRef.current = null;
    }
  }, []);

  const cancelTaskLongPress = useCallback(() => {
    if (taskLongPressTimerRef.current) {
      clearTimeout(taskLongPressTimerRef.current);
      taskLongPressTimerRef.current = null;
    }
  }, []);

  const openTaskEditor = useCallback(
    (task: Task, element: HTMLElement | null) => {
      onTaskEditOpen?.(task, project, buildTaskOrigin(element, project));
    },
    [onTaskEditOpen, project]
  );

  const openProjectEditor = useCallback(() => {
    taskLongPressTriggeredRef.current = true;
    const origin = buildTaskOrigin(taskOriginRef.current, project);
    onProjectLongPress?.(project, origin);
    taskOriginRef.current = null;
  }, [onProjectLongPress, project]);

  const handleTaskPointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      cancelTaskSingleTap();
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      taskOriginRef.current = event.currentTarget;
      taskLongPressTriggeredRef.current = false;
      cancelTaskLongPress();
      if (onProjectLongPress) {
        taskLongPressTimerRef.current = setTimeout(() => {
          taskLongPressTimerRef.current = null;
          openProjectEditor();
        }, LONG_PRESS_MS);
      }
    },
    [
      cancelTaskLongPress,
      cancelTaskSingleTap,
      onProjectLongPress,
      openProjectEditor,
    ]
  );

  const handleTaskPointerUp = useCallback(
    (event: PointerEvent<HTMLButtonElement>, task: Task) => {
      event.stopPropagation();
      cancelTaskLongPress();
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      if (taskLongPressTriggeredRef.current) {
        taskLongPressTriggeredRef.current = false;
        taskOriginRef.current = null;
        event.preventDefault();
        return;
      }

      const now = Date.now();
      const lastTaskTap = lastTaskTapRef.current;
      if (
        lastTaskTap?.taskId === task.id &&
        now - lastTaskTap.time <= DOUBLE_TAP_MS
      ) {
        lastTaskTapRef.current = null;
        cancelTaskSingleTap();
        event.preventDefault();
        if (
          resolvedTaskToggleCompletion &&
          resolvedGoalId &&
          project.id &&
          task.id
        ) {
          resolvedTaskToggleCompletion(
            resolvedGoalId,
            project.id,
            task.id,
            task.stage
          );
        }
        return;
      }

      lastTaskTapRef.current = { taskId: task.id, time: now };
      cancelTaskSingleTap();
      const element = event.currentTarget;
      taskOriginRef.current = null;
      taskSingleTapTimeoutRef.current = setTimeout(() => {
        if (lastTaskTapRef.current?.taskId !== task.id) {
          taskSingleTapTimeoutRef.current = null;
          return;
        }
        lastTaskTapRef.current = null;
        openTaskEditor(task, element);
        taskSingleTapTimeoutRef.current = null;
      }, DOUBLE_TAP_MS);
    },
    [
      cancelTaskLongPress,
      cancelTaskSingleTap,
      openTaskEditor,
      project.id,
      resolvedGoalId,
      resolvedTaskToggleCompletion,
    ]
  );

  const handleTaskPointerCancel = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      cancelTaskLongPress();
      taskLongPressTriggeredRef.current = false;
      taskOriginRef.current = null;
    },
    [cancelTaskLongPress]
  );

  const handleTaskClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>, task: Task) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.detail === 0) {
        cancelTaskSingleTap();
        lastTaskTapRef.current = null;
        openTaskEditor(task, event.currentTarget);
      }
    },
    [cancelTaskSingleTap, openTaskEditor]
  );

  return (
    <div className="relative">
      <ProjectTasksList
        visibleTasks={visibleTasks}
        hiddenCount={hiddenCount}
        tertiaryTextClass={tertiaryTextClass}
        completedTaskRowClass={completedTaskRowClass}
        incompleteTaskRowClass={incompleteTaskRowClass}
        completedTaskMarkerClass={completedTaskMarkerClass}
        incompleteTaskMarkerClass={incompleteTaskMarkerClass}
        isTaskCompleted={(task) =>
          Boolean(task.completedAt) || task.stage === "PERFECT"
        }
        onTaskPointerDown={handleTaskPointerDown}
        onTaskPointerUp={handleTaskPointerUp}
        onTaskPointerCancel={handleTaskPointerCancel}
        onTaskPointerLeave={handleTaskPointerCancel}
        onTaskClick={handleTaskClick}
      />
    </div>
  );
}

function isProjectCompleteForTaskRows(project: Project) {
  return (
    project.status === "Done" ||
    project.stage === "RELEASE" ||
    Number(project.progress ?? 0) >= 100
  );
}

function isProjectCompleted(project: Project) {
  const projectWithCompletion = project as Project & {
    completedAt?: string | null;
    completed_at?: string | null;
  };

  return (
    project.status === "Done" ||
    project.stage === "RELEASE" ||
    Number(project.progress ?? 0) >= 100 ||
    Boolean(projectWithCompletion.completedAt) ||
    Boolean(projectWithCompletion.completed_at)
  );
}

function buildTaskOrigin(
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
  const boxShadow =
    computed.boxShadow && computed.boxShadow !== "none"
      ? computed.boxShadow
      : undefined;

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
