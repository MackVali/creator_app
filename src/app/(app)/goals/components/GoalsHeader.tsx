"use client";

import { Plus } from "lucide-react";

interface GoalsHeaderProps {
  onCreate(): void;
}

export function GoalsHeader({ onCreate }: GoalsHeaderProps) {
  return (
    <header className="px-4 py-4 flex items-center justify-between bg-[#1E1E1E]">
      <div>
        <h1 className="text-2xl font-bold">Goals</h1>
        <p className="text-sm text-[#A0A0A0]">Track and manage your goals</p>
      </div>
      <button
        onClick={onCreate}
        className="flex items-center gap-2 bg-[#2B2B2B] border border-[#3C3C3C] text-[#E0E0E0] px-3 py-2 rounded-md text-sm hover:bg-[#353535] active:bg-[#353535]"
      >
        <Plus className="w-4 h-4" /> Create Goal
      </button>
    </header>
  );
}
