"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, ChevronDown, Plus, Sparkles, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Goal, Project, Task } from "../types";

export interface GoalUpdateContext {
  projects: (Project & { tasks: (Task & { isNew?: boolean })[] })[];
  removedProjectIds: string[];
  removedTaskIds: string[];
}

interface GoalDrawerProps {
  open: boolean;
  onClose(): void;
  /** Callback when creating a new goal */
  onAdd(goal: Goal, context: GoalUpdateContext): void;
  /** Existing goal to edit */
  initialGoal?: Goal | null;
  /** Callback when updating an existing goal */
  onUpdate?(goal: Goal, context: GoalUpdateContext): void;
  monuments?: { id: string; title: string }[];
}

const PRIORITY_OPTIONS: {
  value: Goal["priority"];
  label: string;
  description: string;
}[] = [
  {
    value: "Low",
    label: "Low",
    description: "A gentle intention you can ease into.",
  },
  {
    value: "Medium",
    label: "Medium",
    description: "Important, but with space to breathe.",
  },
  {
    value: "High",
    label: "High",
    description: "Make room and rally your focus here.",
  },
];

const ENERGY_OPTIONS: {
  value: Goal["energy"];
  label: string;
  accent: string;
}[] = [
  { value: "No", label: "No", accent: "bg-white/10" },
  { value: "Low", label: "Low", accent: "from-emerald-400/30 to-teal-500/20" },
  {
    value: "Medium",
    label: "Medium",
    accent: "from-sky-400/30 to-indigo-500/20",
  },
  { value: "High", label: "High", accent: "from-indigo-500/30 to-violet-500/20" },
  { value: "Ultra", label: "Ultra", accent: "from-fuchsia-500/30 to-rose-500/20" },
  {
    value: "Extreme",
    label: "Extreme",
    accent: "from-orange-500/30 to-amber-500/20",
  },
];

const PROJECT_STAGE_OPTIONS = [
  { value: "RESEARCH", label: "Research" },
  { value: "TEST", label: "Test" },
  { value: "BUILD", label: "Build" },
  { value: "REFINE", label: "Refine" },
  { value: "RELEASE", label: "Release" },
];

const TASK_STAGE_OPTIONS = [
  { value: "PREPARE", label: "Prepare" },
  { value: "PRODUCE", label: "Produce" },
  { value: "PERFECT", label: "Perfect" },
];

const DEFAULT_PROJECT_STAGE = "RESEARCH";
const DEFAULT_TASK_STAGE = "PREPARE";

const projectStageToStatus = (stage: string): Project["status"] => {
  switch (stage) {
    case "RESEARCH":
      return "Todo";
    case "RELEASE":
      return "Done";
    default:
      return "In-Progress";
  }
};

const projectStatusToStage = (status: Project["status"]): string => {
  switch (status) {
    case "Todo":
      return "RESEARCH";
    case "Done":
      return "RELEASE";
    default:
      return "BUILD";
  }
};

const energyToDbValue = (energy: Goal["energy"]): string => {
  switch (energy) {
    case "Extreme":
      return "EXTREME";
    case "Ultra":
      return "ULTRA";
    case "High":
      return "HIGH";
    case "Medium":
      return "MEDIUM";
    case "Low":
      return "LOW";
    default:
      return "NO";
  }
};

const computeProjectProgress = (tasks: Task[]): number => {
  if (tasks.length === 0) {
    return 0;
  }
  const completed = tasks.filter((task) => task.stage === "PERFECT").length;
  return Math.round((completed / tasks.length) * 100);
};

const computeGoalProgress = (projects: Project[]): number => {
  if (projects.length === 0) {
    return 0;
  }
  const total = projects.reduce((sum, project) => sum + project.progress, 0);
  return Math.round(total / projects.length);
};

