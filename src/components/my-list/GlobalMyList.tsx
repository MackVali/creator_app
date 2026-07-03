"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import {
  MyListSheet,
  type MyListTaskXpContext,
} from "@/components/my-list/MyListSheet";
import {
  hapticComplete,
  hapticPress,
  hapticWarningPattern,
} from "@/lib/haptics/creatorHaptics";
import { getCatsForUser } from "@/lib/data/cats";
import { getSkillsForUser } from "@/lib/data/skills";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  fetchReadyTasks,
  updateMyListTaskCompletion,
  updateTaskSkill,
} from "@/lib/scheduler/repo";
import type { TaskLite } from "@/lib/scheduler/weight";
import type { CatRow } from "@/lib/types/cat";
import type { SkillRow } from "@/lib/types/skill";
import { dispatchCreatorXpRewardVisual } from "@/lib/effects/creatorXpRewardVisual";
import {
  dispatchCreatorXpBurstStatus,
  type CreatorXpBurstRect,
} from "@/lib/effects/creatorXpBurstBus";

type MyListXpAwardResult = {
  success?: boolean;
  inserted?: number;
  deduped?: boolean;
  skipped?: boolean;
  reason?: string;
  awardKeyBase?: string;
  activePositiveCount?: number;
  alreadyReversedCount?: number;
  surge?: Parameters<typeof dispatchCreatorXpRewardVisual>[0]["surge"];
};

type MyListXpReverseResult = {
  success?: boolean;
  reversed?: number;
  alreadyReversed?: number;
  activePositivesFound?: number;
  insertedReversalKeys?: string[];
  error?: string;
};

const MY_LIST_TASK_XP_AMOUNT = 1;

function buildMyListTaskOccurrenceStem(taskId: string) {
  return `my_list:task:${taskId}`;
}

function reportMyListXpDiagnostic(message: string, details?: unknown) {
  if (process.env.NODE_ENV === "production") return;
  dispatchCreatorXpBurstStatus(message);
  console.info(message, details ?? {});
}

async function reverseMyListTaskXp(taskId: string) {
  const occurrenceStem = buildMyListTaskOccurrenceStem(taskId);
  const response = await fetch("/api/xp/reverse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ occurrenceStem }),
  });

  const result = (await response.json().catch(() => null)) as
    | MyListXpReverseResult
    | null;
  if (!response.ok) {
    throw new Error(
      result?.error ?? `XP reverse request failed (${response.status})`
    );
  }
  return result;
}

