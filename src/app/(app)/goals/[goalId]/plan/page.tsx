"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Loader2, X } from "lucide-react";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PageHeader } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToastHelpers } from "@/components/ui/toast";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getGoalById, type Goal } from "@/lib/queries/goals";
import {
  getProjectsForGoal,
  type Project,
} from "@/lib/queries/projects";
import {
  DEFAULT_ENERGY,
  DEFAULT_PRIORITY,
  DEFAULT_TASK_STAGE,
  createDraftProject,
  createDraftTask,
  type DraftProject,
  type DraftTask,
  normalizeTask,
} from "@/lib/drafts/projects";

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

const PRIORITY_OPTIONS = [
  { value: "NO", label: "No Priority" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
  { value: "ULTRA-CRITICAL", label: "Ultra-Critical" },
];

const ENERGY_OPTIONS = [
  { value: "NO", label: "No Energy" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "ULTRA", label: "Ultra" },
  { value: "EXTREME", label: "Extreme" },
];

const getPriorityLabel = (value: string) =>
  PRIORITY_OPTIONS.find((option) => option.value === value)?.label ?? value;

const getEnergyLabel = (value: string) =>
  ENERGY_OPTIONS.find((option) => option.value === value)?.label ?? value;


export default function PlanGoalPage() {
  const params = useParams<{ goalId?: string }>();
  const goalIdParam = params?.goalId;
  const goalId = Array.isArray(goalIdParam) ? goalIdParam[0] : goalIdParam;

  const [goal, setGoal] = useState<Goal | null>(null);
  const [existingProjects, setExistingProjects] = useState<Project[]>([]);
  const [projectTasks, setProjectTasks] = useState<
    Record<
      string,
      {
        id: string;
        name: string;
        stage: string;
        priority: string;
        energy: string;
        notes: string | null;
      }[]
    >
  >({});
  const [drafts, setDrafts] = useState<DraftProject[]>([createDraftProject()]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const router = useRouter();
  const toast = useToastHelpers();

  useEffect(() => {
    if (!goalId) {
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      setLoading(true);
      try {
        const goalData = await getGoalById(goalId);
        const projectsData = await getProjectsForGoal(goalId);
        const supabase = getSupabaseBrowser();

        if (!supabase) {
          throw new Error("Supabase client not available");
        }

        const projectIds = projectsData.map((project) => project.id);
        let tasksMap: typeof projectTasks = {};

        if (projectIds.length > 0) {
          const { data: tasksData, error: tasksError } = await supabase
            .from("tasks")
            .select(
              "id, project_id, name, stage, priority, energy, notes"
            )
            .eq("goal_id", goalId)
            .in("project_id", projectIds);

          if (tasksError) {
            console.error("Error loading tasks:", tasksError);
            throw tasksError;
          }

          tasksMap = (tasksData || []).reduce<typeof projectTasks>(
            (acc, task) => {
              const projectId = task.project_id;
              if (!projectId) {
                return acc;
              }

              const existing = acc[projectId] || [];
              acc[projectId] = [...existing, normalizeTask(task)];
              return acc;
            },
            {}
          );
        }

        if (!active) return;

        setGoal(goalData);
        setExistingProjects(projectsData);
        setProjectTasks(tasksMap);

        if (!goalData) {
          toast.error(
            "Goal not found",
            "We couldn't find that goal. Try creating it again."
          );
        }
      } catch (error) {
        console.error("Error loading goal planning data:", error);
        if (active) {
          toast.error(
            "Error loading goal",
            "Something went wrong while loading this goal."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [goalId, toast]);

  const title = useMemo(() => {
    if (!goal) {
      return "Plan Goal";
    }
    return `Plan “${goal.name}”`;
  }, [goal]);

  const description = useMemo(() => {
    if (!goal) {
      return "Spin up the projects that will bring this goal to life.";
    }
    return "Spin up the projects that will bring this goal to life. We'll link every project to this goal automatically.";
  }, [goal]);

  const handleDraftChange = (
    id: string,
    field: "name" | "stage" | "why" | "priority" | "energy",
    value: string
  ) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              [field]: value,
            }
          : draft
      )
    );
  };

  const handleTaskChange = (
    projectId: string,
    taskId: string,
    field: keyof DraftTask,
    value: string
  ) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.id === projectId
          ? {
              ...draft,
              tasks: draft.tasks.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      [field]: value,
                    }
                  : task
              ),
            }
          : draft
      )
    );
  };

  const handleAddTask = (projectId: string) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.id === projectId
          ? {
              ...draft,
              tasks: [...draft.tasks, createDraftTask()],
            }
          : draft
      )
    );
  };

  const handleRemoveTask = (projectId: string, taskId: string) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.id === projectId
          ? {
              ...draft,
              tasks: draft.tasks.filter((task) => task.id !== taskId),
            }
          : draft
      )
    );
  };

  const handleAddDraft = () => {
    setDrafts((prev) => [...prev, createDraftProject()]);
  };

  const handleRemoveDraft = (id: string) => {
    setDrafts((prev) =>
      prev.length === 1 ? prev : prev.filter((draft) => draft.id !== id)
    );
  };

  const handleSaveProjects = async () => {
    if (!goalId) {
      toast.error(
        "Goal missing",
        "We couldn't determine which goal to connect these projects to."
      );
      return;
    }

    const projectsToSave = drafts
      .map((draft) => ({
        ...draft,
        name: draft.name.trim(),
        why: draft.why.trim(),
        tasks: draft.tasks.map((task) => ({
          ...task,
          name: task.name.trim(),
          notes: task.notes.trim(),
        })),
      }))
      .filter((draft) => draft.name.length > 0);

    if (projectsToSave.length === 0) {
      toast.warning(
        "Add a project",
        "Enter at least one project name before saving."
      );
      return;
    }

    setIsSaving(true);

    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        toast.error("Error", "Unable to connect to the database");
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        toast.error("Authentication required", "Please sign in again.");
        return;
      }

      const payload = projectsToSave.map((draft) => ({
        user_id: user.id,
        goal_id: goalId,
        name: draft.name,
        stage: draft.stage,
        why: draft.why || null,
        priority: draft.priority || DEFAULT_PRIORITY,
        energy: draft.energy || DEFAULT_ENERGY,
      }));

      const { data, error } = await supabase
        .from("projects")
        .insert(payload)
        .select(
          "id, name, goal_id, priority, energy, stage, why, created_at"
        );

      if (error) {
        console.error("Error saving projects:", error);
        toast.error("Error", "We couldn't save those projects.");
        return;
      }

      const insertedProjects = (data as Project[]) || [];

      if (insertedProjects.length !== projectsToSave.length) {
        console.error("Mismatch between inserted projects and drafts", {
          insertedProjects,
          projectsToSave,
        });
        toast.error(
          "Error",
          "We saved the projects, but couldn't confirm their tasks."
        );
      }

      const tasksPayload =
        insertedProjects.length === projectsToSave.length
            ? projectsToSave.flatMap((draft, index) => {
                const project = insertedProjects[index];
                if (!project) {
                  return [];
                }

                return draft.tasks
                  .map((task) => ({
                    user_id: user.id,
                    goal_id: goalId,
                    project_id: project.id,
                    name: task.name,
                    stage: task.stage || DEFAULT_TASK_STAGE,
                    priority: task.priority || DEFAULT_PRIORITY,
                    energy: task.energy || DEFAULT_ENERGY,
                    notes: task.notes.length > 0 ? task.notes : null,
                  }))
                  .filter((task) => task.name.length > 0);
              })
          : [];

      let insertedTasks: {
        id: string;
        project_id: string;
        name: string;
        stage: string;
        priority: string;
        energy: string;
        notes: string | null;
      }[] = [];
      let tasksFailed = false;

      if (tasksPayload.length > 0) {
        const { data: tasksData, error: tasksError } = await supabase
          .from("tasks")
          .insert(tasksPayload)
          .select(
            "id, project_id, name, stage, priority, energy, notes"
          );

        if (tasksError) {
          console.error("Error saving tasks:", tasksError);
          toast.error(
            "Error",
            "Projects were saved, but we couldn't save their tasks."
          );
          tasksFailed = true;
        } else {
          insertedTasks = tasksData || [];
        }
      }

      if (tasksFailed) {
        toast.warning(
          "Projects saved",
          "Projects were saved, but we couldn't add their tasks."
        );
      } else {
        toast.success(
          "Projects saved",
          "Your projects are linked to this goal."
        );
      }

      setDrafts([createDraftProject()]);
      setExistingProjects((prev) => [
        ...insertedProjects,
        ...prev,
      ]);
      setProjectTasks((prev) => {
        const next = { ...prev };

        insertedProjects.forEach((project) => {
          if (!next[project.id]) {
            next[project.id] = [];
          }
        });

        insertedTasks.forEach((task) => {
          const projectId = task.project_id;
          if (!projectId) {
            return;
          }

          next[projectId] = [normalizeTask(task), ...(next[projectId] || [])];
        });

        return next;
      });
    } catch (error) {
      console.error("Error creating projects:", error);
      toast.error("Error", "We couldn't save those projects.");
    } finally {
      setIsSaving(false);
    }
  };

  const showEmptyState = !loading && (!goal || existingProjects.length === 0);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#05080f] text-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
          <PageHeader title={title} description={description} />

          <section className="space-y-6">
            <div className="rounded-3xl border border-white/5 bg-white/[0.03] p-5 shadow-[0_35px_80px_-40px_rgba(15,23,42,0.75)] sm:p-8">
              <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Batch create projects
                  </h2>
                  <p className="text-sm text-zinc-400">
                    Capture several project ideas and save them all at once.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={handleAddDraft}
                  variant="outline"
                  className="border-white/10 bg-white/[0.02] text-white hover:border-white/30 hover:bg-white/10"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add another project
                </Button>
              </div>

              <div className="space-y-5">
                {drafts.map((draft, index) => (
                  <div
                    key={draft.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="flex-1 space-y-4">
                        <div className="space-y-2">
                          <Label
                            htmlFor={`project-name-${draft.id}`}
                            className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400"
                          >
                            Project {index + 1}
                          </Label>
                          <Input
                            id={`project-name-${draft.id}`}
                            value={draft.name}
                            onChange={(event) =>
                              handleDraftChange(
                                draft.id,
                                "name",
                                event.target.value
                              )
                            }
                            placeholder="Name this project"
                            className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                          />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                              Stage
                            </Label>
                            <Select
                              value={draft.stage}
                              onValueChange={(value) =>
                                handleDraftChange(draft.id, "stage", value)
                              }
                            >
                              <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                                <SelectValue placeholder="Choose a stage" />
                              </SelectTrigger>
                              <SelectContent className="bg-[#0b101b] text-sm text-white">
                                {PROJECT_STAGE_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                              Notes (optional)
                            </Label>
                            <Textarea
                              value={draft.why}
                              onChange={(event) =>
                                handleDraftChange(
                                  draft.id,
                                  "why",
                                  event.target.value
                                )
                              }
                              placeholder="Capture context or success criteria"
                              className="min-h-[72px] rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                            />
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                              Priority
                            </Label>
                            <Select
                              value={draft.priority}
                              onValueChange={(value) =>
                                handleDraftChange(draft.id, "priority", value)
                              }
                            >
                              <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                                <SelectValue placeholder="Choose a priority" />
                              </SelectTrigger>
                              <SelectContent className="bg-[#0b101b] text-sm text-white">
                                {PRIORITY_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                              Energy
                            </Label>
                            <Select
                              value={draft.energy}
                              onValueChange={(value) =>
                                handleDraftChange(draft.id, "energy", value)
                              }
                            >
                              <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                                <SelectValue placeholder="Choose energy" />
                              </SelectTrigger>
                              <SelectContent className="bg-[#0b101b] text-sm text-white">
                                {ENERGY_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                              Tasks
                            </Label>
                            <Button
                              type="button"
                              onClick={() => handleAddTask(draft.id)}
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg border-white/10 bg-white/[0.03] px-2 text-xs font-medium text-white hover:border-white/30 hover:bg-white/10"
                            >
                              <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
                              Add task
                            </Button>
                          </div>

                          {draft.tasks.length > 0 ? (
                            <div className="space-y-3">
                              {draft.tasks.map((task, taskIndex) => (
                                <div
                                  key={task.id}
                                  className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
                                >
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                                    <div className="flex-1 space-y-3">
                                      <div className="space-y-1">
                                        <Label
                                          htmlFor={`task-name-${draft.id}-${task.id}`}
                                          className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500"
                                        >
                                          Task {taskIndex + 1}
                                        </Label>
                                        <Input
                                          id={`task-name-${draft.id}-${task.id}`}
                                          value={task.name}
                                          onChange={(event) =>
                                            handleTaskChange(
                                              draft.id,
                                              task.id,
                                              "name",
                                              event.target.value
                                            )
                                          }
                                          placeholder="Name this task"
                                          className="h-10 rounded-lg border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                                        />
                                      </div>

                                      <div className="grid gap-3 sm:grid-cols-3">
                                        <div className="space-y-1">
                                          <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                                            Stage
                                          </Label>
                                          <Select
                                            value={task.stage}
                                            onValueChange={(value) =>
                                              handleTaskChange(
                                                draft.id,
                                                task.id,
                                                "stage",
                                                value
                                              )
                                            }
                                          >
                                            <SelectTrigger className="h-10 rounded-lg border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                                              <SelectValue placeholder="Choose a stage" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#0b101b] text-sm text-white">
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
                                          <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                                            Priority
                                          </Label>
                                          <Select
                                            value={task.priority}
                                            onValueChange={(value) =>
                                              handleTaskChange(
                                                draft.id,
                                                task.id,
                                                "priority",
                                                value
                                              )
                                            }
                                          >
                                            <SelectTrigger className="h-10 rounded-lg border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                                              <SelectValue placeholder="Choose a priority" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#0b101b] text-sm text-white">
                                              {PRIORITY_OPTIONS.map((option) => (
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
                                          <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                                            Energy
                                          </Label>
                                          <Select
                                            value={task.energy}
                                            onValueChange={(value) =>
                                              handleTaskChange(
                                                draft.id,
                                                task.id,
                                                "energy",
                                                value
                                              )
                                            }
                                          >
                                            <SelectTrigger className="h-10 rounded-lg border border-white/10 bg-white/[0.05] text-left text-sm text-white focus:border-blue-400/60 focus-visible:ring-0">
                                              <SelectValue placeholder="Choose energy" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#0b101b] text-sm text-white">
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

                                      <div className="space-y-1">
                                        <Label className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                                          Notes (optional)
                                        </Label>
                                        <Textarea
                                          value={task.notes}
                                          onChange={(event) =>
                                            handleTaskChange(
                                              draft.id,
                                              task.id,
                                              "notes",
                                              event.target.value
                                            )
                                          }
                                          placeholder="Add context about this task"
                                          className="min-h-[60px] rounded-lg border border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-zinc-500 focus:border-blue-400/60 focus-visible:ring-0"
                                        />
                                      </div>
                                    </div>

                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleRemoveTask(draft.id, task.id)}
                                      className="self-start text-zinc-400 hover:text-white"
                                      aria-label="Remove task"
                                    >
                                      <X className="h-4 w-4" aria-hidden="true" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.03] p-3 text-[13px] text-zinc-400">
                              Add tasks to break this project into actionable steps.
                            </p>
                          )}
                        </div>
                      </div>

                      {drafts.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveDraft(draft.id)}
                          className="self-start text-zinc-400 hover:text-white"
                          aria-label="Remove project"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/goals")}
                  className="h-11 rounded-xl border border-white/10 bg-white/[0.02] px-6 text-sm text-zinc-300 hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  Back to goals
                </Button>
                <Button
                  type="button"
                  onClick={handleSaveProjects}
                  disabled={isSaving}
                  className="h-11 rounded-xl bg-blue-500 px-6 text-sm font-semibold text-white shadow-[0_18px_35px_-18px_rgba(37,99,235,0.7)] transition hover:bg-blue-500/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Saving projects...
                    </>
                  ) : (
                    "Save projects"
                  )}
                </Button>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-white">
              Projects already linked
            </h2>
            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-6 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading projects...
              </div>
            ) : existingProjects.length > 0 ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {existingProjects.map((project) => (
                  <li
                    key={project.id}
                    className="rounded-2xl border border-white/5 bg-white/[0.02] p-4"
                  >
                    <p className="text-sm font-semibold text-white">
                      {project.name}
                    </p>
                    <p className="text-xs uppercase tracking-[0.2em] text-blue-200/70">
                      {project.stage}
                    </p>
                    {project.why ? (
                      <p className="mt-2 text-xs text-zinc-400">{project.why}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                      <Badge className="border-white/10 bg-white/[0.08] text-white">
                        Priority: {getPriorityLabel(project.priority)}
                      </Badge>
                      <Badge className="border-white/10 bg-white/[0.08] text-white">
                        Energy: {getEnergyLabel(project.energy)}
                      </Badge>
                      <Badge className="border-white/10 bg-white/[0.08] text-white">
                        {projectTasks[project.id]?.length || 0} task
                        {projectTasks[project.id] && projectTasks[project.id].length === 1
                          ? ""
                          : "s"}
                      </Badge>
                    </div>
                    {projectTasks[project.id] &&
                    projectTasks[project.id].length > 0 ? (
                      <ul className="mt-3 space-y-2 text-xs text-zinc-300">
                        {projectTasks[project.id].map((task) => (
                          <li
                            key={task.id}
                            className="rounded-lg border border-white/5 bg-white/[0.03] p-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-white">
                                {task.name}
                              </span>
                              <span className="text-[10px] uppercase tracking-[0.2em] text-blue-200/70">
                                {task.stage}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-400">
                              <span>Priority: {getPriorityLabel(task.priority)}</span>
                              <span>Energy: {getEnergyLabel(task.energy)}</span>
                            </div>
                            {task.notes ? (
                              <p className="mt-1 text-[11px] text-zinc-400">
                                {task.notes}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm text-zinc-400">
                {showEmptyState
                  ? "Once you save projects, they will appear here."
                  : "No projects to show yet."}
              </div>
            )}
          </section>
        </div>
      </div>
    </ProtectedRoute>
  );
}
