"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { MyListSheet } from "@/components/my-list/MyListSheet";
import { hapticPress, hapticWarningPattern } from "@/lib/haptics/creatorHaptics";
import { getCatsForUser } from "@/lib/data/cats";
import { getSkillsForUser } from "@/lib/data/skills";
import { getSupabaseBrowser } from "@/lib/supabase";
import { fetchReadyTasks, updateTaskStage } from "@/lib/scheduler/repo";
import type { TaskLite } from "@/lib/scheduler/weight";
import type { CatRow } from "@/lib/types/cat";
import type { SkillRow } from "@/lib/types/skill";

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

  const handleToggleTask = useCallback(
    async (taskId: string) => {
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

      setPendingTaskIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(taskId);
        return nextIds;
      });
      setTasks((currentTasks) =>
        currentTasks.map((item) =>
          item.id === taskId ? { ...item, stage: nextStage } : item
        )
      );

      try {
        const { error } = await updateTaskStage(taskId, nextStage);
        if (error) throw error;
        if (isCurrentlyCompleted) snapshots.delete(taskId);
      } catch {
        setTasks((currentTasks) =>
          currentTasks.map((item) =>
            item.id === taskId ? { ...item, stage: currentStage } : item
          )
        );
        if (!isCurrentlyCompleted) snapshots.delete(taskId);
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
      onOpenChange={(nextOpen) => {
        void hapticPress();
        setOpen(nextOpen);
      }}
    />
  );
}
