"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useFilteredGoals } from "@/lib/hooks/useFilteredGoals";
import { getSupabaseBrowser } from "@/lib/supabase";

import { GoalFolderCard } from "@/app/(app)/dashboard/components/GoalFolderCard";
import type { Goal, Project } from "@/app/(app)/goals/types";

interface FilteredGoalsGridProps {
  entity: "monument" | "skill";
  id: string;
  onCreateGoal?: () => void;
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 justify-items-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-3">
          <Skeleton className="h-[140px] w-[120px] rounded-[26px] bg-[#111520]" />
          <Skeleton className="h-4 w-24 rounded-full bg-[#111520]" />
        </div>
      ))}
    </div>
  );
}

function mapPriority(priority: string): Goal["priority"] {
  switch (priority) {
    case "HIGH":
    case "CRITICAL":
    case "ULTRA-CRITICAL":
      return "High";
    case "MEDIUM":
      return "Medium";
    default:
      return "Low";
  }
}

function mapEnergy(energy: string): Goal["energy"] {
  switch (energy) {
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

export function FilteredGoalsGrid({ entity, id, onCreateGoal }: FilteredGoalsGridProps) {
  const { goals, loading: goalsLoading, error } = useFilteredGoals({ entity, id, limit: 12 });
  const [active, setActive] = useState("Active");
  const [goalFolders, setGoalFolders] = useState<Goal[]>([]);
  const [projLoading, setProjLoading] = useState(true);

  useEffect(() => {
    const loadProjects = async () => {
      if (!goals || goals.length === 0) {
        setGoalFolders([]);
        setProjLoading(false);
        return;
      }

      const supabase = getSupabaseBrowser();
      if (!supabase) return;

      setProjLoading(true);

      const goalIds = goals.map((g) => g.id);
      const { data: projectsData } = await supabase
        .from("projects")
        .select("id,name,goal_id,stage,energy,due_date")
        .in("goal_id", goalIds);

      const projectsByGoal: Record<string, Project[]> = {};
      projectsData?.forEach((p) => {
        const proj: Project = {
          id: p.id,
          name: p.name,
          status: projectStageToStatus(p.stage),
          progress: 0,
          energy: mapEnergy(p.energy),
          tasks: [],
          dueDate: p.due_date || undefined,
        };
        projectsByGoal[p.goal_id] = projectsByGoal[p.goal_id] || [];
        projectsByGoal[p.goal_id].push(proj);
      });

      const mapped: Goal[] = goals.map((g) => {
        const status = goalStatusToStatus(g.status);
        return {
          id: g.id,
          title: g.name,
          emoji: g.emoji ?? undefined,
          dueDate: g.due_date ?? undefined,
          priority: mapPriority(g.priority),
          energy: mapEnergy(g.energy),
          progress: 0,
          status,
          active: g.active ?? status === "Active",
          updatedAt: g.updated_at ?? g.created_at,
          projects: projectsByGoal[g.id] || [],
        };
      });

      setGoalFolders(mapped);
      setProjLoading(false);
    };

    if (!goalsLoading) {
      loadProjects();
    }
  }, [goals, goalsLoading]);

  const loading = goalsLoading || projLoading;

  const filteredGoalFolders = goalFolders.filter((goal) => {
    switch (active) {
      case "Blocked":
        return goal.status === "Inactive" || goal.status === "Overdue";
      case "Completed":
        return goal.status === "Completed";
      case "Active":
      default:
        return goal.status === "Active";
    }
  });

  const emptyDescription =
    entity === "monument"
      ? "No goals linked to this monument."
      : "No goals linked to this skill.";

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {(["Active", "Blocked", "Completed"] as const).map((f) => (
          <Badge
            key={f}
            variant={active === f ? "default" : "outline"}
            className="px-3 py-1 cursor-pointer"
            aria-label={`Show ${f} goals`}
            onClick={() => setActive(f)}
          >
            {f}
          </Badge>
        ))}
      </div>

      {loading ? (
        <GridSkeleton />
      ) : error ? (
        <div className="text-center py-8">
          <p className="text-red-400 mb-2">Error loading goals</p>
          <p className="text-sm text-gray-400">{error}</p>
        </div>
      ) : goalFolders.length === 0 ? (
        <Card className="rounded-2xl border border-white/5 bg-[#111520] p-6 text-center shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
          <p className="mb-4 text-sm text-[#A7B0BD]">{emptyDescription}</p>
          {onCreateGoal ? (
            <Button variant="outline" onClick={onCreateGoal}>
              + Goal
            </Button>
          ) : null}
        </Card>
      ) : filteredGoalFolders.length === 0 ? (
        <Card className="rounded-2xl border border-white/5 bg-[#111520] p-6 text-center shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
          <p className="text-sm text-[#A7B0BD]">
            {`No ${active.toLowerCase()} goals linked to this ${entity === "monument" ? "monument" : "skill"}.`}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 justify-items-center">
          {filteredGoalFolders.map((goal) => (
            <GoalFolderCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}
    </div>
  );
}
