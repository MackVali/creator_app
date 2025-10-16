"use client";

import { Plus } from "lucide-react";

interface GoalsHeaderProps {
  onCreate(): void;
}

export function GoalsHeader({ onCreate }: GoalsHeaderProps) {
  return (
    <header className="flex flex-col gap-6 pb-6 pt-10 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/60 backdrop-blur">
          Planner Suite
        </span>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Goals
          </h1>
          <p className="max-w-xl text-sm text-white/60">
            Curate a portfolio of ambitions, align your projects, and keep the momentum with refined tracking tools.
          </p>
        </div>
      </div>
      <button
        onClick={onCreate}
        className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/30 transition hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full border border-white/30 bg-white/10 text-white transition group-hover:rotate-6">
          <Plus className="h-3.5 w-3.5" />
        </span>
        Create Goal
      </button>
    </header>
  );
}
