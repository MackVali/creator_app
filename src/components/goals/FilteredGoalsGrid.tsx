"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useFilteredGoals } from "@/lib/hooks/useFilteredGoals";
import { getSupabaseBrowser } from "@/lib/supabase";

import { GoalFolderCard } from "@/components/goals/GoalFolderCard";
import type { Goal, Project } from "@/app/(app)/goals/types";

interface FilteredGoalsGridProps {
  entity: "monument" | "skill";
  id: string;
  onCreateGoal?: () => void;
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 justify-items-center gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-[140px] w-[110px] rounded-[26px] bg-white/10"
        />
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

  const matchesFilter = (goal: Goal) => {
    const status = goal.status ?? (goal.active === false ? "Inactive" : "Active");

    switch (active) {
      case "Active":
        return status === "Active" && goal.active !== false;
      case "Blocked":
        return (
          status === "Inactive" ||
          status === "Overdue" ||
          goal.active === false
        );
      case "Completed":
        return status === "Completed";
      default:
        return true;
    }
  };

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
        const isActive = g.active ?? status === "Active";

        return {
          id: g.id,
          title: g.name,
          priority: mapPriority(g.priority),
          energy: mapEnergy(g.energy),
          progress: 0,
          status,
          active: isActive,
          updatedAt: g.created_at,
          projects: projectsByGoal[g.id] || [],
          monumentId: g.monument_id ?? undefined,
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
  const filteredGoalFolders = goalFolders.filter(matchesFilter);
  const hasGoals = goalFolders.length > 0;
  const hasFilteredGoals = filteredGoalFolders.length > 0;
  const emptyStateMessage =
    entity === "skill"
      ? "No goals linked to this skill yet."
      : "No goals linked to this monument yet.";
  const filterEmptyMessage =
    active === "Active"
      ? "No active goals right now."
      : active === "Blocked"
      ? "No blocked goals right now."
      : "No completed goals yet.";

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
      ) : !hasGoals ? (
        <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
          <p className="text-[#A7B0BD] mb-4">{emptyStateMessage}</p>
          {onCreateGoal ? (
            <Button variant="outline" onClick={onCreateGoal}>+ Goal</Button>
          ) : null}
        </Card>
      ) : !hasFilteredGoals ? (
        <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 text-center text-sm text-[#A7B0BD] shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
          {filterEmptyMessage}
        </Card>
      ) : (
        <div className="grid grid-cols-1 justify-items-center gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredGoalFolders.map((goal) => (
            <GoalFolderCard key={goal.id} goal={goal} size={0.52} />
          ))}
        </div>
      )}
    </div>
  );
}
