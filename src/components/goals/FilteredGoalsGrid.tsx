"use client";

import { GoalCard } from "@/components/ui/GoalCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useFilteredGoals } from "@/lib/hooks/useFilteredGoals";

interface FilteredGoalsGridProps {
  entity: "monument" | "skill";
  id: string;
}

export function FilteredGoalsGrid({ entity, id }: FilteredGoalsGridProps) {
  const { goals, loading, error } = useFilteredGoals({ entity, id, limit: 12 });

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-400 mb-2">Error loading goals</p>
        <p className="text-sm text-gray-400">{error}</p>
      </div>
    );
  }

  if (!goals || goals.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4" role="img" aria-hidden="true">
          🎯
        </div>
        <h3 className="text-lg font-medium text-white mb-2">
          No related goals yet
        </h3>
        <p className="text-gray-400 text-sm">
          {entity === "monument"
            ? "Goals linked to this monument will appear here."
            : "Goals that use this skill will appear here."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {goals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} showLink={false} />
      ))}
    </div>
  );
}
