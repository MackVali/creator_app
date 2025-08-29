"use client";

import { Button } from "@/components/ui/button";

interface GoalsHeaderProps {
  onOpenCreate: () => void;
}

export function GoalsHeader({ onOpenCreate }: GoalsHeaderProps) {
  return (
    <header className="flex items-center justify-between py-4">
      <div>
        <h1 className="text-2xl font-semibold">Goals</h1>
        <p className="text-sm text-gray-400">Track and manage your goals</p>
      </div>
      <Button onClick={onOpenCreate} className="shrink-0">
        + Create Goal
      </Button>
    </header>
  );
}
