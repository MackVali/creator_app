"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Goal as GoalRow } from "@/lib/queries/goals";
import { GoalCard } from "@/app/(app)/goals/components/GoalCard";
import { GoalDrawer, type GoalUpdateContext } from "@/app/(app)/goals/components/GoalDrawer";
import type { Goal, Project } from "@/app/(app)/goals/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { projectWeight, taskWeight, type TaskLite, type ProjectLite } from "@/lib/scheduler/weight";
import { getMonumentsForUser } from "@/lib/queries/monuments";
import { getSkillsForUser } from "@/lib/queries/skills";
import { recordProjectCompletion } from "@/lib/projects/projectCompletion";
import { persistGoalUpdate } from "@/lib/goals/persistGoalUpdate";
import { deleteGoalCascade } from "@/lib/goals/deleteGoalCascade";
import { computeGoalWeight } from "@/lib/goals/weight";

type GoalRowWithRelations = GoalRow & {
  due_date?: string | null;
  priority_code?: string | null;
  energy_code?: string | null;
  projects?: {
    id: string;
    name: string;
    goal_id: string;
    priority: string | null;
    energy: string | null;
    stage: string | null;
    duration_min?: number | null;
    created_at: string;
    due_date?: string | null;
    tasks?: {
      id: string;
      project_id: string | null;
      stage: string;
      name: string;
      skill_id: string | null;
      priority: string | null;
    }[];
    project_skills?: {
      skill_id: string | null;
    }[];
  }[];
};

function mapPriority(
  priority: { name?: string | null } | string | null | undefined
): Goal["priority"] {
  const normalized = extractLookupName(priority)?.toUpperCase();
  switch (normalized) {
    case "NO":
      return "No";
    case "ULTRA-CRITICAL":
      return "Ultra-Critical";
    case "CRITICAL":
      return "Critical";
    case "HIGH":
      return "High";
    case "MEDIUM":
      return "Medium";
    case "LOW":
      return "Low";
    default:
      return "Low";
  }
}

function mapEnergy(energy: { name?: string | null } | string | null | undefined): Goal["energy"] {
  const normalized = extractLookupName(energy)?.toUpperCase();
  switch (normalized) {
    case "LOW":
      return "Low";
    case "MEDIUM":
      return "Medium";
    case "HIGH":
      return "High";
    case "ULTRA":
      return "Ultra";
    case "EXTREME":
      return "Extreme";
    default:
      return "No";
  }
}

function projectStageToStatus(stage: string): Project["status"] {
  switch (stage) {
    case "RESEARCH":
      return "Todo";
    case "RELEASE":
      return "Done";
    default:
      return "In-Progress";
  }
}

function goalStatusToStatus(status?: string | null): Goal["status"] {
  switch (status) {
    case "COMPLETED":
    case "Completed":
    case "DONE":
      return "Completed";
    case "INACTIVE":
    case "Inactive":
      return "Inactive";
    case "OVERDUE":
    case "Overdue":
      return "Overdue";
    case "ACTIVE":
    case "Active":
    case "IN_PROGRESS":
    case "IN PROGRESS":
    default:
      return "Active";
  }
}

const DAY_IN_MS = 86_400_000;
const GOAL_PRIORITY_WEIGHT: Record<string, number> = {
  NO: 0,
  LOW: 10,
  MEDIUM: 200,
  HIGH: 300,
  CRITICAL: 500,
  "ULTRA-CRITICAL": 1000,
};

const SCHEDULER_PRIORITY_MAP: Record<string, string> = {
  NO: "NO",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "Critical",
  "ULTRA-CRITICAL": "Ultra-Critical",
};
const NORMALIZED_PRIORITY_VALUES = new Set(["NO", "LOW", "MEDIUM", "HIGH", "CRITICAL", "ULTRA-CRITICAL"]);
const NORMALIZED_ENERGY_VALUES = new Set(["NO", "LOW", "MEDIUM", "HIGH", "ULTRA", "EXTREME"]);

const normalizePriorityCode = (value?: string | null): string => {
  if (typeof value !== "string") return "NO";
  const upper = value.toUpperCase();
  return NORMALIZED_PRIORITY_VALUES.has(upper) ? upper : "NO";
};

const normalizeEnergyCode = (value?: string | null): string => {
  if (typeof value !== "string") return "NO";
  const upper = value.toUpperCase();
  return NORMALIZED_ENERGY_VALUES.has(upper) ? upper : "NO";
};

