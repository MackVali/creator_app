"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useFilteredGoals } from "@/lib/hooks/useFilteredGoals";
import { getSupabaseBrowser } from "@/lib/supabase";

import { GoalCard as GoalFolder } from "@/app/(app)/goals/components/GoalCard";
import type { Goal, Project } from "@/app/(app)/goals/types";

interface FilteredGoalsGridProps {
  entity: "monument" | "skill";
  id: string;
  onCreateGoal?: () => void;
  onCountChange?: (count: number) => void;
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-2xl bg-[#111520]" />
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

export function FilteredGoalsGrid({ entity, id, onCreateGoal, onCountChange }: FilteredGoalsGridProps) {
  const { goals, loading: goalsLoading, error } = useFilteredGoals({ entity, id, limit: 12 });
  const [active, setActive] = useState("Active");
  const [goalFolders, setGoalFolders] = useState<Goal[]>([]);
  const [projLoading, setProjLoading] = useState(true);

  useEffect(() => {
    const loadProjects = async () => {
      if (!goals || goals.length === 0) {
        setGoalFolders([]);
        setProjLoading(false);
        onCountChange?.(0);
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

      const mapped: Goal[] = goals.map((g) => ({
        id: g.id,
        title: g.name,
        priority: mapPriority(g.priority),
        energy: mapEnergy(g.energy),
        progress: 0,
        status: "Active",
        active: true,
        updatedAt: g.created_at,
        projects: projectsByGoal[g.id] || [],
      }));

      setGoalFolders(mapped);
      onCountChange?.(mapped.length);
      setProjLoading(false);
    };

    if (!goalsLoading) {
      loadProjects();
    }
  }, [goals, goalsLoading, onCountChange]);

  const loading = goalsLoading || projLoading;

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
        <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
          <p className="text-[#A7B0BD] mb-4">No goals linked to this monument.</p>
          <Button variant="outline" onClick={onCreateGoal}>+ Goal</Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {goalFolders.map((goal) => (
            <GoalFolder key={goal.id} goal={goal} />
          ))}
        </div>
      )}
    </div>
  );
}
