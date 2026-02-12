"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Plus, X } from "lucide-react";
import { listRoadmaps, createRoadmap } from "@/lib/queries/roadmaps";
import { getSupabaseBrowser } from "@/lib/supabase";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
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
  /** Optional delete handler shown only while editing */
  onDelete?(goal: Goal): Promise<void> | void;
  monuments?: { id: string; title: string; emoji?: string | null }[];
  roadmaps?: { id: string; title: string; emoji?: string | null }[];
  hideProjects?: boolean;
  saveDisabled?: boolean;
}

const PRIORITY_OPTIONS: {
  value: Goal["priority"];
  label: string;
  description: string;
}[] = [
  {
    value: "No",
    label: "No",
    description: "Keep this goal available without pulling focus.",
  },
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
  {
    value: "Critical",
    label: "Critical",
    description: "Top of the stack—treat like a burning deadline.",
  },
  {
    value: "Ultra-Critical",
    label: "Ultra-Critical",
    description: "Emergency mode. Everything else yields until this moves.",
  },
];

const PRIORITY_CODE_TO_LABEL: Record<string, Goal["priority"]> = {
  NO: "No",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
  "ULTRA-CRITICAL": "Ultra-Critical",
};

const PRIORITY_LABEL_TO_CODE: Record<Goal["priority"], string> = {
  No: "NO",
  Low: "LOW",
  Medium: "MEDIUM",
  High: "HIGH",
  Critical: "CRITICAL",
  "Ultra-Critical": "ULTRA-CRITICAL",
};

type PriorityCodeInput = string | { name?: string | null } | null | undefined;

const normalizePriorityCodeInput = (
  code?: PriorityCodeInput
): string | null => {
  if (!code) return null;
  if (typeof code === "string") {
    return code.toUpperCase();
  }
  if (typeof code === "object" && "name" in code) {
    const value = code.name;
    if (typeof value === "string") {
      return value.toUpperCase();
    }
  }
  return null;
};

const priorityLabelFromCode = (
  code?: PriorityCodeInput,
  fallback: Goal["priority"] = "Low"
): Goal["priority"] => {
  const normalized = normalizePriorityCodeInput(code);
  if (!normalized) return fallback;
  return PRIORITY_CODE_TO_LABEL[normalized] ?? fallback;
};

const energyLabelFromCode = (
  code?: string | null,
  fallback: Goal["energy"] = "No"
): Goal["energy"] => {
  if (!code) return fallback;
  const normalized = code.toUpperCase();
  return ENERGY_CODE_TO_LABEL[normalized] ?? fallback;
};

const ENERGY_OPTIONS: {
  value: Goal["energy"];
  label: string;
}[] = [
  { value: "No", label: "No" },
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
  { value: "Ultra", label: "Ultra" },
  { value: "Extreme", label: "Extreme" },
];

const ENERGY_CODE_TO_LABEL: Record<string, Goal["energy"]> = {
  NO: "No",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  ULTRA: "Ultra",
  EXTREME: "Extreme",
};

const ENERGY_LABEL_TO_CODE: Record<Goal["energy"], string> = {
  No: "NO",
  Low: "LOW",
  Medium: "MEDIUM",
  High: "HIGH",
  Ultra: "ULTRA",
  Extreme: "EXTREME",
};

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

const toDateInputValue = (iso?: string | null) => {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};