const extractLookupName = (
  field: { name?: string | null } | string | null | undefined
): string | null => {
  if (!field) return null;
  if (typeof field === "string") return field;
  if (typeof field === "object" && "name" in field) {
    const name = field.name;
    return typeof name === "string" ? name : null;
  }
  return null;
};

const TASK_STAGE_MAP: Record<string, string> = {
  PREPARE: "Prepare",
  PRODUCE: "Produce",
  PERFECT: "Perfect",
};

function mapSchedulerPriority(priority?: string | null): string {
  if (typeof priority !== "string") return "NO";
  const upper = priority.toUpperCase();
  return SCHEDULER_PRIORITY_MAP[upper] || "NO";
}

function mapSchedulerTaskStage(stage?: string | null): string {
  if (typeof stage !== "string") return "Produce";
  const upper = stage.toUpperCase();
  return TASK_STAGE_MAP[upper] || "Produce";
}

function toSchedulerTask(task: {
  id: string;
  name: string;
  stage: string;
  priorityCode?: string | null;
}): TaskLite {
  return {
    id: task.id,
    name: task.name,
    stage: mapSchedulerTaskStage(task.stage),
    priority: mapSchedulerPriority(task.priorityCode ?? null),
    duration_min: 0,
    energy: null,
  };
}

function toSchedulerProject(project: {
  id: string;
  priorityCode?: string | null;
  stage?: string | null;
  dueDate?: string | null;
}): ProjectLite {
  return {
    id: project.id,
    priority: mapSchedulerPriority(project.priorityCode ?? null),
    stage: project.stage ?? "BUILD",
    due_date: project.dueDate ?? null,
  };
}

async function fetchGoalsWithRelations(userId: string) {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [] as GoalRowWithRelations[];
  const baseSelect =
    "id, name, priority, energy, priority_code, energy_code, why, created_at, active, status, monument_id, weight, weight_boost, due_date";
  const selectWithEnumColumns = `
    ${baseSelect},
    projects (
      id, name, goal_id, stage, duration_min, created_at, due_date,
      priority,
      energy,
      tasks (
        id, project_id, stage, name, skill_id, priority
      ),
      project_skills (
        skill_id
      )
    )
  `;
  const selectWithLookupRelations = `
    ${baseSelect},
    projects (
      id, name, goal_id, stage, duration_min, created_at, due_date,
      priority:priority(name),
      energy:energy(name),
      tasks (
        id, project_id, stage, name, skill_id, priority
      ),
      project_skills (
        skill_id
      )
    )
  `;

  const runQuery = (select: string) =>
    supabase
      .from("goals")
      .select(select)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

  const variants = [
    { description: "enum column project fetch", select: selectWithEnumColumns },
    { description: "lookup relation project fetch", select: selectWithLookupRelations },
  ];

  for (const variant of variants) {
    const { data, error } = await runQuery(variant.select);
    if (!error) {
      return data ?? [];
    }
    console.warn(`Skill goal fetch variant failed (${variant.description}):`, error);
  }

  console.warn("Falling back to basic skill goal fetch");

  const fallback = await runQuery(baseSelect);
  if (fallback.error) {
    console.error("Error fetching goals for skill view:", fallback.error);
    return [];
  }
  return fallback.data ?? [];
}

