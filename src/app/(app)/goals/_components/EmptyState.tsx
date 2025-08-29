"use client";

import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  onCreate: () => void;
}

export function EmptyState({ onCreate }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="mb-4 text-gray-400">No goals yet</p>
      <Button onClick={onCreate}>Create Goal</Button>
    </div>
  );
}
