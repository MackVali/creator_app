"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import GoalCardMini from "@/components/goals/GoalCardMini";
import { useFilteredGoals } from "@/lib/hooks/useFilteredGoals";

interface GoalsPanelProps {
  monumentId: string;
}

const FILTERS = ["Active", "Blocked", "Completed"] as const;
type Filter = (typeof FILTERS)[number];

export function GoalsPanel({ monumentId }: GoalsPanelProps) {
  const [filter, setFilter] = useState<Filter>("Active");
  const { goals, loading, error } = useFilteredGoals({
    entity: "monument",
    id: monumentId,
    limit: 50,
  });

  const filteredGoals = useMemo(() => {
    const desired = filter.toLowerCase();
    return (goals || [])
      .filter((g) => (g.status || "").toLowerCase() === desired)
      .sort((a, b) => {
        const aDue = a.next_action_due
          ? new Date(a.next_action_due).getTime()
          : Number.POSITIVE_INFINITY;
        const bDue = b.next_action_due
          ? new Date(b.next_action_due).getTime()
          : Number.POSITIVE_INFINITY;
        return aDue - bDue;
      });
  }, [goals, filter]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
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

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
          >
            {f}
          </Button>
        ))}
      </div>
      {filteredGoals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No {filter.toLowerCase()} goals
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGoals.map((goal) => (
            <GoalCardMini key={goal.id} goal={goal} />
          ))}
        </div>
      )}
    </div>
  );
}

export default GoalsPanel;
