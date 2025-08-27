'use client';

import { GoalCard } from '@/components/ui/GoalCard';
import { Skeleton } from '@/components/ui/skeleton';
import type { GoalRow } from '@/lib/data/goals';
import React from 'react';

type Props = { goals: GoalRow[] };

function FilteredGoalsGrid({ goals }: Props) {
  if (!goals.length) {
    return (
      <div className="text-center py-12 text-sm text-slate-400">
        No related goals yet.
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

FilteredGoalsGrid.Skeleton = function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-lg" />
      ))}
    </div>
  );
};

export default FilteredGoalsGrid;
