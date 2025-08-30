"use client";

import { GoalCard } from "@/app/(app)/goals/components/GoalCard";
import type { Goal } from "@/app/(app)/goals/types";

interface GoalCardGridProps {
  goals: Goal[];
  onEdit(goal: Goal): void;
  onToggleActive(id: string): void;
}

export function GoalCardGrid({ goals, onEdit, onToggleActive }: GoalCardGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {goals.map((goal) => (
        <GoalCard
          key={goal.id}
          goal={goal}
          onEdit={onEdit}
          onToggleActive={onToggleActive}
        />
      ))}
    </div>
  );
}

