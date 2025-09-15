"use client";

import { Plus } from "lucide-react";

interface GoalsHeaderProps {
  onCreate(): void;
}

export function GoalsHeader({ onCreate }: GoalsHeaderProps) {
  return (
    <header className="px-4 py-4 flex items-center justify-between bg-surface text-surface-foreground">
      <div>
        <h1 className="text-2xl font-bold">Goals</h1>
        <p className="text-sm text-gray-400">Track and manage your goals</p>
      </div>
      <button
        onClick={onCreate}
        className="flex items-center gap-2 bg-primary hover:bg-primary/90 active:bg-primary/80 px-3 py-2 rounded-md text-sm text-primary-foreground"
      >
        <Plus className="w-4 h-4" /> Create Goal
      </button>
    </header>
  );
}