async function awardMyListTaskXp({
  task,
  skillId,
  monumentId,
  completedAt,
}: {
  task: TaskLite;
  skillId: string;
  monumentId: string | null;
  completedAt: string;
}) {
  const occurrenceStem = buildMyListTaskOccurrenceStem(task.id);
  const body: Record<string, unknown> = {
    kind: "task",
    amount: MY_LIST_TASK_XP_AMOUNT,
    skillIds: [skillId],
    awardKeyBase: occurrenceStem,
    reversible: { occurrenceStem },
    source: "my-list",
    completion: {
      action: "complete",
      sourceType: "TASK",
      sourceId: task.id,
      completedAt,
      wasScheduled: false,
      durationMin:
        typeof task.duration_min === "number" && Number.isFinite(task.duration_min)
          ? Math.max(0, Math.round(task.duration_min))
          : null,
    },
  };
  if (monumentId) {
    body.monumentIds = [monumentId];
  }

  const response = await fetch("/api/xp/award", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const result = (await response.json().catch(() => null)) as
    | MyListXpAwardResult
    | null;
  if (!response.ok) {
    throw new Error(result?.reason ?? `XP award request failed (${response.status})`);
  }
  return result;
}

export function GlobalMyList({
  useFullExpandedHeight,
}: {
  useFullExpandedHeight: boolean;
}) {
  const { user, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [skillCategories, setSkillCategories] = useState<CatRow[]>([]);
  const [scheduledTaskIds, setScheduledTaskIds] = useState<Set<string>>(
    () => new Set()
  );
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(
    () => new Set()
  );
  const previousStageRef = useRef<Map<string, TaskLite["stage"]>>(new Map());

  useEffect(() => {
    if (!ready || !user?.id) {
      setTasks([]);
      setSkills([]);
      setSkillCategories([]);
      setScheduledTaskIds(new Set());
      return;
    }

    let active = true;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    const loadMyListData = async () => {
      const [taskRows, skillRows, categoryRows, scheduledRowsResult] =
        await Promise.all([
          fetchReadyTasks(supabase),
          getSkillsForUser(user.id),
          getCatsForUser(user.id, supabase),
          supabase
            .from("schedule_instances")
            .select("source_id")
            .eq("user_id", user.id)
            .eq("source_type", "TASK")
            .not("source_id", "is", null),
        ]);

      if (!active) return;
      if (scheduledRowsResult.error) {
        throw scheduledRowsResult.error;
      }

      setTasks(taskRows);
      setSkills(skillRows);
      setSkillCategories(categoryRows);
      setScheduledTaskIds(
        new Set(
          (scheduledRowsResult.data ?? [])
            .map((row) =>
              typeof row.source_id === "string" ? row.source_id : null
            )
            .filter((sourceId): sourceId is string => Boolean(sourceId))
        )
      );
    };

    void loadMyListData().catch(() => {
      if (!active) return;
      setTasks([]);
      setSkills([]);
      setSkillCategories([]);
      setScheduledTaskIds(new Set());
    });

    return () => {
      active = false;
    };
  }, [ready, user?.id]);

  const myListTasks = useMemo(
    () =>
      tasks
        .filter(
          (task) =>
            !task.goal_id && !task.project_id && !scheduledTaskIds.has(task.id)
        )
        .sort((left, right) => {
          const leftDone = left.stage?.toString().toUpperCase() === "PERFECT";
          const rightDone = right.stage?.toString().toUpperCase() === "PERFECT";
          if (leftDone !== rightDone) return leftDone ? 1 : -1;
          return left.name.localeCompare(right.name);
        }),
    [scheduledTaskIds, tasks]
  );

  const handleTaskSkillSelect = useCallback((taskId: string, skill: SkillRow) => {
    setTasks((currentTasks) =>
      currentTasks.map((item) =>
        item.id === taskId
          ? {
              ...item,
              skill_id: skill.id,
              skill_icon: skill.icon ?? null,
              skill_monument_id: skill.monument_id ?? null,
            }
          : item
      )
    );

    void updateTaskSkill(taskId, skill.id).then(({ error }) => {
      if (error) {
        reportMyListXpDiagnostic("MY LIST XP BLOCKED: failed to persist skill", {
          taskId,
          skillId: skill.id,
          error,
        });
      }
    });
  }, []);

  const handleToggleTask = useCallback(
    async (
      taskId: string,
      sourceRect: CreatorXpBurstRect | null,
      xpContext: MyListTaskXpContext
    ) => {
      const task = tasks.find((item) => item.id === taskId);
      if (!task) return;
      if (pendingTaskIds.has(taskId)) {
        void hapticWarningPattern();
        return;
      }

      const currentStage = task.stage;
      const isCurrentlyCompleted = currentStage === "PERFECT";
      const snapshots = previousStageRef.current;
      let nextStage: TaskLite["stage"];

      if (isCurrentlyCompleted) {
        nextStage = snapshots.get(taskId) ?? "PRODUCE";
      } else {
        snapshots.set(taskId, currentStage);
        nextStage = "PERFECT";
      }

      if (nextStage === currentStage) {
        if (!isCurrentlyCompleted) snapshots.delete(taskId);
        return;
      }

      const selectedSkillId = xpContext.skillId?.trim() || task.skill_id?.trim();
      const selectedMonumentId =
        xpContext.monumentId?.trim() || task.skill_monument_id?.trim() || null;

      if (!isCurrentlyCompleted && !selectedSkillId) {
        snapshots.delete(taskId);
        reportMyListXpDiagnostic("MY LIST XP BLOCKED: missing skill context", {
          occurrenceStem: buildMyListTaskOccurrenceStem(taskId),
          taskId,
          taskSkillId: task.skill_id ?? null,
          selectedSkillId: xpContext.skillId ?? null,
        });
        void hapticWarningPattern();
        return;
      }

      setPendingTaskIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(taskId);
        return nextIds;
      });

      try {
        if (isCurrentlyCompleted) {
          const { error } = await updateMyListTaskCompletion(
            taskId,
            nextStage,
            null
          );
          if (error) throw error;

          const reverseResult = await reverseMyListTaskXp(taskId);
          reportMyListXpDiagnostic("MY LIST XP: reversed", {
            occurrenceStem: buildMyListTaskOccurrenceStem(taskId),
            taskId,
            reversed: reverseResult?.reversed ?? 0,
            activePositivesFound: reverseResult?.activePositivesFound ?? 0,
          });

          snapshots.delete(taskId);
          setTasks((currentTasks) =>
            currentTasks.map((item) =>
              item.id === taskId ? { ...item, stage: nextStage } : item
            )
          );
          return;
        }

        await reverseMyListTaskXp(taskId);

        if (!selectedSkillId) {
          throw new Error("MY LIST XP BLOCKED: missing skill context");
        }

        const skillIdForAward = selectedSkillId;

        if (skillIdForAward !== task.skill_id) {
          const { error: skillError } = await updateTaskSkill(
            taskId,
            skillIdForAward
          );
          if (skillError) throw skillError;
        }

        const completedAt = new Date().toISOString();
        const { error } = await updateMyListTaskCompletion(
          taskId,
          "PERFECT",
          completedAt
        );
        if (error) throw error;

        const awardResult = await awardMyListTaskXp({
          task,
          skillId: skillIdForAward,
          monumentId: selectedMonumentId,
          completedAt,
        });

        if ((awardResult?.inserted ?? 0) <= 0) {
          throw new Error(
            awardResult?.reason ??
              (awardResult?.deduped
                ? "XP award deduped"
                : "XP award inserted no rows")
          );
        }

        setTasks((currentTasks) =>
          currentTasks.map((item) =>
            item.id === taskId
              ? {
                  ...item,
                  stage: "PERFECT",
                  skill_id: skillIdForAward,
                  skill_monument_id: selectedMonumentId,
                }
              : item
          )
        );

        if (awardResult?.surge) {
          dispatchCreatorXpRewardVisual({
            surge: awardResult.surge,
            completedAt,
            sourceRect,
            sourceOrigin: "card",
            amount: MY_LIST_TASK_XP_AMOUNT,
            kind: "task_complete",
            burstId: `my-list:task:${taskId}:${completedAt}`,
            debugLabel: "XP: my list visual helper",
          });
        } else {
          reportMyListXpDiagnostic("MY LIST XP: inserted without surge", {
            occurrenceStem: buildMyListTaskOccurrenceStem(taskId),
            taskId,
            awardKeyBase: awardResult?.awardKeyBase ?? null,
          });
        }

        void hapticComplete();
      } catch (error) {
        reportMyListXpDiagnostic("MY LIST XP: mutation failed", {
          occurrenceStem: buildMyListTaskOccurrenceStem(taskId),
          taskId,
          action: isCurrentlyCompleted ? "undo" : "complete",
          error,
        });
        if (!isCurrentlyCompleted) {
          const { error: rollbackError } = await updateMyListTaskCompletion(
            taskId,
            currentStage,
            null
          );
          if (rollbackError) {
            reportMyListXpDiagnostic("MY LIST XP: completion rollback failed", {
              occurrenceStem: buildMyListTaskOccurrenceStem(taskId),
              taskId,
              error: rollbackError,
            });
          }
        } else {
          const { error: rollbackError } = await updateMyListTaskCompletion(
            taskId,
            "PERFECT",
            new Date().toISOString()
          );
          if (rollbackError) {
            reportMyListXpDiagnostic("MY LIST XP: undo rollback failed", {
              occurrenceStem: buildMyListTaskOccurrenceStem(taskId),
              taskId,
              error: rollbackError,
            });
          }
        }
        if (!isCurrentlyCompleted) snapshots.delete(taskId);
        void hapticWarningPattern();
      } finally {
        setPendingTaskIds((currentIds) => {
          const nextIds = new Set(currentIds);
          nextIds.delete(taskId);
          return nextIds;
        });
      }
    },
    [pendingTaskIds, tasks]
  );

  return (
    <MyListSheet
      open={open}
      tasks={myListTasks}
      skills={skills}
      skillCategories={skillCategories}
      pendingTaskIds={pendingTaskIds}
      useFullExpandedHeight={useFullExpandedHeight}
      onToggleTask={handleToggleTask}
      onTaskSkillSelect={handleTaskSkillSelect}
      onOpenChange={(nextOpen) => {
        void hapticPress();
        setOpen(nextOpen);
      }}
    />
  );
}
