"use client";

import { useState } from "react";
import { GoalCard } from "@/components/ui/GoalCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFilteredGoals } from "@/lib/hooks/useFilteredGoals";

interface FilteredGoalsGridProps {
  entity: "monument" | "skill";
  id: string;
  onCreateGoal?: () => void;
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-lg" />
      ))}
    </div>
  );
}

export function FilteredGoalsGrid({ entity, id, onCreateGoal }: FilteredGoalsGridProps) {
  const { goals, loading, error } = useFilteredGoals({ entity, id, limit: 12 });
  const [active, setActive] = useState("Active");

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {(["Active", "Blocked", "Completed"] as const).map((f) => (
          <Badge
            key={f}
            variant={active === f ? "default" : "outline"}
            className="px-3 py-1 cursor-pointer"
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
      ) : !goals || goals.length === 0 ? (
        <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4">
          <p className="text-[#A7B0BD] mb-4">No goals linked to this monument.</p>
          <Button variant="outline" onClick={onCreateGoal}>+ Goal</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} showLink={false} />
          ))}
        </div>
      )}
    </div>
  );
}