const formatDateForInput = (value?: string | null): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toIsoDateString = (value: string): string | null => {
  if (!value) return null;
  const [yearStr, monthStr, dayStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
};

type EditableTask = Task & { isNew?: boolean; showAdvanced?: boolean };
type EditableProject = Project & {
  tasks: EditableTask[];
  isNew?: boolean;
  showAdvanced?: boolean;
};

export function GoalDrawer({
  open,
  onClose,
  onAdd,
  initialGoal,
  onUpdate,
  monuments = [],
}: GoalDrawerProps) {
  const formId = "goal-editor-form";
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [priority, setPriority] = useState<Goal["priority"]>("Low");
  const [energy, setEnergy] = useState<Goal["energy"]>("No");
  const [active, setActive] = useState(true);
  const [why, setWhy] = useState("");
  const [goalDueDate, setGoalDueDate] = useState<string | null>(null);
  const [goalAdvancedOpen, setGoalAdvancedOpen] = useState(false);
  const [monumentId, setMonumentId] = useState<string>("");
  const [projectsState, setProjectsState] = useState<EditableProject[]>([]);
  const [removedProjectIds, setRemovedProjectIds] = useState<string[]>([]);
  const [removedTaskIds, setRemovedTaskIds] = useState<string[]>([]);

  const editing = Boolean(initialGoal);

  useEffect(() => {
    if (initialGoal) {
      setTitle(initialGoal.title);
      setEmoji(initialGoal.emoji || "");
      setPriority(initialGoal.priority);
      setEnergy(initialGoal.energy);
      setActive(initialGoal.active ?? true);
      setWhy(initialGoal.why || "");
      setGoalDueDate(initialGoal.dueDate ?? null);
      setGoalAdvancedOpen(Boolean(initialGoal.dueDate));
      setMonumentId(initialGoal.monumentId || "");
      setProjectsState(
        (initialGoal.projects || []).map((project) => {
          const stage = project.stage ?? projectStatusToStage(project.status);
          const tasks = (project.tasks || []).map((task) => ({
            ...task,
            dueDate: task.dueDate,
            isNew: false,
            showAdvanced: Boolean(task.dueDate),
          }));
          const progress = computeProjectProgress(tasks);
          return {
            ...project,
            stage,
            status: projectStageToStatus(stage),
            energy: project.energy,
            energyCode: project.energyCode ?? energyToDbValue(project.energy),
            priorityCode: project.priorityCode,
            progress,
            tasks,
            isNew: false,
            showAdvanced: Boolean(project.dueDate),
          } satisfies EditableProject;
        })
      );
    } else {
      setTitle("");
      setEmoji("");
      setPriority("Low");
      setEnergy("No");
      setActive(true);
      setWhy("");
      setGoalDueDate(null);
      setGoalAdvancedOpen(false);
      setMonumentId("");
      setProjectsState([]);
    }
    setRemovedProjectIds([]);
    setRemovedTaskIds([]);
  }, [initialGoal, open]);

  const monumentOptions = useMemo(() => {
    if (!monuments.length) return [] as { id: string; title: string }[];
    return [...monuments].sort((a, b) => a.title.localeCompare(b.title));
  }, [monuments]);

  const goalDueDateValue = formatDateForInput(goalDueDate);

  const projectsValid = projectsState.every((project) => {
    const hasValidName = project.name.trim().length > 0;
    const tasksValid = project.tasks.every(
      (task) => task.name.trim().length > 0
    );
    return hasValidName && tasksValid;
  });

  const canSubmit = title.trim().length > 0 && projectsValid;

  const generateId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  const handleAddProject = () => {
    const stage = DEFAULT_PROJECT_STAGE;
    const nextProject: EditableProject = {
      id: generateId(),
      name: "",
      status: projectStageToStatus(stage),
      progress: 0,
      energy: "No",
      energyCode: energyToDbValue("No"),
      tasks: [],
      stage,
      priorityCode: "NO",
      isNew: true,
      dueDate: undefined,
      showAdvanced: false,
    };
    setProjectsState((projects) => [...projects, nextProject]);
  };

  const handleProjectNameChange = (projectId: string, value: string) => {
    setProjectsState((projects) =>
      projects.map((project) =>
        project.id === projectId ? { ...project, name: value } : project
      )
    );
  };

  const handleProjectStageChange = (projectId: string, stage: string) => {
    setProjectsState((projects) =>
      projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              stage,
              status: projectStageToStatus(stage),
            }
          : project
      )
    );
  };

  const handleProjectEnergyChange = (
    projectId: string,
    energyValue: Goal["energy"]
  ) => {
    setProjectsState((projects) =>
      projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              energy: energyValue,
              energyCode: energyToDbValue(energyValue),
            }
          : project
      )
    );
  };

  const handleGoalDueDateChange = (value: string) => {
    const next = toIsoDateString(value);
    setGoalDueDate(next);
    if (next) {
      setGoalAdvancedOpen(true);
    }
  };

  const clearGoalDueDate = () => {
    setGoalDueDate(null);
  };

  const toggleProjectAdvanced = (projectId: string) => {
    setProjectsState((projects) =>
      projects.map((project) =>
        project.id === projectId
          ? { ...project, showAdvanced: !project.showAdvanced }
          : project
      )
    );
  };

  const handleProjectDueDateChange = (projectId: string, value: string) => {
    const next = toIsoDateString(value);
    setProjectsState((projects) =>
      projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              dueDate: next ?? undefined,
              showAdvanced: next ? true : project.showAdvanced,
            }
          : project
      )
    );
  };

  const clearProjectDueDate = (projectId: string) => {
    setProjectsState((projects) =>
      projects.map((project) =>
        project.id === projectId
          ? { ...project, dueDate: undefined }
          : project
      )
    );
  };

  const toggleTaskAdvanced = (projectId: string, taskId: string) => {
    setProjectsState((projects) =>
      projects.map((project) => {
        if (project.id !== projectId) return project;
        const nextTasks = project.tasks.map((task) =>
          task.id === taskId
            ? { ...task, showAdvanced: !task.showAdvanced }
            : task
        );
        return {
          ...project,
          tasks: nextTasks,
        };
      })
    );
  };

  const handleTaskDueDateChange = (
    projectId: string,
    taskId: string,
    value: string
  ) => {
    const next = toIsoDateString(value);
    setProjectsState((projects) =>
      projects.map((project) => {
        if (project.id !== projectId) return project;
        const nextTasks = project.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                dueDate: next ?? undefined,
                showAdvanced: next ? true : task.showAdvanced,
              }
            : task
        );
        return {
          ...project,
          tasks: nextTasks,
        };
      })
    );
  };

  const clearTaskDueDate = (projectId: string, taskId: string) => {
    setProjectsState((projects) =>
      projects.map((project) => {
        if (project.id !== projectId) return project;
        const nextTasks = project.tasks.map((task) =>
          task.id === taskId ? { ...task, dueDate: undefined } : task
        );
        return {
          ...project,
          tasks: nextTasks,
        };
      })
    );
  };

  const handleRemoveProject = (projectId: string) => {
    let removedProject: EditableProject | null = null;
    setProjectsState((projects) => {
      removedProject = projects.find((project) => project.id === projectId) ?? null;
      return projects.filter((project) => project.id !== projectId);
    });
    if (removedProject && !removedProject.isNew) {
      setRemovedProjectIds((ids) =>
        ids.includes(projectId) ? ids : [...ids, projectId]
      );
      const existingTaskIds = removedProject.tasks
        .filter((task) => !task.isNew)
        .map((task) => task.id);
      if (existingTaskIds.length > 0) {
        setRemovedTaskIds((ids) => {
          const unique = new Set(ids);
          existingTaskIds.forEach((id) => unique.add(id));
          return Array.from(unique);
        });
      }
    }
  };

  const handleAddTask = (projectId: string) => {
    const newTask: EditableTask = {
      id: generateId(),
      name: "",
      stage: DEFAULT_TASK_STAGE,
      isNew: true,
      dueDate: undefined,
      showAdvanced: false,
    };
    setProjectsState((projects) =>
      projects.map((project) => {
        if (project.id !== projectId) return project;
        const nextTasks = [...project.tasks, newTask];
        return {
          ...project,
          tasks: nextTasks,
          progress: computeProjectProgress(nextTasks),
        };
      })
    );
  };

  const handleTaskNameChange = (
    projectId: string,
    taskId: string,
    value: string
  ) => {
    setProjectsState((projects) =>
      projects.map((project) => {
        if (project.id !== projectId) return project;
        const nextTasks = project.tasks.map((task) =>
          task.id === taskId ? { ...task, name: value } : task
        );
        return {
          ...project,
          tasks: nextTasks,
          progress: computeProjectProgress(nextTasks),
        };
      })
    );
  };

  const handleTaskStageChange = (
    projectId: string,
    taskId: string,
    stage: string
  ) => {
    setProjectsState((projects) =>
      projects.map((project) => {
        if (project.id !== projectId) return project;
        const nextTasks = project.tasks.map((task) =>
          task.id === taskId ? { ...task, stage } : task
        );
        return {
          ...project,
          tasks: nextTasks,
          progress: computeProjectProgress(nextTasks),
        };
      })
    );
  };

  const handleRemoveTask = (projectId: string, taskId: string) => {
    let removedExisting = false;
    setProjectsState((projects) =>
      projects.map((project) => {
        if (project.id !== projectId) return project;
        const taskToRemove = project.tasks.find((task) => task.id === taskId);
        if (taskToRemove && !taskToRemove.isNew) {
          removedExisting = true;
        }
        const nextTasks = project.tasks.filter((task) => task.id !== taskId);
        return {
          ...project,
          tasks: nextTasks,
          progress: computeProjectProgress(nextTasks),
        };
      })
    );
    if (removedExisting) {
      setRemovedTaskIds((ids) =>
        ids.includes(taskId) ? ids : [...ids, taskId]
      );
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const preservedStatus = initialGoal?.status ?? "Active";
    const computedStatus = active
      ? preservedStatus === "Inactive"
        ? "Active"
        : preservedStatus
      : "Inactive";
    const computedActive = computedStatus !== "Inactive";

    const preparedProjects: Project[] = projectsState.map((project) => {
      const stage = project.stage ?? projectStatusToStage(project.status);
      const sanitizedTasks = project.tasks.map((task) => ({
        id: task.id,
        name: task.name.trim(),
        stage: task.stage,
        skillId: task.skillId,
        dueDate: task.dueDate,
      }));
      const progress = computeProjectProgress(sanitizedTasks);
      return {
        id: project.id,
        name: project.name.trim(),
        status: projectStageToStatus(stage),
        progress,
        dueDate: project.dueDate,
        energy: project.energy,
        energyCode: project.energyCode ?? energyToDbValue(project.energy),
        tasks: sanitizedTasks,
        stage,
        priorityCode: project.priorityCode,
        isNew: project.isNew,
      };
    });

    const goalProgress = computeGoalProgress(preparedProjects);

    const context: GoalUpdateContext = {
      projects: projectsState.map((project) => ({
        ...project,
        tasks: project.tasks.map((task) => ({ ...task })),
      })),
      removedProjectIds,
      removedTaskIds,
    };

    const nextGoal: Goal = {
      id: initialGoal?.id || Date.now().toString(),
      title: title.trim(),
      emoji: emoji.trim() || undefined,
      dueDate: goalDueDate ?? undefined,
      priority,
      energy,
      progress: goalProgress,
      status: computedStatus,
      active: computedActive,
      updatedAt: new Date().toISOString(),
      projects: preparedProjects,
      monumentId: monumentId || null,
      skills: initialGoal?.skills,
      weight: initialGoal?.weight,
      why: why.trim() ? why.trim() : undefined,
    };

    if (editing && onUpdate) {
      onUpdate(nextGoal, context);
    } else {
      onAdd(nextGoal, context);
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        className="border-l border-white/10 bg-[#060911]/95 text-white shadow-[0_40px_120px_-60px_rgba(99,102,241,0.65)] sm:max-w-xl"
      >
        <SheetHeader className="px-6 pt-8">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="text-left text-2xl font-semibold tracking-tight text-white">
              {editing ? "Edit goal" : "Create a goal"}
            </SheetTitle>
            {editing ? (
              <Button
                form={formId}
                type="submit"
                size="sm"
                disabled={!canSubmit}
                className={cn(
                  "relative hidden overflow-hidden rounded-lg border border-white/10 text-sm font-semibold text-white transition-[filter,transform,box-shadow] duration-300",
                  "bg-[linear-gradient(135deg,#9ca3af_0%,#6b7280_22%,#1f2937_58%,#0b0f19_100%)] bg-[length:250%_250%] shadow-[0_18px_42px_-26px_rgba(8,13,23,0.85)]",
                  "hover:scale-[1.02] hover:brightness-110 hover:shadow-[0_24px_60px_-30px_rgba(8,13,23,0.95)] active:scale-[0.98]",
                  "motion-safe:animate-[steel-shimmer_6s_linear_infinite] motion-reduce:animate-none motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:hover:brightness-100",
                  "disabled:animate-none disabled:brightness-100 disabled:opacity-60 disabled:shadow-none",
                  "sm:inline-flex"
                )}
              >
                Save changes
              </Button>
            ) : null}
          </div>
          <SheetDescription className="text-left text-sm text-white/60">
            Shape the focus, energy, and storyline for this goal. Everything you
            update is saved instantly once you hit save.
          </SheetDescription>
        </SheetHeader>
        <form id={formId} onSubmit={submit} className="flex h-full flex-col">
          <div className="flex-1 space-y-8 overflow-y-auto px-6 pb-8 pt-6">
            <div className="grid grid-cols-1 gap-6">
              <div className="grid grid-cols-[90px,1fr] gap-4">
                <div className="space-y-2">
                  <Label htmlFor="goal-emoji" className="text-white/70">
                    Emoji
                  </Label>
                  <Input
                    id="goal-emoji"
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    maxLength={2}
                    placeholder="✨"
                    className="h-12 rounded-xl border-white/10 bg-white/[0.04] text-center text-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal-title" className="text-white/70">
                    Title<span className="text-rose-300"> *</span>
                  </Label>
                  <Input
                    id="goal-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="Name the ambition..."
                    className="h-12 rounded-xl border-white/10 bg-white/[0.04] text-base"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-white/70">Monument link</Label>
                <Select
                  value={monumentId}
                  onValueChange={(value) => setMonumentId(value)}
                  placeholder="Not linked"
                  className="w-full"
                  triggerClassName="h-11 rounded-xl border-white/10 bg-white/[0.04]"
                >
                  <SelectContent>
                    <SelectItem value="" label="Not linked">
                      <span className="text-sm text-white/70">Not linked</span>
                    </SelectItem>
                    {monumentOptions.map((monument) => (
                      <SelectItem key={monument.id} value={monument.id}>
                        {monument.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-white/70">Priority</Label>
                <div className="grid gap-3 md:grid-cols-3">
                  {PRIORITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPriority(option.value)}
                      className={cn(
                        "rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition",
                        "hover:border-indigo-400/60 hover:bg-indigo-500/10",
                        priority === option.value &&
                          "border-indigo-400/60 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(99,102,241,0.3)]"
                      )}
                    >
                      <div className="text-sm font-semibold text-white">
                        {option.label}
                      </div>
                      <p className="mt-1 text-xs text-white/60">
                        {option.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-white/70">Energy required</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ENERGY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setEnergy(option.value)}
                      className={cn(
                        "rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-sm transition",
                        "hover:border-sky-400/50 hover:bg-sky-500/10",
                        energy === option.value &&
                          "border-sky-400/70 bg-gradient-to-r text-white",
                        energy === option.value && option.accent
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <button
                  type="button"
                  onClick={() => setGoalAdvancedOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold text-white"
                >
                  <span className="flex items-center gap-2 text-white/80">
                    <Sparkles className="h-4 w-4 text-indigo-300" aria-hidden="true" />
                    Advanced goal options
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-white/50 transition-transform duration-200",
                      goalAdvancedOpen ? "rotate-180" : "rotate-0"
                    )}
                    aria-hidden="true"
                  />
                </button>
                {goalAdvancedOpen ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div className="flex-1 space-y-2">
                        <Label
                          htmlFor="goal-due-date"
                          className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/60"
                        >
                          Due date
                        </Label>
                        <div className="relative">
                          <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                          <Input
                            id="goal-due-date"
                            type="date"
                            value={goalDueDateValue}
                            onChange={(event) => handleGoalDueDateChange(event.target.value)}
                            className="h-11 rounded-xl border-white/10 bg-white/[0.04] pl-10 text-sm"
                          />
                        </div>
                      </div>
                      {goalDueDate ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-9 rounded-full border border-white/10 bg-white/[0.02] px-4 text-xs font-semibold text-white/80 hover:border-rose-400/40 hover:text-white"
                          onClick={clearGoalDueDate}
                        >
                          Clear due date
                        </Button>
                      ) : (
                        <p className="text-xs text-white/60 sm:max-w-xs">
                          Deadlines gently raise this goal’s weight so it rises to the top as the date approaches.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-white/60">
                    Use due dates to gradually pull this goal forward when timing matters.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-white">Goal visibility</p>
                  <p className="text-xs text-white/60">
                    Inactive goals tuck themselves away from your main lists.
                  </p>
                </div>
                <Button
                  type="button"
                  variant={active ? "default" : "outline"}
                  className={cn(
                    "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide",
                    active ? "bg-emerald-500 text-black" : "text-white/80"
                  )}
                  onClick={() => setActive((prev) => !prev)}
                >
                  {active ? "Active" : "Inactive"}
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-why" className="text-white/70">
                  Why?
                </Label>
                <Textarea
                  id="goal-why"
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  placeholder="Capture the purpose or narrative behind this goal."
                  className="min-h-[120px] rounded-xl border-white/10 bg-white/[0.04] text-sm"
                />
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Label className="text-white/70">Projects &amp; tasks</Label>
                    <p className="text-xs text-white/60">
                      Manage the projects and tasks connected to this goal without
                      leaving the page.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-full border-white/20 bg-white/[0.04] text-xs font-medium text-white/80 hover:border-indigo-400/50 hover:text-white"
                    onClick={handleAddProject}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add project
                  </Button>
                </div>

                {projectsState.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-4 text-sm text-white/60">
                    No projects linked yet. Add one to keep your plan in sync with
                    this goal.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {projectsState.map((project, index) => {
                      const stageValue =
                        project.stage ?? projectStatusToStage(project.status);
                      const projectAdvancedOpen = project.showAdvanced ?? false;
                      const projectDueDateValue = formatDateForInput(project.dueDate);
                      return (
                        <div
                          key={project.id}
                          className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <Label className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                                  Project {index + 1}
                                </Label>
                                <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/60">
                                  {project.progress}% progress
                                </span>
                              </div>
                              <Input
                                value={project.name}
                                onChange={(event) =>
                                  handleProjectNameChange(
                                    project.id,
                                    event.target.value
                                  )
                                }
                                placeholder="Name this project"
                                className="h-11 rounded-xl border-white/10 bg-white/[0.05] text-sm"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="mt-1 size-8 rounded-full border border-white/10 bg-white/[0.04] text-white/60 hover:border-rose-400/50 hover:text-rose-200"
                              onClick={() => handleRemoveProject(project.id)}
                              aria-label={`Remove project ${index + 1}`}
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/60">
                                Stage
                              </Label>
                              <Select
                                value={stageValue}
                                onValueChange={(value) =>
                                  handleProjectStageChange(project.id, value)
                                }
                                triggerClassName="h-10 rounded-xl border-white/10 bg-white/[0.04] text-left text-sm"
                              >
                                <SelectContent className="bg-[#0f172a] text-sm text-white">
                                  {PROJECT_STAGE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/60">
                                Energy
                              </Label>
                              <Select
                                value={project.energy}
                                onValueChange={(value) =>
                                  handleProjectEnergyChange(
                                    project.id,
                                    value as Goal["energy"]
                                  )
                                }
                                triggerClassName="h-10 rounded-xl border-white/10 bg-white/[0.04] text-left text-sm"
                              >
                                <SelectContent className="bg-[#0f172a] text-sm text-white">
                                  {ENERGY_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                            <button
                              type="button"
                              onClick={() => toggleProjectAdvanced(project.id)}
                              className="flex w-full items-center justify-between gap-3 text-left text-xs font-semibold uppercase tracking-[0.3em] text-white/70"
                            >
                              <span className="flex items-center gap-2 text-white/70">
                                <Sparkles className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" />
                                Advanced
                              </span>
                              <ChevronDown
                                className={cn(
                                  "h-3.5 w-3.5 text-white/50 transition-transform duration-200",
                                  projectAdvancedOpen ? "rotate-180" : "rotate-0"
                                )}
                                aria-hidden="true"
                              />
                            </button>
                            {projectAdvancedOpen ? (
                              <div className="mt-3 space-y-2">
                                <Label
                                  htmlFor={`project-${project.id}-due-date`}
                                  className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/60"
                                >
                                  Due date
                                </Label>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                  <div className="relative flex-1">
                                    <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                                    <Input
                                      id={`project-${project.id}-due-date`}
                                      type="date"
                                      value={projectDueDateValue}
                                      onChange={(event) =>
                                        handleProjectDueDateChange(
                                          project.id,
                                          event.target.value
                                        )
                                      }
                                      className="h-10 rounded-xl border-white/10 bg-white/[0.04] pl-10 text-sm"
                                    />
                                  </div>
                                  {project.dueDate ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-9 rounded-full border border-white/10 bg-white/[0.03] px-3 text-[11px] font-semibold text-white/75 hover:border-rose-400/40 hover:text-white"
                                      onClick={() => clearProjectDueDate(project.id)}
                                    >
                                      Clear
                                    </Button>
                                  ) : (
                                    <p className="text-[11px] text-white/60 sm:max-w-[200px]">
                                      Due dates steadily increase this project’s scheduling weight.
                                    </p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <p className="mt-2 text-[11px] text-white/55">
                                Unlock due dates and other timing tools.
                              </p>
                            )}
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/60">
                                Tasks
                              </Label>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-lg border-white/20 bg-white/[0.04] px-3 text-xs font-medium text-white/80 hover:border-indigo-400/50 hover:text-white"
                                onClick={() => handleAddTask(project.id)}
                              >
                                <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
                                Add task
                              </Button>
                            </div>

                            {project.tasks.length === 0 ? (
                              <p className="text-xs text-white/50">
                                No tasks yet. Break this project down into actionable
                                steps.
                              </p>
                            ) : (
                              <div className="space-y-3">
                                {project.tasks.map((task, taskIndex) => {
                                  const taskAdvancedOpen = task.showAdvanced ?? false;
                                  const taskDueDateValue = formatDateForInput(task.dueDate);
                                  return (
                                    <div
                                      key={task.id}
                                      className="space-y-3 rounded-xl border border-white/10 bg-white/[0.04] p-3"
                                    >
                                      <div className="flex items-start gap-3">
                                        <div className="flex-1 space-y-1">
                                          <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">
                                            Task {taskIndex + 1}
                                          </Label>
                                          <Input
                                            value={task.name}
                                            onChange={(event) =>
                                              handleTaskNameChange(
                                                project.id,
                                                task.id,
                                                event.target.value
                                              )
                                            }
                                            placeholder="Describe the task"
                                            className="h-10 rounded-lg border-white/10 bg-white/[0.05] text-sm"
                                          />
                                        </div>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="mt-1 size-8 rounded-full border border-white/10 bg-white/[0.05] text-white/60 hover:border-rose-400/50 hover:text-rose-200"
                                          onClick={() =>
                                            handleRemoveTask(project.id, task.id)
                                          }
                                          aria-label={`Remove task ${taskIndex + 1}`}
                                        >
                                          <X className="h-4 w-4" aria-hidden="true" />
                                        </Button>
                                      </div>

                                      <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-1">
                                          <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">
                                            Stage
                                          </Label>
                                          <Select
                                            value={task.stage}
                                            onValueChange={(value) =>
                                              handleTaskStageChange(
                                                project.id,
                                                task.id,
                                                value
                                              )
                                            }
                                            triggerClassName="h-9 rounded-lg border-white/10 bg-white/[0.05] text-left text-sm"
                                          >
                                            <SelectContent className="bg-[#0f172a] text-sm text-white">
                                              {TASK_STAGE_OPTIONS.map((option) => (
                                                <SelectItem
                                                  key={option.value}
                                                  value={option.value}
                                                >
                                                  {option.label}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/50">
                                            Status
                                          </Label>
                                          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/60">
                                            {task.stage === "PERFECT"
                                              ? "Complete"
                                              : task.stage === "PRODUCE"
                                              ? "In progress"
                                              : "Preparing"}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                                        <button
                                          type="button"
                                          onClick={() => toggleTaskAdvanced(project.id, task.id)}
                                          className="flex w-full items-center justify-between gap-3 text-left text-[11px] font-semibold uppercase tracking-[0.35em] text-white/70"
                                        >
                                          <span className="flex items-center gap-2 text-white/70">
                                            <Sparkles className="h-3 w-3 text-indigo-300" aria-hidden="true" />
                                            Advanced
                                          </span>
                                          <ChevronDown
                                            className={cn(
                                              "h-3 w-3 text-white/50 transition-transform duration-200",
                                              taskAdvancedOpen ? "rotate-180" : "rotate-0"
                                            )}
                                            aria-hidden="true"
                                          />
                                        </button>
                                        {taskAdvancedOpen ? (
                                          <div className="mt-3 space-y-2">
                                            <Label
                                              htmlFor={`task-${task.id}-due-date`}
                                              className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/60"
                                            >
                                              Due date
                                            </Label>
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                              <div className="relative flex-1">
                                                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                                                <Input
                                                  id={`task-${task.id}-due-date`}
                                                  type="date"
                                                  value={taskDueDateValue}
                                                  onChange={(event) =>
                                                    handleTaskDueDateChange(
                                                      project.id,
                                                      task.id,
                                                      event.target.value
                                                    )
                                                  }
                                                  className="h-9 rounded-lg border-white/10 bg-white/[0.04] pl-9 text-sm"
                                                />
                                              </div>
                                              {task.dueDate ? (
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-8 rounded-full border border-white/10 bg-white/[0.03] px-3 text-[11px] font-semibold text-white/75 hover:border-rose-400/40 hover:text-white"
                                                  onClick={() => clearTaskDueDate(project.id, task.id)}
                                                >
                                                  Clear
                                                </Button>
                                              ) : (
                                                <p className="text-[11px] text-white/60 sm:max-w-[200px]">
                                                  Due dates nudge this task toward the top of your queue as the deadline closes in.
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        ) : (
                                          <p className="mt-2 text-[11px] text-white/55">
                                            Fine-tune timing with due dates.
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
          <SheetFooter className="border-t border-white/10 bg-[#05070c]/60">
            <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                className="justify-start text-white/70 hover:text-white"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit} className="w-full sm:w-auto">
                {editing ? "Save changes" : "Create goal"}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