export function SkillProjectsList({ skillId }: { skillId: string }) {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Goal[]>([]);
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [monumentOptions, setMonumentOptions] = useState<{ id: string; title: string; emoji: string | null }[]>([]);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [baseGoals, setBaseGoals] = useState<Goal[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [skillOptions, setSkillOptions] = useState<{ id: string; name: string; icon: string | null }[]>([]);
  const [taskFormOpenForGoalId, setTaskFormOpenForGoalId] = useState<string | null>(null);
  const [taskNameInput, setTaskNameInput] = useState("");
  const [taskSkillIdInput, setTaskSkillIdInput] = useState<string>("");
  const [taskProjectIdInput, setTaskProjectIdInput] = useState<string>("");
  const [taskEnergyInput, setTaskEnergyInput] = useState("NO");
  const [taskStageInput, setTaskStageInput] = useState("PREPARE");
  const [taskPriorityInput, setTaskPriorityInput] = useState("NO");
  const [taskFormError, setTaskFormError] = useState<string | null>(null);
  const [taskSaving, setTaskSaving] = useState(false);

  useEffect(() => {
    setOpenGoalId(null);
  }, [skillId]);

  const decorate = useCallback((goal: Goal) => {
    return {
      ...goal,
      weight: computeGoalWeight(goal),
    };
  }, []);

  const fetchGoalForEditing = useCallback(async (goal: Goal) => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return goal;
    try {
      const { data, error } = await supabase
        .from("goals")
        .select("priority, energy, monument_id, due_date, why, active, status")
        .eq("id", goal.id)
        .single();
      if (error || !data) {
        return goal;
      }
      const priorityCode =
        typeof data.priority === "string" ? data.priority.toUpperCase() : null;
      const energyCode =
        typeof data.energy === "string" ? data.energy.toUpperCase() : null;
      return {
        ...goal,
        priority: priorityCode ? mapPriority(priorityCode) : goal.priority,
        priorityCode: priorityCode ?? goal.priorityCode ?? null,
        energy: energyCode ? mapEnergy(energyCode) : goal.energy,
        energyCode: energyCode ?? goal.energyCode ?? null,
        monumentId: data.monument_id ?? goal.monumentId ?? null,
        dueDate: data.due_date ?? goal.dueDate,
        why: data.why ?? goal.why,
        active: typeof data.active === "boolean" ? data.active : goal.active,
        status: data.status ? goalStatusToStatus(data.status) : goal.status,
      };
    } catch (err) {
      console.error("Failed to fetch goal for editing", err);
      return goal;
    }
  }, []);

  const loadProjects = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase || !skillId) {
      setProjects([]);
      setBaseGoals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setProjects([]);
        setBaseGoals([]);
        setUserId(null);
        setLoading(false);
        return;
      }
      setUserId(user.id);

      const [rows, monuments, skills] = await Promise.all([
        fetchGoalsWithRelations(user.id),
        getMonumentsForUser(user.id).catch(() => []),
        getSkillsForUser(user.id).catch(() => []),
      ]);
      setSkillOptions(
        skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          icon: skill.icon ?? null,
        }))
      );
      setMonumentOptions(
        monuments.map((monument) => ({
          id: monument.id,
          title: monument.title,
          emoji: monument.emoji ?? null,
        }))
      );
      const monumentEmojiLookup = new Map(monuments.map((m) => [m.id, m.emoji ?? null]));
      const skillIconLookup = new Map(skills.map((skill) => [skill.id, skill.icon ?? null]));
      const skillEmoji = skillIconLookup.get(skillId) ?? null;
      const resolveSkillEmoji = (skillId?: string | null) => {
        if (!skillId) return null;
        return skillIconLookup.get(skillId) ?? null;
      };

      const mappedGoals: Goal[] = rows.map((g) => {
        const goalSkills = new Set<string>();
        const projList: Project[] = (g.projects ?? []).map((p) => {
          const normalizedTasks = (p.tasks ?? []).map((task) => {
            const normalized = {
              id: task.id,
              name: task.name,
              stage: task.stage,
              skillId: task.skill_id ?? null,
              priorityCode: task.priority ?? null,
              isNew: false,
            };
            if (normalized.skillId) {
              goalSkills.add(normalized.skillId);
            }
            return normalized;
          });
          const projectSkillIds: string[] = [];
          (p.project_skills ?? []).forEach((record) => {
            if (record?.skill_id) {
              goalSkills.add(record.skill_id);
              projectSkillIds.push(record.skill_id);
            }
          });
          const total = normalizedTasks.length;
          const done = normalizedTasks.filter((t) => t.stage === "PERFECT").length;
          const progress = total ? Math.round((done / total) * 100) : 0;
          const status = projectStageToStatus(p.stage ?? "BUILD");
          const schedulerTasks: TaskLite[] = normalizedTasks.map(toSchedulerTask);
          const relatedTaskWeightSum = schedulerTasks.reduce((sum, t) => sum + taskWeight(t), 0);
          const projectWeightValue = projectWeight(
            toSchedulerProject({
              id: p.id,
              priorityCode: p.priority ?? undefined,
              stage: p.stage ?? undefined,
              dueDate: p.due_date ?? null,
            }),
            relatedTaskWeightSum
          );
          const normalizedTaskSkillIds = normalizedTasks
            .map((task) => task.skillId)
            .filter((value): value is string => Boolean(value));
          const projectEmoji =
            projectSkillIds
              .map(resolveSkillEmoji)
              .find((emoji): emoji is string => Boolean(emoji)) ??
            normalizedTaskSkillIds
              .map(resolveSkillEmoji)
              .find((emoji): emoji is string => Boolean(emoji)) ??
            null;
          const rawEnergy = extractLookupName(p.energy);
          const rawPriority = extractLookupName(p.priority);
          const energyCode = normalizeEnergyCode(rawEnergy);
          const priorityCode = normalizePriorityCode(rawPriority);
          return {
            id: p.id,
            name: p.name,
            status,
            progress,
            energy: mapEnergy(energyCode),
            energyCode,
            dueDate: p.due_date ?? null,
            durationMinutes:
              typeof p.duration_min === "number" && Number.isFinite(p.duration_min)
                ? p.duration_min
                : null,
            skillIds: projectSkillIds,
            emoji: projectEmoji,
            stage: p.stage ?? "BUILD",
            priorityCode,
            weight: projectWeightValue,
            isNew: false,
            tasks: normalizedTasks,
          };
        });

        const progressValue =
          projList.length > 0
            ? Math.round(
                projList.reduce((sum, project) => sum + project.progress, 0) / projList.length
              )
            : 0;
        const status = g.status ? goalStatusToStatus(g.status) : progressValue >= 100 ? "Completed" : "Active";

        const goalPrioritySource =
          g.priority_code ?? extractLookupName(g.priority);
        const normalizedGoalPriorityCode = goalPrioritySource
          ? goalPrioritySource.toUpperCase()
          : null;
        const goalEnergySource =
          g.energy_code ?? extractLookupName(g.energy);
        const normalizedGoalEnergyCode = goalEnergySource
          ? goalEnergySource.toUpperCase()
          : null;
        const base: Goal = {
          id: g.id,
          title: g.name,
          priority: mapPriority(goalPrioritySource),
          energy: mapEnergy(goalEnergySource),
          progress: progressValue,
          status,
          active: g.active ?? status === "Active",
          createdAt: g.created_at,
          updatedAt: g.created_at,
          dueDate: g.due_date ?? undefined,
          projects: projList,
          monumentId: g.monument_id ?? null,
          monumentEmoji: monumentEmojiLookup.get(g.monument_id ?? "") ?? null,
          priorityCode: normalizedGoalPriorityCode,
          energyCode: normalizedGoalEnergyCode,
          weightBoost: g.weight_boost ?? 0,
          skills: Array.from(goalSkills),
          why: g.why || undefined,
        };
        return decorate(base);
      });

      setBaseGoals(mappedGoals);

      const skillProjects: Goal[] = [];
      mappedGoals.forEach((goal) => {
        const relevantProjects = goal.projects.filter((project) => {
          const hasProjectSkill = project.skillIds?.includes(skillId);
          const hasTaskSkill = project.tasks.some((task) => task.skillId === skillId);
          return Boolean(hasProjectSkill || hasTaskSkill);
        });

        relevantProjects.forEach((project) => {
          const fallbackMonumentEmoji = monumentEmojiLookup.get(goal.monumentId ?? "") ?? null;
          const icon = skillEmoji ?? fallbackMonumentEmoji;
          const projectGoal: Goal = {
            id: project.id,
            parentGoalId: goal.id,
            title: project.name,
            emoji: project.emoji ?? null,
            priority: mapPriority(project.priorityCode ?? "NO"),
            energy: mapEnergy(project.energyCode ?? "NO"),
            progress: project.progress,
            status: project.status === "Done" ? "Completed" : "Active",
            active: project.status !== "Done",
            createdAt: goal.createdAt,
            updatedAt: goal.updatedAt,
            dueDate: project.dueDate ?? undefined,
            projects: [project],
            monumentId: goal.monumentId ?? null,
            monumentEmoji: icon,
            priorityCode: project.priorityCode ?? null,
            energyCode: project.energyCode ?? goal.energyCode ?? null,
            weightBoost: goal.weightBoost ?? 0,
            skills: project.skillIds ?? goal.skills,
            why: goal.why,
          };
          skillProjects.push(decorate(projectGoal));
        });
      });

      skillProjects.sort((a, b) => {
        const weightDiff = (b.weight ?? 0) - (a.weight ?? 0);
        if (weightDiff !== 0) return weightDiff;
        const aUpdated = Date.parse(a.updatedAt);
        const bUpdated = Date.parse(b.updatedAt);
        if (Number.isFinite(aUpdated) && Number.isFinite(bUpdated) && aUpdated !== bUpdated) {
          return bUpdated - aUpdated;
        }
        return a.title.localeCompare(b.title);
      });

      setProjects(skillProjects);
    } catch (err) {
      console.error("Error loading skill projects", err);
      setProjects([]);
      setBaseGoals([]);
      setSkillOptions([]);
    } finally {
      setLoading(false);
    }
  }, [decorate, skillId]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const buildProjectFromUpdates = useCallback(
    (projectId: string, updates: Partial<Project>): Project => ({
      id: projectId,
      name: updates.name ?? "New project",
      status: updates.status ?? "In-Progress",
      progress: updates.progress ?? 0,
      dueDate: updates.dueDate,
      energy: updates.energy ?? "No",
      emoji: updates.emoji ?? null,
      tasks: updates.tasks ?? [],
      stage: updates.stage ?? "BUILD",
      energyCode: updates.energyCode ?? "NO",
      priorityCode: updates.priorityCode ?? "NO",
      durationMinutes: updates.durationMinutes ?? null,
      skillIds: updates.skillIds ?? [],
      weight: updates.weight,
      isNew: updates.isNew,
    }),
    []
  );

  const handleProjectUpdated = useCallback(
    (goalId: string, projectId: string, updates: Partial<Project>) => {
      setProjects((prev) =>
        prev.map((goal) => {
          if (goal.id !== goalId) return goal;
          const existingProject = goal.projects.find(
            (project) => project.id === projectId
          );
          return {
            ...goal,
            projects: existingProject
              ? goal.projects.map((project) =>
                  project.id === projectId
                    ? { ...project, ...updates }
                    : project
                )
              : [
                  ...goal.projects,
                  buildProjectFromUpdates(projectId, updates),
                ],
          };
        })
      );
    },
    [buildProjectFromUpdates]
  );

  const handleProjectDeleted = useCallback((goalId: string) => {
    setProjects((prev) => prev.filter((goal) => goal.id !== goalId));
  }, []);

  const handleGoalEdit = useCallback(
    (goal: Goal) => {
      const parentId = goal.parentGoalId ?? goal.id;
      const sourceGoal = baseGoals.find((item) => item.id === parentId);
      if (!sourceGoal) return;
      setEditingGoal(null);
      void fetchGoalForEditing(sourceGoal).then((fresh) => {
        setEditingGoal(fresh);
        setDrawerOpen(true);
      });
    },
    [baseGoals, fetchGoalForEditing]
  );

  const handleTaskToggleCompletion = useCallback(
    async (
      goalId: string,
      projectId: string,
      taskId: string,
      currentStage: string
    ) => {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        return;
      }
      const nextStage = currentStage === "PERFECT" ? "PRODUCE" : "PERFECT";
      try {
        const { error } = await supabase
          .from("tasks")
          .update({ stage: nextStage })
          .eq("id", taskId);

        if (error) {
          throw error;
        }

        setProjects((prev) =>
          prev.map((goal) => {
            if (goal.id !== goalId) return goal;

            const updatedProjects = goal.projects.map((project) => {
              if (project.id !== projectId) return project;

              const updatedTasks = project.tasks.map((task) =>
                task.id === taskId ? { ...task, stage: nextStage } : task
              );

              const total = updatedTasks.length;
              const done = updatedTasks.filter((task) => task.stage === "PERFECT").length;
              const progress = total ? Math.round((done / total) * 100) : 0;
              const schedulerTasks = updatedTasks.map(toSchedulerTask);
              const relatedTaskWeightSum = schedulerTasks.reduce(
                (sum, t) => sum + taskWeight(t),
                0
              );
              const projectWeightValue = projectWeight(
                toSchedulerProject({
                  id: project.id,
                  priorityCode: project.priorityCode ?? undefined,
                  stage: project.stage ?? undefined,
                  dueDate: project.dueDate ?? null,
                }),
                relatedTaskWeightSum
              );

              return {
                ...project,
                tasks: updatedTasks,
                progress,
                weight: projectWeightValue,
              };
            });

            const goalProgress =
              updatedProjects.length > 0
                ? Math.round(
                    updatedProjects.reduce((sum, p) => sum + (p.progress ?? 0), 0) /
                      updatedProjects.length
                  )
                : 0;

            return decorate({
              ...goal,
              projects: updatedProjects,
              progress: goalProgress,
            });
          })
        );
      } catch (err) {
        console.error("Failed to toggle task completion", err);
      }
    },
    [decorate]
  );

  const handleProjectToggleCompletion = useCallback(
    async (goalId: string, projectId: string, currentStage: string) => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;

      const goalSnapshot = projects.find((goal) => goal.id === goalId);
      const originalProject = goalSnapshot?.projects.find((project) => project.id === projectId);

      const nextStage = currentStage === "RELEASE" ? "BUILD" : "RELEASE";
      const completedAt = nextStage === "RELEASE" ? new Date().toISOString() : null;

      try {
        const { error } = await supabase
          .from("projects")
          .update({ stage: nextStage, completed_at: completedAt })
          .eq("id", projectId);

        if (error) {
          throw error;
        }

        setProjects((prev) =>
          prev.map((goal) => {
            if (goal.id !== goalId) return goal;

            const updatedProjects = goal.projects.map((project) => {
              if (project.id !== projectId) return project;

              const schedulerTasks = project.tasks.map(toSchedulerTask);
              const relatedTaskWeightSum = schedulerTasks.reduce(
                (sum, task) => sum + taskWeight(task),
                0
              );
              const projectWeightValue = projectWeight(
                toSchedulerProject({
                  id: project.id,
                  priorityCode: project.priorityCode ?? undefined,
                  stage: nextStage,
                  dueDate: project.dueDate ?? null,
                }),
                relatedTaskWeightSum
              );

              return {
                ...project,
                stage: nextStage,
                status: nextStage === "RELEASE" ? "Done" : "In-Progress",
                progress: nextStage === "RELEASE" ? 100 : 0,
                weight: projectWeightValue,
              };
            });

            const goalProgress =
              updatedProjects.length > 0
                ? Math.round(
                    updatedProjects.reduce((sum, p) => sum + (p.progress ?? 0), 0) /
                      updatedProjects.length
                  )
                : 0;

          return decorate({
            ...goal,
            projects: updatedProjects,
            progress: goalProgress,
          });
        })
      );
      } catch (err) {
        console.error("Failed to toggle project completion", err);
      }

      if (nextStage === "RELEASE" && originalProject) {
        void recordProjectCompletion(
          {
            projectId,
            projectSkillIds: originalProject.skillIds,
            taskSkillIds: (originalProject.tasks ?? []).map((task) => task.skillId),
          },
          "complete"
        );
      }

      if (currentStage === "RELEASE" && nextStage !== "RELEASE" && originalProject) {
        void recordProjectCompletion(
          {
            projectId,
            projectSkillIds: originalProject.skillIds,
            taskSkillIds: (originalProject.tasks ?? []).map((task) => task.skillId),
          },
          "undo"
        );
      }
    },
    [decorate, projects]
  );

  const handleGoalUpdated = useCallback(
    async (updatedGoal: Goal, context: GoalUpdateContext) => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      try {
        await persistGoalUpdate({
          supabase,
          goal: updatedGoal,
          context,
          userId,
          onUserResolved: setUserId,
        });
        await loadProjects();
      } catch (err) {
        console.error("Error updating goal from skill view:", err);
      }
    },
    [loadProjects, userId]
  );

  const handleGoalDeleted = useCallback(
    async (goal: Goal) => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      try {
        let targetUserId = userId;
        if (!targetUserId) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user?.id) {
            return;
          }
          targetUserId = user.id;
          setUserId(user.id);
        }
        await deleteGoalCascade({
          supabase,
          goalId: goal.id,
          userId: targetUserId,
        });
        setBaseGoals((prev) => prev.filter((item) => item.id !== goal.id));
        setProjects((prev) =>
          prev.filter(
            (projectGoal) =>
              projectGoal.parentGoalId !== goal.id && projectGoal.id !== goal.id
          )
        );
        setEditingGoal(null);
        setDrawerOpen(false);
        setOpenGoalId(null);
      } catch (err) {
        console.error("Error deleting goal from skill view:", err);
      }
    },
    [userId, setBaseGoals, setProjects, setEditingGoal, setDrawerOpen, setOpenGoalId, setUserId]
  );

  const handleGoalOpenChange = useCallback(
    (goalId: string, isOpen: boolean) => {
      if (isOpen) {
        setOpenGoalId(goalId);
        return;
      }
      setOpenGoalId((current) => (current === goalId ? null : current));
    },
    []
  );

  useEffect(() => {
    if (!openGoalId) return;
    if (!projects.some((goal) => goal.id === openGoalId)) {
      setOpenGoalId(null);
    }
  }, [openGoalId, projects]);

  const handleTaskCreate = useCallback((goalId: string) => {
    const targetGoal = projects.find((goal) => goal.id === goalId);
    const targetProject = targetGoal?.projects[0];
    if (!targetProject?.id) return;

    setTaskNameInput("");
    setTaskSkillIdInput(skillId);
    setTaskProjectIdInput(targetProject.id);
    setTaskEnergyInput("NO");
    setTaskStageInput("PREPARE");
    setTaskPriorityInput("NO");
    setTaskFormError(null);
    setTaskFormOpenForGoalId(goalId);
  }, [projects, skillId]);

  const handleTaskModalClose = useCallback(() => {
    if (taskSaving) return;
    setTaskFormOpenForGoalId(null);
    setTaskFormError(null);
  }, [taskSaving]);

  const handleTaskModalSubmit = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase || !taskFormOpenForGoalId) return;

    const trimmedName = taskNameInput.trim();
    if (!trimmedName) {
      setTaskFormError("Task name is required.");
      return;
    }
    if (!taskProjectIdInput) {
      setTaskFormError("Choose a project for this task.");
      return;
    }

    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setTaskFormError("Unable to resolve your account. Try again.");
        return;
      }
      resolvedUserId = user.id;
      setUserId(user.id);
    }

    setTaskSaving(true);
    setTaskFormError(null);

    try {
      const taskId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `draft-task-${Date.now()}`;

      const projectGoal = projects.find((goal) => goal.projects.some((project) => project.id === taskProjectIdInput));
      const goalIdForInsert = projectGoal?.parentGoalId ?? projectGoal?.id ?? null;

      const payload: Record<string, string | null> = {
        id: taskId,
        name: trimmedName,
        stage: taskStageInput,
        project_id: taskProjectIdInput,
        user_id: resolvedUserId,
        goal_id: goalIdForInsert,
        skill_id: taskSkillIdInput || null,
        priority: taskPriorityInput,
        energy: taskEnergyInput,
      };

      const { error } = await supabase.from("tasks").insert(payload);
      if (error) {
        setTaskFormError("Failed to save task. Please try again.");
        console.error("Failed to create task from skill project modal", error);
        return;
      }

      const newTask = {
        id: taskId,
        name: trimmedName,
        stage: taskStageInput,
        skillId: taskSkillIdInput || null,
        priorityCode: taskPriorityInput,
        isNew: false,
      };

      setProjects((prev) =>
        prev.map((goal) => {
          const updatedProjects = goal.projects.map((project) => {
            if (project.id !== taskProjectIdInput) return project;
            const updatedTasks = [...project.tasks, newTask];
            const total = updatedTasks.length;
            const done = updatedTasks.filter((task) => task.stage === "PERFECT").length;
            const progress = total ? Math.round((done / total) * 100) : 0;
            const schedulerTasks = updatedTasks.map(toSchedulerTask);
            const relatedTaskWeightSum = schedulerTasks.reduce((sum, t) => sum + taskWeight(t), 0);
            const weightValue = projectWeight(
              toSchedulerProject({
                id: project.id,
                priorityCode: project.priorityCode ?? undefined,
                stage: project.stage ?? undefined,
                dueDate: project.dueDate ?? null,
              }),
              relatedTaskWeightSum
            );
            return {
              ...project,
              tasks: updatedTasks,
              progress,
              weight: weightValue,
            };
          });

          const goalProgress =
            updatedProjects.length > 0
              ? Math.round(
                  updatedProjects.reduce((sum, project) => sum + (project.progress ?? 0), 0) /
                    updatedProjects.length
                )
              : 0;

          return decorate({
            ...goal,
            projects: updatedProjects,
            progress: goalProgress,
          });
        })
      );

      setTaskFormOpenForGoalId(null);
    } finally {
      setTaskSaving(false);
    }
  }, [
    decorate,
    projects,
    taskEnergyInput,
    taskFormOpenForGoalId,
    taskNameInput,
    taskPriorityInput,
    taskProjectIdInput,
    taskSkillIdInput,
    taskStageInput,
    userId,
  ]);

  const availableProjects = useMemo(
    () =>
      projects.flatMap((goal) =>
        goal.projects.map((project) => ({
          id: project.id,
          title: project.name,
        }))
      ),
    [projects]
  );

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="-mx-3 grid grid-cols-3 gap-2.5 px-3 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px] w-full rounded-2xl bg-white/10" />
          ))}
        </div>
      );
    }

    if (projects.length === 0) {
      return (
        <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 text-center text-sm text-[#A7B0BD] shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
          No projects linked to this skill yet.
        </Card>
      );
    }

    return (
      <div className="-mx-3 grid grid-cols-3 gap-2.5 px-3 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {projects.map((goal) => (
          <div key={goal.id} className="skill-project-card-wrapper relative z-0 w-full isolate min-w-0">
            <GoalCard
              goal={goal}
              showWeight={false}
              showCreatedAt={false}
              showEmojiPrefix={false}
              variant="compact"
              projectDropdownMode="tasks-only"
              onEdit={() => handleGoalEdit(goal)}
              open={openGoalId === goal.id}
              onOpenChange={(isOpen) => handleGoalOpenChange(goal.id, isOpen)}
              onProjectUpdated={(projectId, updates) =>
                handleProjectUpdated(goal.id, projectId, updates)
              }
              onTaskToggleCompletion={handleTaskToggleCompletion}
              onAddTask={handleTaskCreate}
              onProjectHoldComplete={(goalId, projectId, stage) =>
                handleProjectToggleCompletion(goalId, projectId, stage)
              }
              onProjectDeleted={() => handleProjectDeleted(goal.id)}
            />
          </div>
        ))}
      </div>
    );
  }, [
    loading,
    projects,
    openGoalId,
    handleGoalOpenChange,
    handleProjectUpdated,
    handleProjectDeleted,
    handleTaskCreate,
  ]);

  return (
    <div className="skill-projects-list">
      {content}
      {taskFormOpenForGoalId ? (
        <div className="fixed inset-0 z-[85] flex items-center justify-center px-4 py-8">
          <button
            type="button"
            className="absolute inset-0 bg-black/75"
            aria-label="Close task creation"
            onClick={handleTaskModalClose}
          />
          <div className="relative z-[90] w-full max-w-lg rounded-2xl border border-white/15 bg-[#090b12] p-5 text-white shadow-[0_30px_60px_rgba(0,0,0,0.7)]">
            <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/80">
              Add a new task
            </h3>
            <p className="mt-1 text-xs text-white/60">
              Fill out task details and save to the selected project.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block text-xs uppercase tracking-[0.18em] text-white/65">
                Task name
                <Input
                  value={taskNameInput}
                  onChange={(event) => setTaskNameInput(event.target.value)}
                  placeholder="Name this task"
                  className="mt-1 border-white/20 bg-white/5 text-white placeholder:text-white/45"
                />
              </label>

              <label className="block text-xs uppercase tracking-[0.18em] text-white/65">
                Skill relation
                <select
                  value={taskSkillIdInput}
                  onChange={(event) => setTaskSkillIdInput(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                >
                  <option value="" className="bg-[#0d111b] text-white">No skill</option>
                  {skillOptions.map((skill) => (
                    <option key={skill.id} value={skill.id} className="bg-[#0d111b] text-white">
                      {skill.icon ? `${skill.icon} ` : ""}
                      {skill.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs uppercase tracking-[0.18em] text-white/65">
                Project relation
                <select
                  value={taskProjectIdInput}
                  onChange={(event) => setTaskProjectIdInput(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                >
                  {availableProjects.map((project) => (
                    <option key={project.id} value={project.id} className="bg-[#0d111b] text-white">
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs uppercase tracking-[0.18em] text-white/65">
                  Energy
                  <select
                    value={taskEnergyInput}
                    onChange={(event) => setTaskEnergyInput(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                  >
                    {["NO", "LOW", "MEDIUM", "HIGH", "ULTRA", "EXTREME"].map((value) => (
                      <option key={value} value={value} className="bg-[#0d111b] text-white">
                        {value}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs uppercase tracking-[0.18em] text-white/65">
                  Stage
                  <select
                    value={taskStageInput}
                    onChange={(event) => setTaskStageInput(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                  >
                    {["PREPARE", "PRODUCE", "PERFECT"].map((value) => (
                      <option key={value} value={value} className="bg-[#0d111b] text-white">
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-xs uppercase tracking-[0.18em] text-white/65">
                Priority
                <select
                  value={taskPriorityInput}
                  onChange={(event) => setTaskPriorityInput(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-400/60"
                >
                  {["NO", "LOW", "MEDIUM", "HIGH", "CRITICAL", "ULTRA-CRITICAL"].map((value) => (
                    <option key={value} value={value} className="bg-[#0d111b] text-white">
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              {taskFormError ? (
                <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {taskFormError}
                </p>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleTaskModalClose}
                disabled={taskSaving}
              >
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleTaskModalSubmit()} disabled={taskSaving}>
                {taskSaving ? "Saving..." : "Save task"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <style jsx global>{`
        .skill-projects-list .group { transform: none !important; will-change: auto !important; z-index: 0 !important; }
        .skill-projects-list .group:hover { transform: none !important; }
        @media (min-width: 640px) {
          .skill-projects-list .skill-project-card-wrapper { isolation: isolate; content-visibility: auto; contain-intrinsic-size: 300px 1px; }
        }
      `}</style>
      <GoalDrawer
        key={editingGoal?.id ?? (drawerOpen ? "goal-editor" : "goal-editor-closed")}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditingGoal(null);
        }}
        initialGoal={editingGoal}
        monuments={monumentOptions}
        onAdd={() => {}}
        onUpdate={handleGoalUpdated}
        onDelete={handleGoalDeleted}
      />
    </div>
  );
}

export default SkillProjectsList;