const fromDateInputValue = (value: string): string | undefined => {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

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

type EditableTask = Task & { isNew?: boolean };
type EditableProject = Project & {
  tasks: EditableTask[];
  isNew?: boolean;
};

export function GoalDrawer({
  open,
  onClose,
  onAdd,
  initialGoal,
  onUpdate,
  onDelete,
  monuments = [],
  roadmaps = undefined,
  hideProjects = false,
  saveDisabled = false,
}: GoalDrawerProps) {
  console.log(
    "🎯 GoalDrawer render - open:",
    open,
    "initialGoal:",
    initialGoal?.id
  );
  const formId = "goal-editor-form";
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [hasCustomEmoji, setHasCustomEmoji] = useState(false);
  const [priority, setPriority] = useState<Goal["priority"]>("Low");
  const [energy, setEnergy] = useState<Goal["energy"]>("No");
  const [active, setActive] = useState(true);
  const [why, setWhy] = useState("");
  const [monumentId, setMonumentId] = useState<string>("");
  const [roadmapId, setRoadmapId] = useState<string>("");
  const [dueDateInput, setDueDateInput] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCreateRoadmap, setShowCreateRoadmap] = useState(false);
  const [newRoadmapTitle, setNewRoadmapTitle] = useState("");
  const [newRoadmapEmoji, setNewRoadmapEmoji] = useState("");
  const [roadmapsList, setRoadmapsList] = useState<
    { id: string; title: string; emoji?: string | null }[]
  >(roadmaps || []);
  const [isCreatingRoadmap, setIsCreatingRoadmap] = useState(false);
  const [projectsState, setProjectsState] = useState<EditableProject[]>([]);
  const [removedProjectIds, setRemovedProjectIds] = useState<string[]>([]);
  const [removedTaskIds, setRemovedTaskIds] = useState<string[]>([]);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const monumentSelectionRef = useRef<string>("");

  const editing = Boolean(initialGoal);
  const showDeleteAction = editing && Boolean(onDelete && initialGoal);

  const getMonumentEmojiById = useCallback(
    (id?: string | null) => {
      if (!id) return null;
      const match = monuments.find((monument) => monument.id === id);
      return match?.emoji ?? null;
    },
    [monuments]
  );

  useEffect(() => {
    if (initialGoal) {
      const resolvedPriority = priorityLabelFromCode(
        initialGoal.priorityCode,
        initialGoal.priority
      );
      const monumentDefaultEmoji = getMonumentEmojiById(
        initialGoal.monumentId ?? null
      );
      const initialEmojiValue = initialGoal.emoji || monumentDefaultEmoji || "";
      setTitle(initialGoal.title);
      setEmoji(initialEmojiValue);
      setHasCustomEmoji(
        Boolean(initialGoal.emoji && initialGoal.emoji !== monumentDefaultEmoji)
      );
      setPriority(resolvedPriority);
      const resolvedEnergy = energyLabelFromCode(
        initialGoal.energyCode,
        initialGoal.energy
      );
      setEnergy(resolvedEnergy);
      setActive(initialGoal.active ?? true);
      setWhy(initialGoal.why || "");
      setMonumentId(initialGoal.monumentId || "");
      monumentSelectionRef.current = initialGoal.monumentId || "";
      setRoadmapId(initialGoal.roadmapId || "");
      setShowCreateRoadmap(false);
      setNewRoadmapTitle("");
      setNewRoadmapEmoji("");
      setDueDateInput(toDateInputValue(initialGoal.dueDate));
      setShowAdvanced(Boolean(initialGoal.dueDate));
      setProjectsState(
        (initialGoal.projects || []).map((project) => {
          const stage = project.stage ?? projectStatusToStage(project.status);
          const tasks = (project.tasks || []).map((task) => ({
            ...task,
            isNew: false,
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
          } satisfies EditableProject;
        })
      );
    } else {
      setTitle("");
      setEmoji("");
      setHasCustomEmoji(false);
      setPriority("Low");
      setEnergy("No");
      setActive(true);
      setWhy("");
      setMonumentId("");
      monumentSelectionRef.current = "";
      setRoadmapId("");
      setShowCreateRoadmap(false);
      setNewRoadmapTitle("");
      setNewRoadmapEmoji("");
      setDueDateInput("");
      setShowAdvanced(false);
      setProjectsState([]);
    }
    setRemovedProjectIds([]);
    setRemovedTaskIds([]);
  }, [initialGoal, open, getMonumentEmojiById]);

  useEffect(() => {
    if (monumentSelectionRef.current === monumentId) {
      return;
    }
    monumentSelectionRef.current = monumentId;
    if (!monumentId) {
      setEmoji("");
      setHasCustomEmoji(false);
      return;
    }
    const defaultEmoji = getMonumentEmojiById(monumentId);
    if (defaultEmoji) {
      setEmoji(defaultEmoji);
      setHasCustomEmoji(false);
    }
  }, [monumentId, getMonumentEmojiById]);

  const monumentOptions = useMemo(() => {
    if (!monuments.length) {
      return [] as { id: string; title: string; emoji?: string | null }[];
    }
    return [...monuments].sort((a, b) => a.title.localeCompare(b.title));
  }, [monuments]);

  const roadmapOptions = useMemo(() => {
    if (!roadmapsList.length) {
      return [] as { id: string; title: string; emoji?: string | null }[];
    }
    return [...roadmapsList].sort((a, b) => a.title.localeCompare(b.title));
  }, [roadmapsList]);

  // Load roadmaps if not provided as prop
  useEffect(() => {
    if (roadmaps !== undefined) {
      setRoadmapsList(roadmaps);
      return;
    }
    if (!open) return;
    let cancelled = false;
    const loadRoadmaps = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const roadmapsData = await listRoadmaps(user.id);
        if (!cancelled) {
          setRoadmapsList(roadmapsData);
        }
      } catch (err) {
        console.error("Error loading roadmaps:", err);
      }
    };
    loadRoadmaps();
    return () => {
      cancelled = true;
    };
  }, [open, roadmaps]);

  const handleCreateRoadmap = async () => {
    if (!newRoadmapTitle.trim()) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    try {
      setIsCreatingRoadmap(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const newRoadmap = await createRoadmap(user.id, {
        title: newRoadmapTitle.trim(),
        emoji: newRoadmapEmoji.trim() || null,
      });
      setRoadmapsList((prev) => [...prev, newRoadmap]);
      setRoadmapId(newRoadmap.id);
      setShowCreateRoadmap(false);
      setNewRoadmapTitle("");
      setNewRoadmapEmoji("");
    } catch (err) {
      console.error("Error creating roadmap:", err);
    } finally {
      setIsCreatingRoadmap(false);
    }
  };

  const handleRoadmapSelectChange = (value: string) => {
    if (value === "__create__") {
      setShowCreateRoadmap(true);
    } else {
      setRoadmapId(value);
      setShowCreateRoadmap(false);
    }
  };

  // Allow saving at any point: only require a title.
  // Empty-named projects/tasks will be filtered out during persistence.
  const canSubmit = title.trim().length > 0;

  const generateId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  const handleDeleteGoal = async () => {
    if (!initialGoal || !onDelete) return;
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!initialGoal || !onDelete) return;
    let success = false;
    try {
      setDeleteLoading(true);
      await Promise.resolve(onDelete(initialGoal));
      success = true;
    } catch (err) {
      console.error("Error deleting goal from drawer:", err);
    } finally {
      setDeleteLoading(false);
      if (success) {
        onClose();
      }
    }
  };

  const handleAddProject = () => {
    const stage = DEFAULT_PROJECT_STAGE;
    const nextProject: EditableProject = {
      id: generateId(),
      name: "",
      status: projectStageToStatus(stage),
      progress: 0,
      energy: "No",
      energyCode: energyToDbValue("No"),
      dueDate: undefined,
      tasks: [],
      stage,
      priorityCode: "NO",
      isNew: true,
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

  const handleProjectDueDateChange = (projectId: string, value: string) => {
    const normalized = fromDateInputValue(value);
    setProjectsState((projects) =>
      projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              dueDate: normalized ?? undefined,
            }
          : project
      )
    );
  };

  const handleRemoveProject = (projectId: string) => {
    let removedProject: EditableProject | null = null;
    setProjectsState((projects) => {
      removedProject =
        projects.find((project) => project.id === projectId) ?? null;
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
    if (!canSubmit || deleteLoading) return;

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

    const normalizedGoalDueDate = fromDateInputValue(dueDateInput);
    const normalizedPriorityCode = PRIORITY_LABEL_TO_CODE[priority] ?? "LOW";
    const normalizedEnergyCode = ENERGY_LABEL_TO_CODE[energy] ?? "NO";

    const nextGoal: Goal = {
      id: initialGoal?.id || Date.now().toString(),
      title: title.trim(),
      emoji: emoji.trim() || undefined,
      dueDate: normalizedGoalDueDate,
      priority,
      priorityCode: normalizedPriorityCode,
      energy,
      energyCode: normalizedEnergyCode,
      progress: goalProgress,
      status: computedStatus,
      active: computedActive,
      updatedAt: new Date().toISOString(),
      projects: preparedProjects,
      monumentId: monumentId || null,
      roadmapId: roadmapId || null,
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
      modal={false}
    >
      <SheetContent
        side="center"
        className="h-[90vh] w-full max-w-3xl overflow-hidden border border-white/10 bg-[#05070c] text-white shadow-[0_45px_120px_-40px_rgba(5,8,21,0.85)] sm:max-w-4xl"
        style={{ zIndex: 9999 }}
      >
        <SheetHeader className="border-b border-white/10 px-6 py-5 sm:px-8 sm:py-6">
          <SheetTitle className="text-left text-xl font-semibold text-white tracking-[0.2em] uppercase">
            {editing ? "Edit goal" : "Create a goal"}
          </SheetTitle>
        </SheetHeader>
        <form
          id={formId}
          onSubmit={submit}
          className="flex flex-1 min-h-0 flex-col"
        >
          <div className="flex-1 min-h-0 space-y-8 overflow-y-auto px-6 pb-10 pt-6 sm:px-8 sm:pb-12">
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-2">
                <Label
                  htmlFor="goal-title"
                  className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60"
                >
                  Title<span className="text-rose-300"> *</span>
                </Label>
                <Input
                  id="goal-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="Name the ambition..."
                  className="h-12 rounded-xl border-white/20 bg-white/5 text-base text-white placeholder:text-white/40"
                />
              </div>

              <div className="flex flex-row gap-4 sm:grid sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-1 flex-shrink-0 w-[25%] sm:w-full">
                  <Label
                    htmlFor="goal-emoji"
                    className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60"
                  >
                    Emoji
                  </Label>
                  <Input
                    id="goal-emoji"
                    value={emoji}
                    onChange={(e) => {
                      const value = e.target.value;
                      setEmoji(value);
                      setHasCustomEmoji(value.trim().length > 0);
                    }}
                    maxLength={2}
                    placeholder="✨"
                    className="h-12 rounded-xl border-white/20 bg-white/5 text-center text-xl text-white"
                  />
                </div>
                <div className="space-y-2 sm:col-span-1 flex-grow w-[75%] sm:w-full">
                  <Label className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                    Monument link
                  </Label>
                  <Select
                    value={monumentId}
                    onValueChange={(value) => setMonumentId(value)}
                    placeholder="Not linked"
                    className="w-full"
                    triggerClassName="h-11 rounded-xl border-white/20 bg-white/5 text-left text-sm text-white"
                  >
                    <SelectContent>
                      <SelectItem value="" label="Not linked">
                        <span className="text-sm text-white/70">
                          Not linked
                        </span>
                      </SelectItem>
                      {monumentOptions.map((monument) => (
                        <SelectItem key={monument.id} value={monument.id}>
                          {monument.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                  Roadmap
                </Label>
                {showCreateRoadmap ? (
                  <div className="space-y-2 rounded-xl border border-white/20 bg-white/5 p-3">
                    <div className="flex gap-2">
                      <Input
                        value={newRoadmapEmoji}
                        onChange={(e) => setNewRoadmapEmoji(e.target.value)}
                        maxLength={2}
                        placeholder="✨"
                        className="h-10 w-16 rounded-xl border-white/20 bg-white/5 text-center text-xl text-white"
                      />
                      <Input
                        value={newRoadmapTitle}
                        onChange={(e) => setNewRoadmapTitle(e.target.value)}
                        placeholder="Roadmap name"
                        className="flex-1 h-10 rounded-xl border-white/20 bg-white/5 text-sm text-white placeholder:text-white/40"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newRoadmapTitle.trim()) {
                            e.preventDefault();
                            handleCreateRoadmap();
                          }
                          if (e.key === "Escape") {
                            setShowCreateRoadmap(false);
                            setNewRoadmapTitle("");
                            setNewRoadmapEmoji("");
                          }
                        }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={handleCreateRoadmap}
                        disabled={!newRoadmapTitle.trim() || isCreatingRoadmap}
                        className="flex-1 h-8 text-xs"
                      >
                        {isCreatingRoadmap ? "Creating..." : "Create"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setShowCreateRoadmap(false);
                          setNewRoadmapTitle("");
                          setNewRoadmapEmoji("");
                        }}
                        className="h-8 text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Select
                    value={roadmapId}
                    onValueChange={handleRoadmapSelectChange}
                    placeholder="Not linked"
                    className="w-full"
                    triggerClassName="h-11 rounded-xl border-white/20 bg-white/5 text-left text-sm text-white"
                  >
                    <SelectContent>
                      <SelectItem value="" label="Not linked">
                        <span className="text-sm text-white/70">
                          Not linked
                        </span>
                      </SelectItem>
                      {roadmapOptions.map((roadmap) => (
                        <SelectItem key={roadmap.id} value={roadmap.id}>
                          <span className="flex items-center gap-2">
                            {roadmap.emoji && <span>{roadmap.emoji}</span>}
                            <span>{roadmap.title}</span>
                          </span>
                        </SelectItem>
                      ))}
                      <SelectItem
                        value="__create__"
                        label="➕ Create new roadmap"
                      >
                        <span className="flex items-center gap-2 text-sm text-white/70">
                          <Plus className="h-4 w-4" />
                          <span>Create new roadmap</span>
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex flex-row gap-4 sm:grid sm:grid-cols-2">
                <div className="space-y-3 flex-1">
                  <Label className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                    Priority
                  </Label>
                  <Select
                    value={priority}
                    onValueChange={(value) =>
                      setPriority(value as Goal["priority"])
                    }
                  >
                    <SelectTrigger className="h-11 rounded-xl border-white/20 bg-white/5 text-left text-sm text-white">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0f172a] text-sm text-white">
                      {PRIORITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <span className="font-semibold">
                            {option.label.toUpperCase()}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3 flex-1">
                  <Label className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                    Energy
                  </Label>
                  <Select
                    value={energy}
                    onValueChange={(value) =>
                      setEnergy(value as Goal["energy"])
                    }
                  >
                    <SelectTrigger className="h-11 rounded-xl border-white/20 bg-white/5 text-left text-sm text-white">
                      <SelectValue placeholder="Select energy level" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0f172a] text-sm text-white">
                      {ENERGY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <FlameEmber
                              level={option.value.toUpperCase() as FlameLevel}
                              size="xs"
                            />
                            <span>{option.label.toUpperCase()}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((prev) => !prev)}
                  className="flex w-full items-center justify-between text-left text-sm font-semibold text-white"
                >
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays
                      className="h-4 w-4 text-white/70"
                      aria-hidden="true"
                    />
                    Advanced timeline
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-white/60 transition-transform ${
                      showAdvanced ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {showAdvanced && (
                  <div className="mt-4 space-y-3">
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
                      Goal due date
                    </Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        type="date"
                        value={dueDateInput}
                        onChange={(event) =>
                          setDueDateInput(event.target.value)
                        }
                        className="h-11 rounded-xl border-white/15 bg-white/[0.05] text-sm text-white sm:flex-1"
                      />
                      {dueDateInput ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 rounded-xl border border-white/15 bg-white/[0.03] text-sm text-white/70 hover:text-white"
                          onClick={() => setDueDateInput("")}
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs text-white/50">
                      Due dates slowly boost weight inside a 4-week window and
                      spike over the final few days so this goal takes the lead
                      when it matters.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="goal-why"
                  className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60"
                >
                  Why?
                </Label>
                <Textarea
                  id="goal-why"
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  placeholder="Capture the purpose or narrative behind this goal."
                  className="min-h-[120px] rounded-xl border-white/20 bg-white/5 text-sm text-white placeholder:text-white/40"
                />
              </div>

              {!hideProjects && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
                        Projects &amp; tasks
                      </Label>
                      <p className="text-xs text-white/55">
                        Manage the projects and tasks connected to this goal
                        without leaving the page.
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
                      No projects linked yet. Add one to keep your plan in sync
                      with this goal.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {projectsState.map((project, index) => {
                        const stageValue =
                          project.stage ?? projectStatusToStage(project.status);
                        const projectDueDateValue = toDateInputValue(
                          project.dueDate
                        );
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
                                  className="h-11 rounded-xl border-white/20 bg-white/5 text-sm text-white placeholder:text-white/40"
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
                                  triggerClassName="h-10 rounded-xl border-white/20 bg-white/5 text-left text-sm text-white"
                                >
                                  <SelectContent className="bg-[#0f172a] text-sm text-white">
                                    {PROJECT_STAGE_OPTIONS.map((option) => (
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
                                  triggerClassName="h-10 rounded-xl border-white/20 bg-white/5 text-left text-sm text-white"
                                >
                                  <SelectContent className="bg-[#0f172a] text-sm text-white">
                                    {ENERGY_OPTIONS.map((option) => (
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
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                              <details
                                className="group"
                                defaultOpen={Boolean(projectDueDateValue)}
                              >
                                <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-white">
                                  <span>Advanced options</span>
                                  <ChevronDown className="h-4 w-4 text-white/60 transition-transform group-open:rotate-180" />
                                </summary>
                                <div className="mt-3 space-y-2">
                                  <Label className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">
                                    Project due date
                                  </Label>
                                  <div className="flex flex-col gap-2 sm:flex-row">
                                    <Input
                                      type="date"
                                      value={projectDueDateValue}
                                      onChange={(event) =>
                                        handleProjectDueDateChange(
                                          project.id,
                                          event.target.value
                                        )
                                      }
                                      className="h-10 rounded-xl border-white/20 bg-white/5 text-sm text-white sm:flex-1"
                                    />
                                    {projectDueDateValue ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-10 rounded-xl border border-white/15 bg-white/[0.03] text-xs text-white/70 hover:text-white"
                                        onClick={() =>
                                          handleProjectDueDateChange(
                                            project.id,
                                            ""
                                          )
                                        }
                                      >
                                        Clear
                                      </Button>
                                    ) : null}
                                  </div>
                                  <p className="text-xs text-white/50">
                                    Projects surge to the top of schedules as
                                    their due date nears.
                                  </p>
                                </div>
                              </details>
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
                                  <Plus
                                    className="mr-1 h-3 w-3"
                                    aria-hidden="true"
                                  />
                                  Add task
                                </Button>
                              </div>

                              {project.tasks.length === 0 ? (
                                <p className="text-xs text-white/50">
                                  No tasks yet. Break this project down into
                                  actionable steps.
                                </p>
                              ) : (
                                <div className="space-y-3">
                                  {project.tasks.map((task, taskIndex) => (
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
                                            handleRemoveTask(
                                              project.id,
                                              task.id
                                            )
                                          }
                                          aria-label={`Remove task ${
                                            taskIndex + 1
                                          }`}
                                        >
                                          <X
                                            className="h-4 w-4"
                                            aria-hidden="true"
                                          />
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
                                              {TASK_STAGE_OPTIONS.map(
                                                (option) => (
                                                  <SelectItem
                                                    key={option.value}
                                                    value={option.value}
                                                  >
                                                    {option.label}
                                                  </SelectItem>
                                                )
                                              )}
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
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </form>
        <SheetFooter className="border-t border-white/10 bg-white/[0.02] px-6 py-4 sm:px-8">
          {showDeleteConfirm ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <h4 className="text-sm font-semibold text-white">
                  Delete Goal
                </h4>
                <p className="text-sm text-white/70">
                  This will permanently delete this goal and all related
                  projects and tasks.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? "Deleting..." : "Delete Goal"}
              </Button>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                className="text-sm text-white/70 hover:text-white"
                onClick={onClose}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <div className="flex w-full gap-3 sm:w-auto">
                {showDeleteAction ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="flex-1 bg-red-600 text-white hover:bg-red-500 disabled:opacity-70 sm:flex-auto"
                    onClick={handleDeleteGoal}
                    disabled={deleteLoading}
                  >
                    Delete goal
                  </Button>
                ) : null}
                <Button
                  type="submit"
                  form={formId}
                  className="flex-1 bg-white text-sm font-semibold text-[#05070c] hover:bg-white/90 disabled:opacity-60 sm:flex-auto"
                  disabled={saveDisabled || !canSubmit || deleteLoading}
                >
                  Save goal
                </Button>
              </div>
            </div>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
